import { Redis } from 'ioredis'
import type { WorkingMemoryEntry } from './types'

let redis: Redis | null = null

function getRedis(): Redis {
    if (!redis) {
        const redisUrl = process.env.UPSTASH_REDIS_URL
        if (!redisUrl) throw new Error('Missing UPSTASH_REDIS_URL for Working Memory')
        redis = new Redis(redisUrl, {
            maxRetriesPerRequest: null,
            ...(redisUrl.startsWith('rediss://') ? { tls: {} } : {})
        })
    }
    return redis
}

const KEY = (agentId: string, taskId: string) => `wm:${agentId}:${taskId}`
const TTL_SECONDS = 60 * 60 * 4  // 4 hours — evicted if task doesn't finish

export async function appendToWorkingMemory(
    agentId: string,
    taskId: string,
    entry: WorkingMemoryEntry
): Promise<void> {
    const r = getRedis()
    const key = KEY(agentId, taskId)
    await r.rpush(key, JSON.stringify(entry))
    await r.expire(key, TTL_SECONDS)
}

export async function getWorkingMemory(
    agentId: string,
    taskId: string,
    maxEntries = 20
): Promise<WorkingMemoryEntry[]> {
    const r = getRedis()
    const key = KEY(agentId, taskId)
    const raw = await r.lrange(key, -maxEntries, -1)  // last N entries
    return raw.map(s => JSON.parse(s) as WorkingMemoryEntry)
}

export async function clearWorkingMemory(agentId: string, taskId: string): Promise<void> {
    const r = getRedis()
    await r.del(KEY(agentId, taskId))
}

export async function getWorkingMemoryTokenCount(agentId: string, taskId: string): Promise<number> {
    const entries = await getWorkingMemory(agentId, taskId)
    return entries.reduce((sum, e) => sum + Math.ceil(e.content.length / 4), 0)
}
