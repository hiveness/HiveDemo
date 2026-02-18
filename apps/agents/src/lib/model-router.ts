import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type ModelTier = 'fast' | 'balanced' | 'powerful'

// Phase 1: all tiers use gpt-4o-mini for cheap testing
const MODEL_MAP: Record<ModelTier, string> = {
    fast: 'gpt-4o-mini',
    balanced: 'gpt-4o-mini',
    powerful: 'gpt-4o-mini',
}

const PRICING: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const p = PRICING[model] ?? PRICING['gpt-4o-mini']
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

export async function callModel(params: {
    tier: ModelTier
    systemPrompt: string
    userMessage: string
    maxTokens?: number
    expectJson?: boolean
}): Promise<{
    text: string
    model: string
    inputTokens: number
    outputTokens: number
    cost: number
}> {
    const model = MODEL_MAP[params.tier]

    const response = await openai.chat.completions.create({
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
    const cost = calculateCost(model, inputTokens, outputTokens)

    return { text, model, inputTokens, outputTokens, cost }
}
