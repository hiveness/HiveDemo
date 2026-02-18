import 'dotenv/config'
import cron from 'node-cron'
import axios from 'axios'
import Fastify from 'fastify'
import { Redis } from 'ioredis'
import { supabase } from '@hive/db'

const HIVE_API = process.env.HIVE_API_URL!
const HIVE_KEY = process.env.API_KEY!
const redisUrl = process.env.UPSTASH_REDIS_URL
if (!redisUrl) throw new Error('Missing UPSTASH_REDIS_URL')

const api = axios.create({
    baseURL: HIVE_API,
    headers: { 'x-api-key': HIVE_KEY },
})

// Connection for general API calls and DB queries
const connection = new Redis(redisUrl, {
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null,
})

// Dedicated connection for the trigger engine runner (if needed for future BullMQ integration)
// For now, we use the main connection for Supabase calls.

// ── Types ─────────────────────────────────────────────────────────────────────

interface Trigger {
    id: string
    company_id: string
    name: string
    trigger_type: 'schedule' | 'threshold' | 'event'
    enabled: boolean
    cron_expr?: string
    metric?: string
    threshold_op?: string
    threshold_val?: number
    window_mins?: number
    event_type?: string
    goal_template: string
    budget_usd: number
    policy_level: 'auto' | 'approval_required'
    last_fired_at?: string
}

interface PolicyRule {
    id: string
    trigger_type?: string
    max_budget?: number
    goal_patterns?: string[]
    action: 'auto_approve' | 'require_approval' | 'block'
    priority: number
}

// ── Policy Engine ─────────────────────────────────────────────────────────────

async function evaluatePolicy(
    trigger: Trigger,
    goal: string
): Promise<'auto_approve' | 'require_approval' | 'block'> {
    // 1. Always block if trigger explicitly requires it
    if (trigger.policy_level === 'approval_required') return 'require_approval'

    // 2. Load company policy rules
    const { data: rules } = await supabase
        .from('policy_rules')
        .select('*')
        .eq('company_id', trigger.company_id)
        .eq('enabled', true)
        .order('priority', { ascending: false })

    if (!rules || rules.length === 0) {
        // No rules = default to safe: require approval
        return 'require_approval'
    }

    // 3. Evaluate rules in priority order — first match wins
    for (const rule of rules as PolicyRule[]) {
        let matches = true

        // Check trigger type filter
        if (rule.trigger_type && rule.trigger_type !== trigger.trigger_type) {
            matches = false
        }

        // Check budget filter
        if (rule.max_budget && trigger.budget_usd > rule.max_budget) {
            matches = false
        }

        // Check goal pattern filter
        if (rule.goal_patterns && rule.goal_patterns.length > 0) {
            const goalMatches = rule.goal_patterns.some(pattern => {
                try { return new RegExp(pattern, 'i').test(goal) }
                catch { return false }
            })
            if (!goalMatches) matches = false
        }

        if (matches) return rule.action
    }

    // No rule matched — default safe
    return 'require_approval'
}

// ── Fire a trigger ────────────────────────────────────────────────────────────

async function fireTrigger(trigger: Trigger, context: Record<string, unknown> = {}) {
    // Interpolate {{variables}} in goal template
    let goal = trigger.goal_template
    for (const [key, val] of Object.entries(context)) {
        goal = goal.replace(new RegExp(`{{${key}}}`, 'g'), String(val))
    }

    console.log(`[Trigger] Firing: "${trigger.name}" → "${goal}"`)

    const decision = await evaluatePolicy(trigger, goal)

    if (decision === 'block') {
        console.log(`[Policy] BLOCKED: "${trigger.name}"`)
        await logTriggerFire(trigger.id, 'blocked')
        return
    }

    if (decision === 'auto_approve') {
        // Fire directly
        const { data: task } = await api.post('/goals', {
            goal,
            budget_usd: trigger.budget_usd,
        })
        await logTriggerFire(trigger.id, 'auto_fired')
        console.log(`[Policy] AUTO: task ${task.task_id?.slice(0, 8)} created`)

        // Notify via Telegram (informational, no buttons needed)
        await notifyTelegram(
            `⚡ <b>Auto-triggered:</b> ${trigger.name}\n<i>${goal}</i>\nTask: <code>${task.task_id?.slice(0, 8)}</code>`,
            null  // no approval buttons
        )
        return
    }

    // require_approval — create a pending approval and ask on Telegram
    const { data: approval } = await supabase
        .from('pending_approvals')
        .insert({
            trigger_id: trigger.id,
            company_id: trigger.company_id,
            goal,
            context,
        })
        .select()
        .single()

    await logTriggerFire(trigger.id, 'pending_approval')

    const msgId = await notifyTelegram(
        `🔔 <b>Approval needed:</b> ${trigger.name}\n\n` +
        `<b>Goal:</b> ${goal}\n` +
        `<b>Budget:</b> $${trigger.budget_usd}\n` +
        `<b>Trigger:</b> ${trigger.trigger_type}\n\n` +
        `Expires in 24 hours.`,
        approval.id  // pass approval ID so bot can handle the callback
    )

    // Save Telegram message ID so we can edit it after decision
    if (msgId) {
        await supabase
            .from('pending_approvals')
            .update({ telegram_msg_id: String(msgId) })
            .eq('id', approval.id)
    }

    console.log(`[Policy] APPROVAL REQUESTED: ${approval.id}`)
}

// ── Telegram notification ─────────────────────────────────────────────────────

async function notifyTelegram(text: string, approvalId: string | null): Promise<number | null> {
    const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!chatId || !token) return null

    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const body: any = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
    }

    if (approvalId) {
        body.reply_markup = {
            inline_keyboard: [[
                { text: '✅ Approve', callback_data: `trigger_approve:${approvalId}` },
                { text: '❌ Reject', callback_data: `trigger_reject:${approvalId}` },
            ]]
        }
    }

    try {
        const { data } = await axios.post(url, body)
        return data.result?.message_id ?? null
    } catch (err: any) {
        console.error('[Telegram] notify failed:', err.message)
        return null
    }
}

// ── Log trigger fire ──────────────────────────────────────────────────────────

async function logTriggerFire(triggerId: string, outcome: string) {
    // Use RPC or raw SQL for increment to avoid race conditions
    await supabase.rpc('increment_trigger_fire_count', { trigger_uuid: triggerId })

    await supabase
        .from('triggers')
        .update({
            last_fired_at: new Date().toISOString(),
        })
        .eq('id', triggerId)

    // Also log to telemetry (agent_id is required; use trigger ID as a stand-in UUID)
    await supabase.from('telemetry_events').insert({
        agent_id: triggerId,
        event_type: 'trigger_fire',
        payload: { trigger_id: triggerId, outcome },
        success: outcome !== 'blocked',
    })
}

// ── Seed default policy rules ─────────────────────────────────────────────────

async function seedDefaultPolicies(companyId: string) {
    const { data: existing } = await supabase
        .from('policy_rules')
        .select('id')
        .eq('company_id', companyId)
        .limit(1)

    if (existing && existing.length > 0) return // already seeded

    await supabase.from('policy_rules').insert([
        {
            company_id: companyId,
            name: 'Block high-budget auto triggers',
            trigger_type: null,
            max_budget: 5,
            action: 'require_approval',
            priority: 10,
            description: 'Anything over $5 always needs approval',
        },
        {
            company_id: companyId,
            name: 'Auto-approve reports and summaries',
            trigger_type: 'schedule',
            max_budget: 2,
            goal_patterns: ['summary', 'report', 'digest', 'recap', 'weekly', 'daily'],
            action: 'auto_approve',
            priority: 8,
            description: 'Scheduled summaries under $2 run automatically',
        },
        {
            company_id: companyId,
            name: 'Require approval for anything external',
            trigger_type: null,
            goal_patterns: ['email', 'publish', 'deploy', 'post', 'send', 'tweet', 'launch'],
            action: 'require_approval',
            priority: 9,
            description: 'Anything that touches the outside world needs human approval',
        },
    ])

    console.log(`[Policy] Default rules seeded for company ${companyId}`)
}

// ── Schedule trigger runner ───────────────────────────────────────────────────

const activeJobs = new Map<string, cron.ScheduledTask>()

async function loadScheduleTriggers() {
    const { data: triggers } = await supabase
        .from('triggers')
        .select('*')
        .eq('trigger_type', 'schedule')
        .eq('enabled', true)

    if (!triggers) return

    // Cancel existing jobs
    for (const [id, job] of activeJobs) {
        job.stop()
        activeJobs.delete(id)
    }

    // Register new jobs
    for (const trigger of triggers as Trigger[]) {
        if (!trigger.cron_expr) continue
        if (!cron.validate(trigger.cron_expr)) {
            console.warn(`[Cron] Invalid expression for trigger ${trigger.id}: ${trigger.cron_expr}`)
            continue
        }

        const job = cron.schedule(trigger.cron_expr, async () => {
            await fireTrigger(trigger, {
                timestamp: new Date().toISOString(),
                day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
                date: new Date().toISOString().slice(0, 10),
            })
        }, { timezone: 'UTC' })

        activeJobs.set(trigger.id, job)
        console.log(`[Cron] Scheduled: "${trigger.name}" → ${trigger.cron_expr}`)
    }

    console.log(`[Cron] ${activeJobs.size} schedule triggers active`)
}

// ── Threshold trigger evaluator (runs every 5 minutes) ───────────────────────

async function evaluateThresholds() {
    const { data: triggers } = await supabase
        .from('triggers')
        .select('*')
        .eq('trigger_type', 'threshold')
        .eq('enabled', true)

    if (!triggers) return

    for (const trigger of triggers as Trigger[]) {
        if (!trigger.metric || !trigger.threshold_op || trigger.threshold_val == null) continue

        const windowMins = trigger.window_mins ?? 60
        const since = new Date(Date.now() - windowMins * 60 * 1000).toISOString()

        let currentValue: number | null = null

        // Compute the metric
        if (trigger.metric === 'task_failure_rate') {
            const { data: events } = await supabase
                .from('telemetry_events')
                .select('success')
                .gte('created_at', since)
                .eq('event_type', 'task_complete')

            if (events && events.length >= 5) { // need at least 5 events to be meaningful
                const failures = events.filter(e => !e.success).length
                currentValue = (failures / events.length) * 100
            }

        } else if (trigger.metric === 'spend_usd') {
            const { data: events } = await supabase
                .from('telemetry_events')
                .select('cost_usd')
                .gte('created_at', since)

            if (events) {
                currentValue = events.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0)
            }

        } else if (trigger.metric === 'tasks_completed') {
            const { count } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'completed')
                .gte('created_at', since)

            currentValue = count ?? 0
        }

        if (currentValue === null) continue

        // Evaluate threshold condition
        let breached = false
        if (trigger.threshold_op === 'gt') breached = currentValue > trigger.threshold_val
        if (trigger.threshold_op === 'gte') breached = currentValue >= trigger.threshold_val
        if (trigger.threshold_op === 'lt') breached = currentValue < trigger.threshold_val
        if (trigger.threshold_op === 'lte') breached = currentValue <= trigger.threshold_val
        if (trigger.threshold_op === 'eq') breached = currentValue === trigger.threshold_val

        if (breached) {
            // Don't fire more than once per window
            if (trigger.last_fired_at) {
                const lastFired = new Date(trigger.last_fired_at).getTime()
                if (Date.now() - lastFired < windowMins * 60 * 1000) continue
            }

            await fireTrigger(trigger, {
                metric: trigger.metric,
                current_value: currentValue.toFixed(2),
                threshold: trigger.threshold_val,
                window_mins: windowMins,
            })
        }
    }
}

// ── API: CRUD for triggers + approval handling ────────────────────────────────

const app = Fastify({ logger: false })

// Health
app.get('/health', async () => ({
    status: 'ok', service: 'trigger-engine',
    active_cron_jobs: activeJobs.size,
    ts: new Date().toISOString(),
}))

// List triggers
app.get('/triggers', async (req, reply) => {
    if ((req.headers['x-api-key'] as string) !== HIVE_KEY) return reply.status(401).send({ error: 'Unauthorized' })
    const { data } = await supabase.from('triggers').select('*').order('created_at', { ascending: false })
    return { triggers: data ?? [] }
})

// Create trigger
app.post('/triggers', async (req, reply) => {
    if ((req.headers['x-api-key'] as string) !== HIVE_KEY) return reply.status(401).send({ error: 'Unauthorized' })

    const body = req.body as any
    const { data, error } = await supabase.from('triggers').insert(body).select().single()
    if (error) return reply.status(400).send({ error: error.message })

    // Reload cron jobs if it's a schedule trigger
    if (data.trigger_type === 'schedule') await loadScheduleTriggers()

    return reply.status(201).send(data)
})

// Toggle trigger on/off
app.patch('/triggers/:id/toggle', async (req, reply) => {
    if ((req.headers['x-api-key'] as string) !== HIVE_KEY) return reply.status(401).send({ error: 'Unauthorized' })

    const { id } = req.params as { id: string }
    const { data: current } = await supabase.from('triggers').select('enabled').eq('id', id).single()
    if (!current) return reply.status(404).send({ error: 'Not found' })

    const { data } = await supabase.from('triggers')
        .update({ enabled: !current.enabled })
        .eq('id', id).select().single()

    await loadScheduleTriggers() // reload
    return data
})

// Handle approval decision (called by Telegram bot callback)
app.post('/approvals/:id/decide', async (req, reply) => {
    if ((req.headers['x-api-key'] as string) !== HIVE_KEY) return reply.status(401).send({ error: 'Unauthorized' })

    const { id } = req.params as { id: string }
    const { decision } = req.body as { decision: 'approved' | 'rejected' }

    const { data: approval } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('id', id)
        .eq('status', 'pending')
        .single()

    if (!approval) return reply.status(404).send({ error: 'Approval not found or already decided' })
    if (new Date(approval.expires_at) < new Date()) {
        await supabase.from('pending_approvals').update({ status: 'expired' }).eq('id', id)
        return reply.status(410).send({ error: 'Approval expired' })
    }

    await supabase.from('pending_approvals')
        .update({ status: decision, decided_at: new Date().toISOString() })
        .eq('id', id)

    if (decision === 'approved') {
        const task = await api.post('/goals', {
            goal: approval.goal,
            budget_usd: 2,
        })
        console.log(`[Approval] APPROVED → task ${task.data.task_id?.slice(0, 8)}`)
        return { approved: true, task_id: task.data.task_id }
    }

    console.log(`[Approval] REJECTED: ${approval.goal}`)
    return { approved: false }
})

// List pending approvals
app.get('/approvals', async (req, reply) => {
    if ((req.headers['x-api-key'] as string) !== HIVE_KEY) return reply.status(401).send({ error: 'Unauthorized' })
    const { data } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
    return { approvals: data ?? [] }
})

// Seed default policies for a company
app.post('/policies/seed', async (req, reply) => {
    if ((req.headers['x-api-key'] as string) !== HIVE_KEY) return reply.status(401).send({ error: 'Unauthorized' })
    const { company_id } = req.body as { company_id: string }
    await seedDefaultPolicies(company_id)
    return { seeded: true }
})

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
    await loadScheduleTriggers()

    // Threshold checks every 5 minutes
    cron.schedule('*/5 * * * *', evaluateThresholds)

    // Reload schedule triggers every 10 minutes (picks up DB changes)
    cron.schedule('*/10 * * * *', loadScheduleTriggers)

    const PORT = Number(process.env.PORT ?? 3003)
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`[Trigger Engine] Running on port ${PORT}`)
}

start().catch(console.error)
