import { supabase } from '@hive/db'

export async function logEvent(event: {
    agent_id: string
    task_id: string
    event_type: 'task_start' | 'model_call' | 'task_complete' | 'task_failed'
    model_used?: string
    input_tokens?: number
    output_tokens?: number
    cost_usd?: number
    latency_ms?: number
    success: boolean
    payload?: Record<string, unknown>
}) {
    const { error } = await supabase.from('telemetry_events').insert(event)
    if (error) console.error('[telemetry] failed:', error.message)
}
