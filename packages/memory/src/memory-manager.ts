import { getCoreMemory } from './core-memory'
import { getWorkingMemory, appendToWorkingMemory } from './working-memory'
import { recallEpisodes, writeEpisode } from './episodic-memory'
import { searchSemanticMemory, saveToSemanticMemory } from './semantic-memory'
import { buildContext } from './context-builder'
import { estimateTokens } from './embeddings'
import type { AssembledContext, MemoryWriteOptions, WorkingMemoryEntry } from './types'

// ── READ: Called by Orchestrator before injecting context into an agent task
export async function assembleContext(
    agentId: string,
    companyId: string,
    taskGoal: string,
    taskId: string,
    options: {
        maxTokens?: number          // default 6000 — leave room for model output
        includeEpisodes?: boolean   // default true
        includeSemantic?: boolean   // default true
    } = {}
): Promise<AssembledContext> {
    const { maxTokens = 6000, includeEpisodes = true, includeSemantic = true } = options

    // Always load core memory (Tier 1)
    const core = await getCoreMemory(agentId)
    if (!core) throw new Error(`Core memory not found for agent ${agentId}`)

    // Always load working memory for this task (Tier 2)
    const working = await getWorkingMemory(agentId, taskId)

    // Recall relevant episodes (Tier 3) if budget allows
    const episodes = includeEpisodes
        ? await recallEpisodes(agentId, { limit: 6, minImportance: 4 })
        : []

    // Semantic search over company knowledge (Tier 4) if budget allows
    const semantic = includeSemantic
        ? await searchSemanticMemory(companyId, taskGoal, { limit: 6 })
        : []

    const assembled: AssembledContext = { core, working, episodes, semantic, token_count: 0 }
    assembled.token_count = estimateTokens(buildContext(assembled))

    // If over budget, trim episodic and semantic (never trim core or working)
    if (assembled.token_count > maxTokens) {
        const trimmed = { ...assembled, episodes: episodes.slice(0, 3), semantic: semantic.slice(0, 3) }
        trimmed.token_count = estimateTokens(buildContext(trimmed))
        return trimmed
    }

    return assembled
}

// ── WRITE: Called by Orchestrator after a task completes
export async function consolidateMemory(
    result: string,
    goal: string,
    success: boolean,
    opts: MemoryWriteOptions
): Promise<void> {
    const { agentId, companyId, taskId, importance = 5 } = opts

    // Write episode to Tier 3
    await writeEpisode({
        agent_id: agentId,
        company_id: companyId,
        task_id: taskId,
        episode_type: success ? 'task_complete' : 'task_failed',
        summary: `${success ? 'Completed' : 'Failed'}: "${goal}". Result: ${result.slice(0, 300)}`,
        outcome: success ? 'success' : 'failure',
        importance: success ? importance : importance + 2,  // failures are more important to remember
        metadata: { goal, result_length: result.length },
    })

    // Extract and save key facts to Tier 4 semantic memory
    // Only save successful outputs and only if result is substantial
    if (success && result.length > 100) {
        await saveToSemanticMemory(companyId, agentId, `Task completed: ${goal}\n\nOutput: ${result.slice(0, 500)}`, {
            scope: 'company',
            sourceType: 'task_output',
            importance,
        })
    }
}

// ── APPEND: Add a message to working memory mid-task
export async function recordMessage(
    agentId: string,
    taskId: string,
    entry: WorkingMemoryEntry
): Promise<void> {
    await appendToWorkingMemory(agentId, taskId, entry)
}
