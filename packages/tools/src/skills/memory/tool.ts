import { searchSemanticMemory, saveAgentMemory, searchAgentMemory, forgetAgentMemory, listAgentMemories } from '@hive/memory'
import type { ToolDefinition, ToolOutput } from '../../types'

// ── Existing tool (unchanged) ─────────────────────────────────────────────────

export const memoryQueryTool: ToolDefinition = {
    name: 'memory_query',
    description: 'Search company memory for relevant past decisions, outputs, and knowledge.',
    category: 'data',
    inputSchema: {
        query: { type: 'string', description: 'What to search for', required: true },
        company_id: { type: 'string', description: 'Company ID', required: true },
        limit: { type: 'number', description: 'Max results (default: 5)', required: false },
    },

    async execute({ query, company_id, limit = 5 }): Promise<ToolOutput> {
        try {
            const results = await searchSemanticMemory(String(company_id), String(query), {
                limit: Number(limit),
            })
            return {
                success: true,
                result: results.map(r => ({
                    content: r.content,
                    scope: r.scope,
                    relevance: r.similarity?.toFixed(3),
                }))
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}

// ── Prompt 05: Agent-scoped persistent memory tools ───────────────────────────

/**
 * memory_save — store an important fact in the agent's long-term memory.
 * The agent_id is injected by the tool-runner from context; agents never
 * supply it themselves (prevents cross-agent writes).
 */
export const memorySaveTool: ToolDefinition = {
    name: 'memory_save',
    description: 'Save an important fact, user preference, decision, or lesson to long-term memory. Call this proactively when you learn something worth remembering across sessions.',
    category: 'data',
    inputSchema: {
        content: {
            type: 'string',
            description: 'The information to remember, written as a clear standalone statement.',
            required: true,
        },
        tags: {
            type: 'array',
            description: "Tags for retrieval. e.g. ['user_preference', 'project_hive', 'budget']",
            required: false,
        },
        importance: {
            type: 'string',
            description: 'How important is this memory? One of: low, medium, high',
            required: false,
        },
    },

    async execute({ content, tags, importance, _agent_id }): Promise<ToolOutput> {
        if (!content || typeof content !== 'string') {
            return { success: false, error: 'content is required' }
        }
        if (!_agent_id) {
            return { success: false, error: 'agent_id not injected — tool-runner misconfiguration' }
        }

        const imp = (['low', 'medium', 'high'].includes(String(importance)))
            ? String(importance) as 'low' | 'medium' | 'high'
            : 'medium'

        try {
            const id = await saveAgentMemory(String(_agent_id), content, {
                tags: Array.isArray(tags) ? tags.map(String) : [],
                importance: imp,
            })
            return {
                success: true,
                result: `Memory saved (ID: ${id}) — '${content.slice(0, 80)}${content.length > 80 ? '...' : ''}'`,
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}

/**
 * memory_search — semantic search over the agent's own memories.
 */
export const memorySearchTool: ToolDefinition = {
    name: 'memory_search',
    description: 'Search your long-term memory for information relevant to the current task. Always check memory before searching the web for things you may have already learned.',
    category: 'data',
    inputSchema: {
        query: {
            type: 'string',
            description: 'What to look for — use natural language.',
            required: true,
        },
        limit: {
            type: 'number',
            description: 'Max results to return. Default 5.',
            required: false,
        },
    },

    async execute({ query, limit = 5, _agent_id }): Promise<ToolOutput> {
        if (!query) return { success: false, error: 'query is required' }
        if (!_agent_id) return { success: false, error: 'agent_id not injected' }

        try {
            const results = await searchAgentMemory(String(_agent_id), String(query), {
                limit: Number(limit),
            })

            if (results.length === 0) {
                return { success: true, result: 'No relevant memories found.' }
            }

            const lines = results.map(r => {
                const badge = `[${r.importance.toUpperCase()}]`
                const sim = r.similarity != null ? ` (similarity=${r.similarity.toFixed(2)})` : ''
                return `${badge}${sim} ${r.content}`
            })

            return { success: true, result: lines.join('\n') }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}

/**
 * memory_forget — delete a specific memory entry by ID.
 */
export const memoryForgetTool: ToolDefinition = {
    name: 'memory_forget',
    description: 'Delete a specific memory entry that is no longer accurate or relevant.',
    category: 'data',
    inputSchema: {
        memory_id: {
            type: 'string',
            description: 'UUID of the memory to delete.',
            required: true,
        },
    },

    async execute({ memory_id, _agent_id }): Promise<ToolOutput> {
        if (!memory_id) return { success: false, error: 'memory_id is required' }
        if (!_agent_id) return { success: false, error: 'agent_id not injected' }

        try {
            await forgetAgentMemory(String(_agent_id), String(memory_id))
            return { success: true, result: `Memory ${memory_id} deleted.` }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}
