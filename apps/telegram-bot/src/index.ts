import { Telegraf, Markup } from 'telegraf'
import axios from 'axios'
import 'dotenv/config'

const botToken = process.env.TELEGRAM_BOT_TOKEN
if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN')

const bot = new Telegraf(botToken)
const HIVE_API = process.env.HIVE_API_URL || 'http://localhost:3001'
const HIVE_KEY = process.env.API_KEY || 'test'

// ── API helpers ───────────────────────────────────────────────────────────────

const api = axios.create({
    baseURL: HIVE_API,
    headers: { 'x-api-key': HIVE_KEY },
})

async function chatWithAgent(sessionId: string, message: string, agentId: string = 'orchestrator') {
    try {
        const { data } = await api.post('/chat', {
            agentId,
            sessionId: `telegram-${sessionId}`,
            message,
            history: [], // TODO: maintain history or let backend handle simple context
        })
        return data
    } catch (err: any) {
        throw new Error(err.response?.data?.error || err.message)
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
    await ctx.reply(
        `👋 <b>HIVE Agent</b>\n\n` +
        `I am your AI agent. I can help you build software, research, and manage tasks.\n\n` +
        `Just type what you need.`,
        { parse_mode: 'HTML' }
    )
})

bot.help(async (ctx) => {
    await ctx.reply(
        `<b>Commands</b>\n\n` +
        `/clear — clear session memory (new conversation)\n` +
        `Or just type your request.`,
        { parse_mode: 'HTML' }
    )
})

// ── Plain text = chat ─────────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim()
    if (text.startsWith('/')) return

    const sentinel = await ctx.reply('🤔 Thinking...')

    try {
        const result = await chatWithAgent(String(ctx.chat.id), text)

        let replyText = result.text || "I'm not sure how to respond."

        // Append confidence or action taken if available
        // (The new chat logic puts this in the text usually)

        // Show tool usage if any
        if (result.tool_calls_made && result.tool_calls_made.length > 0) {
            const tools = result.tool_calls_made.map((t: any) => `🔨 ${t.tool}`).join(', ')
            replyText += `\n\n<i>Used: ${tools}</i>`
        }

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            sentinel.message_id,
            undefined,
            replyText,
            { parse_mode: 'HTML' }
        )

    } catch (err: any) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            sentinel.message_id,
            undefined,
            `❌ Error: ${err.message}`
        )
    }
})

// ── Start ─────────────────────────────────────────────────────────────────────
async function boot() {
    console.log('[Telegram Bot] Connecting to HIVE API at', HIVE_API)
    console.log('[Telegram Bot] Running')
    await bot.launch()
}

boot().catch(console.error)

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
