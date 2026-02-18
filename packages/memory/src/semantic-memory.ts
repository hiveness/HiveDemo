import { supabase } from '@hive/db'
import { embed } from './embeddings'
import type { SemanticMemory } from './types'

// Save a fact or piece of knowledge to long-term semantic memory
export async function saveToSemanticMemory(
    companyId: string,
    agentId: string,
    content: string,
    options: {
        scope?: 'company' | 'agent' | 'domain'
        sourceType?: string
        importance?: number
    } = {}
): Promise<void> {
    const { scope = 'company', sourceType = 'task_output', importance = 5 } = options

    const embedding = await embed(content)

    const { error } = await supabase.from('company_memory').insert({
        company_id: companyId,
        agent_id: agentId,
        content,
        embedding,
        scope,
        source_type: sourceType,
        importance,
    })

    if (error) console.error('[semantic] save failed:', error.message)
}

// Search semantic memory by meaning (cosine similarity via pgvector)
export async function searchSemanticMemory(
    companyId: string,
    query: string,
    options: {
        limit?: number
        scope?: 'company' | 'agent' | 'domain'
        minImportance?: number
    } = {}
): Promise<SemanticMemory[]> {
    const { limit = 8, scope, minImportance = 3 } = options

    const queryEmbedding = await embed(query)

    // pgvector cosine similarity search
    let rpcQuery = supabase.rpc('search_memory', {
        query_embedding: queryEmbedding,
        company_id_filter: companyId,
        match_count: limit,
        min_importance: minImportance,
    })

    const { data, error } = await rpcQuery

    if (error) {
        console.error('[semantic] search failed:', error.message)
        return []
    }

    return (data ?? []) as SemanticMemory[]
}

// Seed company memory from onboarding answers
export async function seedOnboardingMemory(
    companyId: string,
    agentId: string,
    facts: string[]
): Promise<void> {
    for (const fact of facts) {
        await saveToSemanticMemory(companyId, agentId, fact, {
            scope: 'company',
            sourceType: 'onboarding',
            importance: 8,   // onboarding facts are always high importance
        })
    }
}
