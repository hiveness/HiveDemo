import 'dotenv/config'
import Fastify from 'fastify'
import { Queue, QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'
import { consolidateMemory, clearWorkingMemory } from '@hive/memory'

const redisUrl = process.env.UPSTASH_REDIS_URL
if (!redisUrl) throw new Error('Missing UPSTASH_REDIS_URL')

const connection = new Redis(redisUrl, {
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
})

const pmQueue = new Queue('pm-tasks', { connection })
const devQueue = new Queue('dev-tasks', { connection })

const pmEvents = new QueueEvents('pm-tasks', { connection })
const devEvents = new QueueEvents('dev-tasks', { connection })

// After PM completes — consolidate memory
pmEvents.on('completed', async ({ jobId, returnvalue }) => {
    const job = await pmQueue.getJob(jobId)
    if (!job?.data?.agentId) return
    const { taskId, agentId, companyId, goal } = job.data

    await consolidateMemory(returnvalue ?? 'PM breakdown complete', goal, true, {
        agentId, companyId: companyId ?? 'default', taskId, importance: 5,
    })
    await clearWorkingMemory(agentId, taskId)
    console.log(`[Orchestrator] PM memory consolidated: ${taskId}`)
})

// After PM fails — write failure episode
pmEvents.on('failed', async ({ jobId }) => {
    const job = await pmQueue.getJob(jobId)
    if (!job?.data?.agentId) return
    const { taskId, agentId, companyId, goal } = job.data

    await consolidateMemory('Task failed at PM stage', goal, false, {
        agentId, companyId: companyId ?? 'default', taskId, importance: 7,
    })
    await clearWorkingMemory(agentId, taskId)
})

// After Dev completes — consolidate memory
devEvents.on('completed', async ({ jobId, returnvalue }) => {
    const job = await devQueue.getJob(jobId)
    if (!job?.data?.agentId) return
    const { taskId, agentId, companyId, goal } = job.data

    await consolidateMemory(returnvalue ?? 'Dev task complete', goal ?? job.data.spec?.title, true, {
        agentId, companyId: companyId ?? 'default', taskId, importance: 6,
    })
    await clearWorkingMemory(agentId, taskId)
    console.log(`[Orchestrator] Dev memory consolidated: ${taskId}`)
})

// After Dev fails
devEvents.on('failed', async ({ jobId }) => {
    const job = await devQueue.getJob(jobId)
    if (!job?.data?.agentId) return
    const { taskId, agentId, companyId, goal } = job.data

    await consolidateMemory('Task failed at Dev stage', goal ?? job.data.spec?.title, false, {
        agentId, companyId: companyId ?? 'default', taskId, importance: 7,
    })
    await clearWorkingMemory(agentId, taskId)
})

// Health endpoint for Railway
const app = Fastify({ logger: false })
app.get('/health', async () => ({ status: 'ok', service: 'orchestrator', ts: new Date().toISOString() }))
app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })

console.log('[Orchestrator] Watching pm-tasks and dev-tasks queues')
