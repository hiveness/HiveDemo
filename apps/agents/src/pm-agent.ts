import 'dotenv/config'
import { Worker, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { supabase } from '@hive/db'
import { PMResponseSchema } from '@hive/shared'
import { assembleContext, buildSystemPrompt } from '@hive/memory'
import { callModel } from './lib/model-router'
import { logEvent } from './lib/telemetry'
import { checkBudget, recordSpend } from './lib/budget'

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

const devQueue = new Queue('dev-tasks', { connection, skipStalledCheck: true })

const worker = new Worker('pm-tasks', async (job) => {
    const { taskId, goal, companyId } = job.data

    const { data: agent } = await supabase.from('agents').select('*').eq('role', 'pm').single()
    if (!agent) throw new Error('PM agent not found')

    console.log(`[PM] Task ${taskId}: "${goal}"`)

    const budget = await checkBudget(agent.id, 0.01)
    if (!budget.allowed) {
        await supabase.from('tasks').update({ status: 'blocked_budget', result: budget.reason }).eq('id', taskId)
        console.warn(`[PM] Blocked: ${budget.reason}`)
        return
    }

    await supabase.from('tasks').update({ status: 'in_progress', assigned_agent_id: agent.id }).eq('id', taskId)
    await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_start', success: true })

    try {
        const currentCompanyId = companyId ?? agent.company_id
        const ctx = await assembleContext(agent.id, currentCompanyId, goal, taskId)
        const systemPrompt = buildSystemPrompt(ctx, agent.directive)

        const start = Date.now()
        const { text, model, inputTokens, outputTokens, cost } = await callModel({
            tier: 'fast',
            systemPrompt,
            userMessage: `Goal: ${goal}`,
            maxTokens: 1024,
            expectJson: true,
        })

        await logEvent({
            agent_id: agent.id, task_id: taskId, event_type: 'model_call',
            model_used: model, input_tokens: inputTokens, output_tokens: outputTokens,
            cost_usd: cost, latency_ms: Date.now() - start, success: true,
        })
        await recordSpend(agent.id, cost)

        const responseData = JSON.parse(text)
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
            }).select().single()

            if (newTask) {
                await devQueue.add('dev-task', {
                    taskId: newTask.id,
                    spec: subtask,
                    agentId: devAgent?.id,
                    companyId: currentCompanyId,
                    goal: subtask.title,
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

        return finalResult

    } catch (err: any) {
        await supabase.from('tasks').update({ status: 'failed', result: err.message }).eq('id', taskId)
        await logEvent({ agent_id: agent.id, task_id: taskId, event_type: 'task_failed', success: false, payload: { error: err.message } })
        throw err
    }
}, {
    connection,
    stalledInterval: 60000,
    lockDuration: 60000
})

worker.on('failed', (_, err) => console.error('[PM] Job failed:', err?.message))
console.log('[PM Agent] Ready — listening on queue: pm-tasks')
