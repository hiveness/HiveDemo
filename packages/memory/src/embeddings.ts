import OpenAI from 'openai'

// Separate OpenAI client — used ONLY for embeddings, not chat
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const cache = new Map<string, number[]>()

export async function embed(text: string): Promise<number[]> {
    const key = text.slice(0, 200)
    if (cache.has(key)) return cache.get(key)!

    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',  // 1536 dims, $0.02/million tokens
        input: text.slice(0, 8000),
    })

    const vector = response.data[0].embedding
    cache.set(key, vector)
    return vector
}

export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}
