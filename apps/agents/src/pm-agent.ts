import 'dotenv/config'
import axios from 'axios'
import { Worker, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { supabase } from '@hive/db'
import { PMResponseSchema } from '@hive/shared'
import { assembleContext, buildSystemPrompt, hydrateAgentMemoryBlock, extractAndSaveMemories } from '@hive/memory'
import { callModel } from './lib/model-router'
import { logEvent } from './lib/telemetry'
import { checkBudget, recordSpend } from './lib/budget'
import { buildToolsPrompt } from '@hive/tools'
import { processToolCalls } from './lib/tool-runner'

const redisUrl = process.env.UPSTASH_REDIS_URL
if (!redisUrl) throw new Error('Missing UPSTASH_REDIS_URL')

const HIVE_API = process.env.HIVE_API_URL!
const HIVE_KEY = process.env.API_KEY!

const api = axios.create({
    baseURL: HIVE_API,
    headers: { 'x-api-key': HIVE_KEY },
})

const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
        const delay = Math.min(times * 1000, 10000)
        console.warn(`[Redis] Connection lost. Retrying in ${delay}ms...`)
        return delay
    },
    ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {})
})

const devQueue = new Queue('dev-tasks', { connection: connection as any, skipStalledCheck: true })

const worker = new Worker('pm-tasks', async (job) => {
    const { taskId, goal, companyId, agentId, integrations } = job.data

    const { data: agent } = await supabase.from('agents').select('*').eq('id', agentId).single()
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    console.log(`[PM] Task ${taskId}: "${goal}"`)

    const budget = await checkBudget(agent.id, 0.01)
    if (!budget.allowed) {
        await supabase.from('tasks').update({ status: 'blocked_budget', result: budget.reason }).eq('id', taskId)
        console.warn(`[PM] Blocked: ${budget.reason}`)
        return
    }

    await supabase.from('tasks').update({ status: 'in_progress', assigned_agent_id: agent.id }).eq('id', taskId)
    await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_start', success: true })

    // Implement a 30-second timeout for the entire processing logic
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Task timed out after 30s')), 30000);
    });

    try {
        const processPromise = (async () => {
            const currentCompanyId = companyId ?? agent.company_id
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
${agent.soul_md || 'You are professional, efficient, and direct.'}

# CURRENT OBJECTIVE
${agent.directive || 'Execute the user goal efficiently.'}

${integrationsSection}
${toolsSection}

# MISSION SPECIFIC RULES
${PMResponseSchema.description}
Always respond in the exact JSON format required.
`.trim()

            // ── Session hydration: inject agent's long-term memories ──────────
            const memoryBlock = await hydrateAgentMemoryBlock(agent.id, 15)
            const memorySection = memoryBlock
                ? `## YOUR MEMORY (from past sessions)\n${memoryBlock}`
                : `## YOUR MEMORY (from past sessions)\nNo memories yet. As you learn things, use memory_save to remember them.`

            const fullDirectiveWithMemory = `${fullDirective}\n\n${memorySection}`

            // Assemble context (agentId, companyId, taskGoal, taskId)
            const ctx = await assembleContext(agent.id, currentCompanyId ?? null, goal, taskId)
            const systemPrompt = buildSystemPrompt(ctx, fullDirectiveWithMemory)

            const start = Date.now()
            const { text, model, inputTokens, outputTokens, cost } = await callModel({
                tier: 'fast',
                systemPrompt,
                userMessage: `Goal: ${goal}`,
                maxTokens: 1024,
                expectJson: true,
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

            const responseData = JSON.parse(finalText)
            const parsed = PMResponseSchema.safeParse(responseData)
            if (!parsed.success) throw new Error(`Invalid PM response: ${text}`)

            const { subtasks, direct_answer } = parsed.data

            if (direct_answer && subtasks.length === 0) {
                await supabase.from('tasks').update({
                    status: 'completed',
                    result: direct_answer,
                    actual_cost_usd: cost,
                    updated_at: new Date().toISOString(),
                }).eq('id', taskId)

                await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_complete', success: true })
                console.log(`[PM] Direct response: "${direct_answer.slice(0, 50)}..."`)

                // Auto-extract memories from this session (fire-and-forget)
                extractAndSaveMemories(agent.id, [
                    { role: 'user', content: `Goal: ${goal}` },
                    { role: 'assistant', content: direct_answer },
                ]).catch(() => { /* non-fatal */ })

                return direct_answer
            }

            const { data: devAgent } = await supabase.from('agents').select('id').eq('role', 'dev').single()

            for (const subtask of subtasks) {
                const key = `${taskId}-${subtask.title}`.replace(/\s+/g, '-').toLowerCase().slice(0, 200)
                const { data: newTask } = await supabase.from('tasks').insert({
                    goal: subtask.title,
                    spec: { description: subtask.spec, acceptance_criteria: subtask.acceptance_criteria },
                    status: 'pending',
                    parent_task_id: taskId,
                    estimated_cost_usd: subtask.estimated_cost_usd,
                    idempotency_key: key,
                    assigned_agent_id: devAgent?.id, // Assign immediately for UI visibility
                }).select().single()

                if (newTask) {
                    await devQueue.add('dev-task', {
                        taskId: newTask.id,
                        rootTaskId: taskId,
                        spec: subtask,
                        agentId: devAgent?.id,
                        companyId: currentCompanyId,
                        goal: subtask.title,
                        integrations // Propagate settings to Dev agent
                    }, {
                        attempts: 3, backoff: { type: 'exponential', delay: 2000 },
                    })
                }
            }

            const finalResult = direct_answer || `PM created ${subtasks.length} subtasks`
            await supabase.from('tasks').update({
                status: 'completed',
                result: finalResult,
                actual_cost_usd: cost,
                updated_at: new Date().toISOString(),
            }).eq('id', taskId)

            await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_complete', success: true })
            console.log(`[PM] Done. ${subtasks.length} subtasks queued.`)

            // Update Agent Memory dynamically (legacy markdown store — kept for UI display)
            const memoryUpdate = `Last Task: "${goal}"\nResult: ${finalResult.slice(0, 200)}${finalResult.length > 200 ? '...' : ''}`
            await supabase.from('agents').update({
                memory_md: `${agent.memory_md || ''}\n\n- ${new Date().toISOString()}: ${memoryUpdate}`.slice(-5000)
            }).eq('id', agent.id)

            // Auto-extract and persist memories to agent_memories (Prompt 05)
            extractAndSaveMemories(agent.id, [
                { role: 'user', content: `Goal: ${goal}` },
                { role: 'assistant', content: `Plan: Created ${subtasks.length} subtasks. ${finalResult}` },
            ]).catch(() => { /* non-fatal */ })

            return finalResult
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

worker.on('failed', (_, err) => console.error('[PM] Job failed:', err?.message))
console.log('[PM Agent] Ready — listening on queue: pm-tasks')
