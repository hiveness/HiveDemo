import { supabase } from '@hive/db'

export async function checkBudget(agentId: string, estimatedCostUsd: number) {
    const { data: agent } = await supabase
        .from('agents').select('budget_usd, spend_usd, name').eq('id', agentId).single()

    if (!agent) return { allowed: false, reason: 'Agent not found' }

    const remaining = agent.budget_usd - agent.spend_usd
    if (estimatedCostUsd > remaining) {
        return { allowed: false, reason: `${agent.name} budget exceeded. $${remaining.toFixed(4)} remaining, need $${estimatedCostUsd.toFixed(4)}.` }
    }
    return { allowed: true, reason: 'ok' }
}

export async function recordSpend(agentId: string, costUsd: number) {
    const { data: agent } = await supabase.from('agents').select('spend_usd').eq('id', agentId).single()
    if (agent) {
        await supabase.from('agents').update({ spend_usd: agent.spend_usd + costUsd }).eq('id', agentId)
    }
}
