import { supabase } from '@hive/db'

// ── Event Types ───────────────────────────────────────────────────────────────

export type TelemetryEventType =
    | 'model_call'
    | 'tool_call'
    | 'tool_calls'
    | 'task_update'
    | 'task_start'
    | 'task_complete'
    | 'task_failed'
    | 'memory_op'
    | 'approval'

// Matches the actual telemetry_events table schema in the database:
//   id, agent_id, task_id, event_type, model_used, input_tokens, output_tokens,
//   cost_usd, latency_ms, success, payload, created_at
export interface TelemetryEvent {
    event_type: TelemetryEventType
    agent_id: string
    task_id?: string
    model_used?: string            // for model_call events
    input_tokens?: number
    output_tokens?: number
    cost_usd?: number
    latency_ms?: number
    success?: boolean
    payload?: Record<string, unknown>
}

// ── Cost Estimator ────────────────────────────────────────────────────────────

export function estimateCost(model: string, tokens: number): number {
    const rates: Record<string, number> = {
        'gpt-4o': 0.000005,       // $5 per 1M tokens (blended)
        'gpt-4o-mini': 0.0000003, // $0.30 per 1M tokens
    }
    return (rates[model] ?? 0) * tokens
}

// ── Core Logger ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget telemetry log. Never raises — failures are silently swallowed.
 * This is what powers the HIVE APL engine, agent reputation scores, and HQ dashboard.
 */
export async function logEvent(event: TelemetryEvent): Promise<void> {
    try {
        const { error } = await supabase.from('telemetry_events').insert({
            event_type: event.event_type,
            agent_id: event.agent_id,
            task_id: event.task_id ?? null,
            model_used: event.model_used ?? null,
            input_tokens: event.input_tokens ?? null,
            output_tokens: event.output_tokens ?? null,
            cost_usd: event.cost_usd ?? null,
            latency_ms: event.latency_ms ?? null,
            success: event.success ?? true,
            payload: event.payload ?? null,
        })
        if (error) console.error('[telemetry] failed:', error.message)
    } catch {
        // Telemetry must never crash the agent
    }
}

// ── Convenience Helpers ───────────────────────────────────────────────────────

/** Log a model/LLM call with token usage and cost. */
export async function logModelCall(opts: {
    agent_id: string
    model: string
    input_tokens: number
    output_tokens: number
    latency_ms: number
    task_id?: string
    payload?: Record<string, unknown>
    success?: boolean
    error?: string
}): Promise<void> {
    return logEvent({
        event_type: 'model_call',
        agent_id: opts.agent_id,
        task_id: opts.task_id,
        model_used: opts.model,
        input_tokens: opts.input_tokens,
        output_tokens: opts.output_tokens,
        cost_usd: estimateCost(opts.model, opts.input_tokens + opts.output_tokens),
        latency_ms: opts.latency_ms,
        success: opts.success ?? true,
        payload: opts.payload,
    })
}

/** Log a tool call with latency and success/failure. */
export async function logToolCall(opts: {
    agent_id: string
    tool: string
    latency_ms: number
    task_id?: string
    args_preview?: string
    result_preview?: string
    success?: boolean
    error?: string
}): Promise<void> {
    return logEvent({
        event_type: 'tool_call',
        agent_id: opts.agent_id,
        task_id: opts.task_id,
        latency_ms: opts.latency_ms,
        success: opts.success ?? true,
        payload: {
            tool: opts.tool,
            args_preview: opts.args_preview,
            result_preview: opts.result_preview,
            error: opts.error,
        },
    })
}

/** Log a task status update (start, complete, failed, etc.). */
export async function logTaskUpdate(opts: {
    agent_id: string
    task_id: string
    status: string
    payload?: Record<string, unknown>
    success?: boolean
    error?: string
}): Promise<void> {
    return logEvent({
        event_type: 'task_update',
        agent_id: opts.agent_id,
        task_id: opts.task_id,
        payload: { status: opts.status, ...opts.payload },
        success: opts.success ?? true,
    })
}
