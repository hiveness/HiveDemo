import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Cache embeddings for identical strings within a process lifetime
const cache = new Map<string, number[]>()

export async function embed(text: string): Promise<number[]> {
    const key = text.slice(0, 200)
    if (cache.has(key)) return cache.get(key)!

    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',   // 1536 dims, $0.02 per 1M tokens
        input: text.slice(0, 8000),        // max safe input
    })

    const vector = response.data[0].embedding
    cache.set(key, vector)
    return vector
}

// Estimate tokens (rough: 1 token ≈ 4 chars)
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}
