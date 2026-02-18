import type { FastifyInstance } from 'fastify'
import { chromium, Browser, Page, BrowserContext } from 'playwright'
import { z } from 'zod'

// ── Session Store ─────────────────────────────────────────────────────────────
// Maps sessionId -> active page & context
interface BrowserSession {
    page: Page
    context: BrowserContext
    lastActivity: number
}

const sessions = new Map<string, BrowserSession>()
let browserInstance: Browser | null = null

async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage']
        })
    }
    return browserInstance
}

async function getPage(sessionId: string): Promise<Page> {
    const existing = sessions.get(sessionId)
    if (existing) {
        existing.lastActivity = Date.now()
        return existing.page
    }

    const browser = await getBrowser()
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    const page = await context.newPage()

    sessions.set(sessionId, {
        page,
        context,
        lastActivity: Date.now()
    })

    return page
}

// Cleanup stale sessions every 5 minutes
setInterval(async () => {
    const now = Date.now()
    const TASKS_TIMEOUT = 30 * 60 * 1000 // 30 mins

    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastActivity > TASKS_TIMEOUT) {
            console.log(`[Browser] Closing stale session: ${sessionId}`)
            await session.context.close().catch(() => { })
            sessions.delete(sessionId)
        }
    }
}, 5 * 60 * 1000)


export async function browserRouter(app: FastifyInstance) {

    // ── browser_open ──────────────────────────────────────────────────────────────
    app.post('/open', async (req, reply) => {
        try {
            const schema = z.object({
                session_id: z.string(),
                url: z.string().url(),
                wait_for: z.string().optional(),
                screenshot: z.boolean().default(false)
            })
            const { session_id, url, wait_for, screenshot } = schema.parse(req.body)

            const page = await getPage(session_id)
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

            if (wait_for) {
                await page.waitForSelector(wait_for, { timeout: 10000 })
            }

            // Extract clean text
            const text = await page.evaluate(() => {
                const removals = document.querySelectorAll('script, style, nav, footer, header, [aria-hidden]')
                removals.forEach(el => el.remove())
                return document.body?.innerText ?? ''
            })

            const result: any = {
                result: `Opened ${url}\n\nPage text:\n${text.slice(0, 6000)}`
            }

            if (screenshot) {
                const buffer = await page.screenshot({ type: 'png' })
                result.screenshot_b64 = buffer.toString('base64')
            }

            return result

        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── browser_click ─────────────────────────────────────────────────────────────
    app.post('/click', async (req, reply) => {
        try {
            const schema = z.object({
                session_id: z.string(),
                selector: z.string(),
                timeout_ms: z.number().default(5000)
            })
            const { session_id, selector, timeout_ms } = schema.parse(req.body)

            const page = await getPage(session_id)
            await page.click(selector, { timeout: timeout_ms })
            try {
                await page.waitForLoadState('networkidle', { timeout: 10000 })
            } catch { } // Ignore timeout waiting for net idle, page might just change DOM

            return { result: `Clicked '${selector}'. Page URL is now: ${page.url()}` }

        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── browser_fill ──────────────────────────────────────────────────────────────
    app.post('/fill', async (req, reply) => {
        try {
            const schema = z.object({
                session_id: z.string(),
                selector: z.string(),
                value: z.string()
            })
            const { session_id, selector, value } = schema.parse(req.body)

            const page = await getPage(session_id)
            await page.fill(selector, value)

            return { result: `Filled '${selector}' with value (length=${value.length})` }

        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── browser_get_text ──────────────────────────────────────────────────────────
    app.post('/get_text', async (req, reply) => {
        try {
            const schema = z.object({
                session_id: z.string(),
                selector: z.string().optional()
            })
            const { session_id, selector } = schema.parse(req.body)
            const page = await getPage(session_id)

            let text = ''
            if (selector) {
                const locator = page.locator(selector).first()
                if (await locator.count() === 0) {
                    return { result: `No element found for selector: ${selector}` }
                }
                text = await locator.innerText()
            } else {
                text = await page.evaluate(() => document.body?.innerText ?? '')
            }

            return { result: text.slice(0, 6000) }

        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── browser_screenshot ────────────────────────────────────────────────────────
    app.post('/screenshot', async (req, reply) => {
        try {
            const schema = z.object({
                session_id: z.string(),
                full_page: z.boolean().default(false)
            })
            const { session_id, full_page } = schema.parse(req.body)
            const page = await getPage(session_id)

            const buffer = await page.screenshot({ type: 'png', fullPage: full_page })
            const b64 = buffer.toString('base64')

            return {
                result: `Screenshot captured (${buffer.length} bytes)`,
                screenshot_b64: b64
            }

        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── browser_close ─────────────────────────────────────────────────────────────
    app.post('/close', async (req, reply) => {
        try {
            const { session_id } = req.body as { session_id: string }
            const session = sessions.get(session_id)
            if (session) {
                await session.context.close()
                sessions.delete(session_id)
            }
            return { result: "Browser session closed." }
        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })
}
