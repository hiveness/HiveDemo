export interface CoreMemory {
    identity: {
        name: string
        role: string
        persona: string           // "You are direct, technical, and ship fast."
    }
    company: {
        name: string
        description: string
        industry: string
        stage: string
        core_values: string[]
    }
    current_directives: string[]  // active standing orders for this agent
    pinned_facts: string[]        // things that must always be in context
}

export interface WorkingMemoryEntry {
    role: 'user' | 'assistant' | 'system' | 'tool_result'
    content: string
    ts: number
}

export interface Episode {
    id: string
    agent_id: string
    company_id: string
    task_id?: string
    episode_type: 'task_complete' | 'task_failed' | 'decision' | 'correction' | 'learning'
    summary: string
    outcome?: 'success' | 'failure' | 'partial'
    importance: number           // 1–10
    metadata: Record<string, unknown>
    created_at: string
}

export interface SemanticMemory {
    id: string
    content: string
    scope: 'company' | 'agent' | 'domain'
    source_type: string
    importance: number
    similarity?: number          // populated after search
}

export interface AssembledContext {
    core: CoreMemory
    working: WorkingMemoryEntry[]
    episodes: Episode[]
    semantic: SemanticMemory[]
    token_count: number          // estimated total
}

export interface MemoryWriteOptions {
    agentId: string
    companyId: string
    taskId?: string
    episodeType?: Episode['episode_type']
    importance?: number
}
