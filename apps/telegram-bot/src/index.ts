import 'dotenv/config'
import { Telegraf, Markup } from 'telegraf'
import axios from 'axios'

const botToken = process.env.TELEGRAM_BOT_TOKEN
if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN')

const bot = new Telegraf(botToken)
const HIVE_API = process.env.HIVE_API_URL!
const HIVE_KEY = process.env.API_KEY!
const FOUNDER_CHAT_ID = Number(process.env.TELEGRAM_FOUNDER_CHAT_ID!)

// ── API helpers ───────────────────────────────────────────────────────────────

const api = axios.create({
    baseURL: HIVE_API,
    headers: { 'x-api-key': HIVE_KEY },
})

async function postGoal(goal: string, budgetUsd = 2) {
    const { data } = await api.post('/goals', { goal, budget_usd: budgetUsd })
    return data as { task_id: string; status: string }
}

async function getTask(taskId: string) {
    const { data } = await api.get(`/tasks/${taskId}`)
    return data
}

async function listTasks() {
    const { data } = await api.get('/tasks')
    return data.tasks as any[]
}

async function getTelemetry() {
    const { data } = await api.get('/telemetry')
    return data
}

// ── Formatting ────────────────────────────────────────────────────────────────

const STATUS_EMOJI: Record<string, string> = {
    completed: '✅',
    failed: '❌',
    in_progress: '⚙️',
    pending: '🕐',
    blocked_budget: '💸',
}

function fmtTask(task: any): string {
    const e = STATUS_EMOJI[task.status] ?? '•'
    return `${e} <b>${task.goal}</b>\n<code>${task.id.slice(0, 8)}</code> · ${task.status}`
}

// ── Commands ──────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
    await ctx.reply(
        `👋 <b>HIVE is live</b>\n\n` +
        `Just type a goal — no commands needed.\n\n` +
        `Or use:\n` +
        `/goal [text] — run a goal\n` +
        `/tasks — last 10 tasks\n` +
        `/result [id] — get task output\n` +
        `/status — spend + success rate\n` +
        `/approve [id] — approve a task\n` +
        `/help — show this again`,
        { parse_mode: 'HTML' }
    )
})

bot.help(async (ctx) => {
    await ctx.reply(
        `<b>Commands</b>\n\n` +
        `/goal [text] — send a goal to your agents\n` +
        `/tasks — last 10 tasks with status\n` +
        `/result [id] — get full result for a task\n` +
        `/status — spend and success rate\n` +
        `/approve [id] — mark a task approved\n\n` +
        `Or just type any goal directly.`,
        { parse_mode: 'HTML' }
    )
})

// /goal write a welcome email
bot.command('goal', async (ctx) => {
    const goal = ctx.message.text.replace('/goal', '').trim()
    if (!goal) {
        await ctx.reply('Usage: <code>/goal write a welcome email for new users</code>', { parse_mode: 'HTML' })
        return
    }
    await runGoal(ctx, goal)
})

// /tasks — list recent
bot.command('tasks', async (ctx) => {
    try {
        const tasks = await listTasks()
        if (!tasks.length) {
            await ctx.reply('No tasks yet. Type a goal to get started.')
            return
        }
        const lines = tasks.slice(0, 10).map(fmtTask).join('\n\n')
        await ctx.reply(`<b>Recent tasks:</b>\n\n${lines}`, { parse_mode: 'HTML' })
    } catch (err: any) {
        await ctx.reply(`❌ ${err.message}`)
    }
})

// /status — telemetry
bot.command('status', async (ctx) => {
    try {
        const tel = await getTelemetry()
        await ctx.reply(
            `📊 <b>HIVE Status</b>\n\n` +
            `Spend: <code>$${tel.total_spend_usd}</code>\n` +
            `Success rate: <code>${tel.success_rate}</code>\n` +
            `Total tasks: <code>${tel.total_events}</code>`,
            { parse_mode: 'HTML' }
        )
    } catch (err: any) {
        await ctx.reply(`❌ ${err.message}`)
    }
})

// /result [id_prefix]
bot.command('result', async (ctx) => {
    const prefix = ctx.message.text.replace('/result', '').trim()
    if (!prefix) {
        await ctx.reply('Usage: <code>/result abc12345</code>', { parse_mode: 'HTML' })
        return
    }

    try {
        const tasks = await listTasks()
        const match = tasks.find(t => t.id.startsWith(prefix))
        if (!match) {
            await ctx.reply(`No task found starting with <code>${prefix}</code>`, { parse_mode: 'HTML' })
            return
        }

        const { task, subtasks } = await getTask(match.id)
        const subtaskLines = (subtasks as any[])
            .map((s: any) => `${STATUS_EMOJI[s.status] ?? '•'} ${s.goal}`)
            .join('\n')

        let text = `${STATUS_EMOJI[task.status]} <b>${task.goal}</b>\nStatus: <code>${task.status}</code>\n`
        if (subtaskLines) text += `\n<b>Subtasks:</b>\n${subtaskLines}\n`
        if (task.result) text += `\n<b>Result:</b>\n${task.result.slice(0, 900)}`
        if (task.result?.length > 900) text += '\n\n<i>(truncated — full result in Supabase)</i>'

        await ctx.reply(text, { parse_mode: 'HTML' })
    } catch (err: any) {
        await ctx.reply(`❌ ${err.message}`)
    }
})

// /approve [id_prefix]
bot.command('approve', async (ctx) => {
    const prefix = ctx.message.text.replace('/approve', '').trim()
    if (!prefix) {
        await ctx.reply('Usage: <code>/approve abc12345</code>', { parse_mode: 'HTML' })
        return
    }

    try {
        const tasks = await listTasks()
        const match = tasks.find(t => t.id.startsWith(prefix))
        if (!match) {
            await ctx.reply(`No task found with ID starting <code>${prefix}</code>`, { parse_mode: 'HTML' })
            return
        }

        await ctx.reply(`✅ Task <code>${prefix}</code> approved and logged.`, { parse_mode: 'HTML' })
    } catch (err: any) {
        await ctx.reply(`❌ ${err.message}`)
    }
})

// ── Plain text = goal ─────────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
    if ((ctx.message.text ?? '').startsWith('/')) return
    await runGoal(ctx, ctx.message.text.trim())
})

// ── Core: run a goal and poll for result ──────────────────────────────────────
async function runGoal(ctx: any, goal: string) {
    const sent = await ctx.reply('⏳ Sending to agents...')

    try {
        const task = await postGoal(goal)

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            sent.message_id,
            undefined,
            `🚀 <b>Running:</b> ${goal}\nTask <code>${task.task_id.slice(0, 8)}</code> — I'll notify you when done.`,
            { parse_mode: 'HTML' }
        )

        pollAndNotify(task.task_id, ctx.chat.id)
    } catch (err: any) {
        await ctx.telegram.editMessageText(
            ctx.chat.id, sent.message_id, undefined,
            `❌ Failed to start: ${err.message}`
        )
    }
}

// ── Poll + notify when task completes ─────────────────────────────────────────
async function pollAndNotify(taskId: string, chatId: number, attempts = 0) {
    if (attempts > 36) { // 3 minute timeout
        await bot.telegram.sendMessage(chatId,
            `⏰ Task <code>${taskId.slice(0, 8)}</code> is taking longer than expected.\nCheck with /result ${taskId.slice(0, 8)}`,
            { parse_mode: 'HTML' }
        )
        return
    }

    setTimeout(async () => {
        try {
            const { task, subtasks } = await getTask(taskId)

            if (task.status === 'completed') {
                const completedSubs = (subtasks as any[]).filter(s => s.status === 'completed')
                const subLines = completedSubs.map(s => `✅ ${s.goal}`).join('\n')
                const preview = task.result?.slice(0, 700) ?? ''
                const truncated = (task.result?.length ?? 0) > 700 ? '\n\n<i>(use /result for full output)</i>' : ''

                await bot.telegram.sendMessage(
                    chatId,
                    `✅ <b>Done:</b> ${task.goal}\n` +
                    (subLines ? `\n<b>Subtasks:</b>\n${subLines}\n` : '') +
                    (preview ? `\n<b>Result:</b>\n${preview}${truncated}` : ''),
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([[
                            Markup.button.callback('👍 Approved', `ok:${task.id}`),
                            Markup.button.callback('🔁 Redo', `redo:${task.id}:${encodeURIComponent(task.goal.slice(0, 60))}`),
                        ]])
                    }
                )

            } else if (task.status === 'failed') {
                await bot.telegram.sendMessage(
                    chatId,
                    `❌ <b>Failed:</b> ${task.goal}\n${task.result ?? 'No error details.'}`,
                    { parse_mode: 'HTML' }
                )

            } else if (task.status === 'blocked_budget') {
                await bot.telegram.sendMessage(
                    chatId,
                    `💸 <b>Budget cap hit:</b> ${task.goal}\n${task.result}`,
                    { parse_mode: 'HTML' }
                )

            } else {
                // Still running — keep polling
                pollAndNotify(taskId, chatId, attempts + 1)
            }
        } catch {
            pollAndNotify(taskId, chatId, attempts + 1)
        }
    }, 5_000) // check every 5 seconds
}

// ── Inline button callbacks ───────────────────────────────────────────────────
bot.action(/^ok:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Approved ✅')
    await ctx.editMessageReplyMarkup(undefined) // remove buttons
    await ctx.reply('✅ Logged as approved.')
})

bot.action(/^redo:([^:]+):(.+)$/, async (ctx) => {
    const taskId = ctx.match[1]
    const originalGoal = decodeURIComponent(ctx.match[2])

    await ctx.answerCbQuery('Re-running...')
    await ctx.editMessageReplyMarkup(undefined)

    const goal = `${originalGoal} — revised, improve on the previous attempt`
    await runGoal(ctx, goal)
})

// ── Start ─────────────────────────────────────────────────────────────────────
bot.launch()
console.log('[Telegram Bot] Running')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
