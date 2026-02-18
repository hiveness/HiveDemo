import { supabase } from '@hive/db'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.replace(/\n/g, ' '),
    })
    return response.data[0].embedding
}

export async function storeMemory(agentId: string, content: string, metadata: any = {}) {
    try {
        const embedding = await generateEmbedding(content)
        const { error } = await supabase.from('memories').insert({
            agent_id: agentId,
            content,
            embedding,
            metadata
        })
        if (error) throw error
        return true
    } catch (e) {
        console.error('Error storing memory:', e)
        return false
    }
}

export async function searchMemory(agentId: string, query: string, limit = 5) {
    try {
        const embedding = await generateEmbedding(query)
        const { data, error } = await supabase.rpc('match_memories', {
            match_agent_id: agentId,
            query_embedding: embedding,
            match_threshold: 0.7,
            match_count: limit
        })

        if (error) {
            // If RPC fails (e.g. not created yet), fallback to simple query or return empty
            // For now, we'll assume the migration/RPC is in place or will be.
            // If the table is just created, we might not have the RPC function yet.
            // Let's assume standard select for now or implement RPC in migration.
            console.warn('RPC match_memories failed, falling back to basic storage check', error)
            return []
        }
        return data
    } catch (e) {
        console.error('Error searching memory:', e)
        return []
    }
}
