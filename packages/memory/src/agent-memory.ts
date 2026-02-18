/**
 * Prompt 05 — Persistent Cross-Session Agent Memory
 *
 * Provides save / search / forget / list operations on the `agent_memories`
 * table (migration 009_agent_memories.sql).  Each memory is scoped to a
 * single agent_id so agents can never read each other's memories.
 *
 * This file is purely additive — nothing in the existing memory package is
 * modified.
 */

import { supabase } from '@hive/db'
import { embed } from './embeddings'

export type MemoryImportance = 'low' | 'medium' | 'high'

export interface AgentMemory {
    id: string
    agent_id: string
    content: string
    tags: string[]
    importance: MemoryImportance
    created_at: string
    accessed_at: string
    access_count: number
    similarity?: number   // populated after semantic search
}

// ── SAVE ─────────────────────────────────────────────────────────────────────

export async function saveAgentMemory(
    agentId: string,
    content: string,
    options: {
        tags?: string[]
        importance?: MemoryImportance
    } = {}
): Promise<string> {
    const { tags = [], importance = 'medium' } = options

    let embedding: number[] | null = null
    try {
        embedding = await embed(content)
    } catch (err: any) {
        console.warn('[agent-memory] embed failed, saving without vector:', err.message)
    }

    const { data, error } = await supabase
        .from('agent_memories')
        .insert({
            agent_id: agentId,
            content,
            embedding,
            tags,
            importance,
        })
        .select('id')
        .single()

    if (error) {
        console.error('[agent-memory] save failed:', error.message)
        throw new Error(`Memory save failed: ${error.message}`)
    }

    return data.id as string
}

// ── SEARCH (semantic) ─────────────────────────────────────────────────────────

export async function searchAgentMemory(
    agentId: string,
    query: string,
    options: {
        limit?: number
        threshold?: number
    } = {}
): Promise<AgentMemory[]> {
    const { limit = 5, threshold = 0.65 } = options

    let queryEmbedding: number[]
    try {
        queryEmbedding = await embed(query)
    } catch (err: any) {
        console.warn('[agent-memory] embed failed for search, falling back to recency:', err.message)
        return listAgentMemories(agentId, { limit })
    }

    const { data, error } = await supabase.rpc('match_agent_memories', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        p_agent_id: agentId,
    })

    if (error) {
        console.error('[agent-memory] search failed:', error.message)
        return []
    }

    // Bump access stats for retrieved memories (fire-and-forget)
    if (data && data.length > 0) {
        const ids = (data as any[]).map((r: any) => r.id)
        supabase
            .from('agent_memories')
            .update({ accessed_at: new Date().toISOString() })
            .in('id', ids)
            .then(() => {
                // increment access_count via a separate RPC-free approach
                ids.forEach((id: string) => {
                    supabase.rpc('increment_memory_access', { memory_uuid: id }).catch(() => {
                        // RPC may not exist yet — silently ignore
                    })
                })
            })
            .catch(() => { /* non-critical */ })
    }

    return (data ?? []) as AgentMemory[]
}

// ── LIST (recency-based) ──────────────────────────────────────────────────────

export async function listAgentMemories(
    agentId: string,
    options: {
        limit?: number
        importance?: MemoryImportance
    } = {}
): Promise<AgentMemory[]> {
    const { limit = 20, importance } = options

    let query = supabase
        .from('agent_memories')
        .select('id, agent_id, content, tags, importance, created_at, accessed_at, access_count')
        .eq('agent_id', agentId)
        .order('accessed_at', { ascending: false })
        .limit(limit)

    if (importance) {
        query = query.eq('importance', importance)
    }

    const { data, error } = await query

    if (error) {
        console.error('[agent-memory] list failed:', error.message)
        return []
    }

    return (data ?? []) as AgentMemory[]
}

// ── FORGET ────────────────────────────────────────────────────────────────────

export async function forgetAgentMemory(
    agentId: string,
    memoryId: string
): Promise<void> {
    const { error } = await supabase
        .from('agent_memories')
        .delete()
        .eq('id', memoryId)
        .eq('agent_id', agentId)   // agent_id guard — agents can only delete their own memories

    if (error) {
        console.error('[agent-memory] forget failed:', error.message)
        throw new Error(`Memory forget failed: ${error.message}`)
    }
}

// ── HYDRATE (build memory block for system prompt) ────────────────────────────

/**
 * Returns a formatted string block of the agent's top memories, ready to
 * inject into a system prompt.  Never throws — returns empty string on failure.
 */
export async function hydrateAgentMemoryBlock(
    agentId: string,
    limit = 15
): Promise<string> {
    try {
        const memories = await listAgentMemories(agentId, { limit })
        if (memories.length === 0) return ''

        const lines = memories.map(m => {
            const badge = `[${m.importance.toUpperCase()}]`
            const tags = m.tags.length > 0 ? ` (${m.tags.join(', ')})` : ''
            return `${badge}${tags} ${m.content}`
        })

        return lines.join('\n')
    } catch (err: any) {
        console.warn('[agent-memory] hydrate failed (non-fatal):', err.message)
        return ''
    }
}

// ── AUTO-EXTRACT (call after session ends) ────────────────────────────────────

export interface SessionMessage {
    role: 'user' | 'assistant' | 'system' | 'tool_result'
    content: string
}

/**
 * Uses GPT-4o-mini to extract 3-5 important facts from a completed session
 * and saves them to agent_memories.  Completely fire-and-forget safe — never
 * throws or crashes the caller.
 */
export async function extractAndSaveMemories(
    agentId: string,
    sessionHistory: SessionMessage[]
): Promise<void> {
    if (sessionHistory.length < 4) return   // not enough signal

    try {
        const OpenAI = (await import('openai')).default
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        const conversationText = sessionHistory
            .map(m => `${m.role}: ${m.content}`)
            .join('\n')
            .slice(0, 6000)

        const extractionPrompt = `You are reviewing a completed AI agent session.
Extract 3-5 important facts, user preferences, decisions made, or lessons learned
that this agent should remember for future sessions.
Only extract information that would genuinely be useful later —
not trivial details, not things already obvious from the agent's role.

Respond ONLY with a JSON array, no explanation:
[
  { "content": "...", "tags": ["tag1"], "importance": "low|medium|high" },
  ...
]

Conversation:
${conversationText}`

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: extractionPrompt }],
            response_format: { type: 'json_object' },
            max_tokens: 512,
        })

        const raw = completion.choices[0]?.message?.content ?? '[]'
        let memories: Array<{ content: string; tags?: string[]; importance?: string }>

        try {
            const parsed = JSON.parse(raw)
            memories = Array.isArray(parsed) ? parsed : (parsed.memories ?? [])
        } catch {
            console.warn('[agent-memory] extraction parse failed, raw:', raw.slice(0, 200))
            return
        }

        for (const mem of memories) {
            if (!mem.content || typeof mem.content !== 'string') continue
            const importance = (['low', 'medium', 'high'].includes(mem.importance ?? ''))
                ? (mem.importance as MemoryImportance)
                : 'medium'

            await saveAgentMemory(agentId, mem.content, {
                tags: Array.isArray(mem.tags) ? mem.tags : [],
                importance,
            }).catch(err => {
                console.warn('[agent-memory] failed to save extracted memory:', err.message)
            })
        }

        console.log(`[agent-memory] Extracted ${memories.length} memories for agent ${agentId}`)
    } catch (err: any) {
        // Never crash the caller — memory extraction is best-effort
        console.warn('[agent-memory] extractAndSaveMemories failed (non-fatal):', err.message)
    }
}
