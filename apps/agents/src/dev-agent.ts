import 'dotenv/config'
import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { supabase } from '@hive/db'
import { assembleContext, buildSystemPrompt, consolidateMemory, clearWorkingMemory } from '@hive/memory'
import { callModel } from './lib/model-router'
import { logEvent } from './lib/telemetry'
import { checkBudget, recordSpend } from './lib/budget'
import type { Subtask } from '@hive/shared'

const redisUrl = process.env.UPSTASH_REDIS_URL
if (!redisUrl) throw new Error('Missing UPSTASH_REDIS_URL')

const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {})
})

const worker = new Worker('dev-tasks', async (job) => {
    const { taskId, spec }: { taskId: string; spec: Subtask } = job.data

    const { data: agent } = await supabase.from('agents').select('*').eq('role', 'dev').single()
    if (!agent) throw new Error('Dev agent not found')

    console.log(`[Dev] Task ${taskId}: "${spec.title}"`)

    const budget = await checkBudget(agent.id, spec.estimated_cost_usd ?? 0.02)
    if (!budget.allowed) {
        await supabase.from('tasks').update({ status: 'blocked_budget', result: budget.reason }).eq('id', taskId)
        console.warn(`[Dev] Blocked: ${budget.reason}`)
        return
    }

    await supabase.from('tasks').update({ status: 'in_progress', assigned_agent_id: agent.id }).eq('id', taskId)
    await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_start', success: true })

    try {
        // ── Tier 1-4 Memory Integration
        const ctx = await assembleContext(agent.id, agent.company_id, spec.title, taskId)
        const systemPrompt = buildSystemPrompt(ctx, agent.directive)

        const userMessage = `Task: ${spec.title}\n\nSpec: ${spec.spec}\n\nAcceptance Criteria:\n${spec.acceptance_criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n\nComplete this now.`

        const start = Date.now()
        const { text, model, inputTokens, outputTokens, cost } = await callModel({
            tier: 'balanced',
            systemPrompt,
            userMessage,
            maxTokens: 2048,
        })

        await logEvent({
            agent_id: agent.id, task_id: taskId, event_type: 'model_call',
            model_used: model, input_tokens: inputTokens, output_tokens: outputTokens,
            cost_usd: cost, latency_ms: Date.now() - start, success: true,
        })
        await recordSpend(agent.id, cost)

        await supabase.from('tasks').update({
            status: 'completed', result: text, actual_cost_usd: cost,
            updated_at: new Date().toISOString(),
        }).eq('id', taskId)

        // ── Memory Consolidation
        await consolidateMemory(text, spec.title, true, {
            agentId: agent.id,
            companyId: agent.company_id,
            taskId: taskId,
            importance: 7,
        })

        // ── Working Memory Cleanup
        await clearWorkingMemory(agent.id, taskId)

        await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_complete', success: true })
        console.log(`[Dev] Done. Cost: $${cost.toFixed(5)}`)

    } catch (err: any) {
        await supabase.from('tasks').update({ status: 'failed', result: err.message }).eq('id', taskId)
        await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_failed', success: false, payload: { error: err.message } })
        throw err
    }
}, { connection })

worker.on('failed', (_, err) => console.error('[Dev] Job failed:', err?.message))
console.log('[Dev Agent] Ready — listening on queue: dev-tasks')
