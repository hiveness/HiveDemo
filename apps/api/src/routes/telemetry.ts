import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

// Matches the actual telemetry_events table schema in the database:
//   id, agent_id, task_id, event_type, model_used, input_tokens, output_tokens,
//   cost_usd, latency_ms, success, payload, created_at
interface LogRequest {
    event_type: string
    agent_id: string
    task_id?: string
    model_used?: string
    input_tokens?: number
    output_tokens?: number
    cost_usd?: number
    latency_ms?: number
    success?: boolean
    payload?: Record<string, unknown>
}

// ── Core log function ─────────────────────────────────────────────────────────

/**
 * Fire-and-forget telemetry log. Never raises — failures are silently swallowed.
 * This is the single source of truth for all telemetry writes.
 */
export async function logTelemetryEvent(event: LogRequest): Promise<void> {
    try {
        const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!
        )
        await supabase.from('telemetry_events').insert({
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
    } catch {
        // Telemetry must never crash the agent
    }
}

// ── Fastify Routes ────────────────────────────────────────────────────────────

export async function telemetryRoutes(app: FastifyInstance) {
    /**
     * POST /telemetry/log
     * Accepts a telemetry event from any service (chat route, agents, etc.)
     * and writes it to Supabase. Fire-and-forget — always returns { ok: true }.
     */
    app.post('/log', async (req, reply) => {
        const body = req.body as LogRequest

        // Validate required fields
        if (!body?.event_type || !body?.agent_id) {
            return reply.status(400).send({ error: 'event_type and agent_id are required' })
        }

        // Non-blocking — we don't await the insert in the response path
        logTelemetryEvent(body).catch(() => {})

        return { ok: true }
    })

    /**
     * GET /telemetry/summary/:agent_id?days=7
     * Returns aggregated stats for an agent over the last N days.
     * Powered by the agent_telemetry_summary() SQL function.
     */
    app.get('/summary/:agent_id', async (req, reply) => {
        const { agent_id } = req.params as { agent_id: string }
        const { days } = req.query as { days?: string }
        const daysInt = Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 90)

        try {
            const supabase = createClient(
                process.env.SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_KEY!
            )

            const { data, error } = await supabase.rpc('agent_telemetry_summary', {
                p_agent_id: agent_id,
                p_days: daysInt,
            })

            if (error) {
                app.log.error({ err: error.message }, '[telemetry] summary RPC error')
                return reply.status(500).send({ error: error.message })
            }

            return {
                agent_id,
                days: daysInt,
                summary: data ?? {
                    total_tool_calls: 0,
                    total_model_calls: 0,
                    success_rate: null,
                    total_cost_usd: 0,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    avg_latency_ms: null,
                },
            }
        } catch (err: any) {
            app.log.error({ err: err.message }, '[telemetry] summary error')
            return reply.status(500).send({ error: err.message })
        }
    })

    /**
     * GET /telemetry/events/:agent_id?limit=50&event_type=tool_call
     * Returns raw recent events for an agent (useful for debugging / HQ dashboard).
     */
    app.get('/events/:agent_id', async (req, reply) => {
        const { agent_id } = req.params as { agent_id: string }
        const { limit, event_type } = req.query as { limit?: string; event_type?: string }
        const limitInt = Math.min(parseInt(limit ?? '50', 10) || 50, 200)

        try {
            const supabase = createClient(
                process.env.SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_KEY!
            )

            let query = supabase
                .from('telemetry_events')
                .select('*')
                .eq('agent_id', agent_id)
                .order('created_at', { ascending: false })
                .limit(limitInt)

            if (event_type) {
                query = query.eq('event_type', event_type)
            }

            const { data, error } = await query

            if (error) {
                return reply.status(500).send({ error: error.message })
            }

            return { agent_id, events: data ?? [] }
        } catch (err: any) {
            return reply.status(500).send({ error: err.message })
        }
    })
}
