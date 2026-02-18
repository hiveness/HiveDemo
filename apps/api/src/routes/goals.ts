import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { supabase } from '@hive/db'
import { CreateGoalSchema } from '@hive/shared'

export async function goalsRoutes(app: FastifyInstance) {
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

    const pmQueue = new Queue('pm-tasks', {
        connection,
        defaultJobOptions: { removeOnComplete: true, removeOnFail: 1000 }
    })

    app.post('/', async (req, reply) => {
        const body = CreateGoalSchema.safeParse(req.body)
        if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

        const { goal, budget_usd } = body.data
        const idempotency_key = `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`

        // Fetch PM agent to get ID and company ID
        const { data: agent } = await supabase.from('agents').select('id, company_id').eq('role', 'pm').single()

        const { data: task, error } = await supabase.from('tasks').insert({
            goal, status: 'pending', estimated_cost_usd: budget_usd, idempotency_key,
        }).select().single()

        if (error || !task) {
            app.log.error(error)
            return reply.status(500).send({ error: 'Failed to create task' })
        }

        await pmQueue.add('pm-task', {
            taskId: task.id,
            goal,
            agentId: agent?.id,
            companyId: agent?.company_id,
        }, {
            jobId: idempotency_key, attempts: 3, backoff: { type: 'exponential', delay: 2000 },
        })

        return reply.status(201).send({ task_id: task.id, status: 'queued', goal })
    })
}
