import 'dotenv/config'
import { Worker, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { supabase } from '@hive/db'
import { assembleContext, buildSystemPrompt, hydrateAgentMemoryBlock, extractAndSaveMemories } from '@hive/memory'
import { callModel } from './lib/model-router'
import { logEvent } from './lib/telemetry'
import { checkBudget, recordSpend } from './lib/budget'
import type { Subtask } from '@hive/shared'
import { buildToolsPrompt } from '@hive/tools'
import { processToolCalls } from './lib/tool-runner'

const redisUrl = process.env.UPSTASH_REDIS_URL
if (!redisUrl) throw new Error('Missing UPSTASH_REDIS_URL')

const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
        const delay = Math.min(times * 1000, 10000)
        console.warn(`[Redis] Connection lost. Retrying in ${delay}ms...`)
        return delay
    },
    ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {})
})

const pmQueue = new Queue('pm-tasks', { connection: connection as any, skipStalledCheck: true })
const worker = new Worker('dev-tasks', async (job) => {
    const { taskId, spec, companyId, agentId, rootTaskId, integrations }: { taskId: string; spec: Subtask; companyId?: string; agentId: string; rootTaskId?: string; integrations?: Record<string, boolean> } = job.data

    const { data: agent } = await supabase.from('agents').select('*').eq('id', agentId).single()
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    console.log(`[Dev] Task ${taskId}: "${spec.title}"`)

    const budget = await checkBudget(agent.id, spec.estimated_cost_usd ?? 0.02)
    if (!budget.allowed) {
        await supabase.from('tasks').update({ status: 'blocked_budget', result: budget.reason }).eq('id', taskId)
        console.warn(`[Dev] Blocked: ${budget.reason}`)
        return
    }

    await supabase.from('tasks').update({ status: 'in_progress', assigned_agent_id: agent.id }).eq('id', taskId)
    await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_start', success: true })

    // Implement a 30-second timeout
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Task timed out after 30s')), 30000);
    });

    try {
        const processPromise = (async () => {
            const enabledSkills = integrations ? Object.entries(integrations)
                .filter(([_, enabled]) => enabled)
                .map(([name]) => name) : []
            const toolsSection = buildToolsPrompt(enabledSkills)

            const integrationsSection = integrations
                ? `## USER INTEGRATIONS\nThe user has enabled these services:\n${Object.entries(integrations).filter(([_, v]) => v).map(([k]) => `- ${k}`).join('\n') || '- None'}\n\n`
                : ''

            const fullDirective = `
# YOUR IDENTITY
Name: ${agent.name}
Role: ${agent.role}
About: ${agent.about_md || 'A highly capable HIVE agent.'}

# YOUR SOUL
${agent.soul_md || 'You are technical, precise, and practical.'}

# CURRENT OBJECTIVE
${agent.directive}

Current Date: ${new Date().toISOString()}
`.trim()

            // ── Session hydration: inject agent's long-term memories ──────────
            const memoryBlock = await hydrateAgentMemoryBlock(agent.id, 15)
            const memorySection = memoryBlock
                ? `## YOUR MEMORY (from past sessions)\n${memoryBlock}`
                : `## YOUR MEMORY (from past sessions)\nNo memories yet. As you learn things, use memory_save to remember them.`

            const fullDirectiveWithMemory = `${fullDirective}\n\n${integrationsSection}${toolsSection}\n\n${memorySection}`

            // Assemble context (agentId, companyId, taskGoal, taskId)
            const goal = spec.title
            const ctx = await assembleContext(agent.id, companyId ?? null, goal, taskId)
            const systemPrompt = buildSystemPrompt(ctx, fullDirectiveWithMemory)

            const userMessage = `Task: ${spec.title}\n\nSpec: ${spec.spec}\n\nAcceptance Criteria:\n${spec.acceptance_criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\nComplete this now.`

            const start = Date.now()
            const { text, model, inputTokens, outputTokens, cost } = await callModel({
                tier: 'balanced',
                systemPrompt,
                userMessage,
                maxTokens: 2048,
            })

            // Process any tool calls in the response
            const { finalText, toolsUsed } = await processToolCalls(text, {
                agentId: agent.id,
                taskId,
            })

            await logEvent({
                agent_id: agent.id, task_id: taskId, event_type: 'model_call',
                model_used: model, input_tokens: inputTokens, output_tokens: outputTokens,
                cost_usd: cost, latency_ms: Date.now() - start, success: true,
            })
            if (toolsUsed.length > 0) {
                await logEvent({
                    agent_id: agent.id, task_id: taskId, event_type: 'tool_calls',
                    payload: { tools: toolsUsed }, success: true,
                })
            }
            await recordSpend(agent.id, cost)

            await supabase.from('tasks').update({
                status: 'completed', result: finalText, actual_cost_usd: cost,
                updated_at: new Date().toISOString(),
            }).eq('id', taskId)

            await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_complete', success: true })
            console.log(`[Dev] Done. Cost: $${cost.toFixed(5)}`)

            // Update Agent Memory dynamically (legacy markdown store — kept for UI display)
            const memoryUpdate = `Last Task: "${spec.title}"\nResult: ${finalText.slice(0, 200)}${finalText.length > 200 ? '...' : ''}`
            await supabase.from('agents').update({
                memory_md: `${agent.memory_md || ''}\n\n- ${new Date().toISOString()}: ${memoryUpdate}`.slice(-5000)
            }).eq('id', agent.id)

            // Auto-extract and persist memories to agent_memories (Prompt 05)
            extractAndSaveMemories(agent.id, [
                { role: 'user', content: `Task: ${spec.title}\nSpec: ${spec.spec}` },
                { role: 'assistant', content: finalText.slice(0, 2000) },
            ]).catch(() => { /* non-fatal */ })

            return finalText
        })();

        return await Promise.race([processPromise, timeoutPromise]);

    } catch (err: any) {
        await supabase.from('tasks').update({ status: 'failed', result: err.message }).eq('id', taskId)
        await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_failed', success: false, payload: { error: err.message } })
        throw err
    }
}, {
    connection: connection as any,
    concurrency: 5,
    stalledInterval: 30000,
    lockDuration: 35000
})

worker.on('failed', (_, err) => console.error('[Dev] Job failed:', err?.message))
console.log('[Dev Agent] Ready — listening on queue: dev-tasks')
