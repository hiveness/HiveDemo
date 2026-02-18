import OpenAI from 'openai'

// Groq is OpenAI-compatible — just a different baseURL
const groq = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
})

export type ModelTier = 'fast' | 'balanced' | 'powerful'

// Free on Groq. llama-3.3-70b is the latest powerful model, 3.1-8b for speed.
const MODEL_MAP: Record<ModelTier, string> = {
    fast: 'llama-3.1-8b-instant',     // PM breakdowns, simple tasks
    balanced: 'llama-3.3-70b-versatile',  // Dev execution, complex tasks
    powerful: 'llama-3.3-70b-versatile',  // Peak performance on Groq
}

// Groq free = $0. These are for telemetry reference when you switch to paid.
const PRICING: Record<string, { input: number; output: number }> = {
    'llama-3.1-8b-instant': { input: 0.05, output: 0.10 },
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
    'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
}

export function calculateCost(model: string, input: number, output: number): number {
    const p = PRICING[model] ?? { input: 0, output: 0 }
    return (input / 1_000_000) * p.input + (output / 1_000_000) * p.output
}

export async function callModel(params: {
    tier: ModelTier
    systemPrompt: string
    userMessage: string
    maxTokens?: number
    expectJson?: boolean
}): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number; cost: number }> {
    const model = MODEL_MAP[params.tier]

    const response = await groq.chat.completions.create({
        model,
        max_tokens: params.maxTokens ?? 1024,
        response_format: params.expectJson ? { type: 'json_object' } : undefined,
        messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userMessage },
        ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const inputTokens = response.usage?.prompt_tokens ?? 0
    const outputTokens = response.usage?.completion_tokens ?? 0

    return { text, model, inputTokens, outputTokens, cost: calculateCost(model, inputTokens, outputTokens) }
}
