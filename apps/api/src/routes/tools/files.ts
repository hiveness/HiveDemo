import type { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { z } from 'zod'

const PROJECT_ROOT = path.resolve(process.cwd(), '../../')

const safePath = (relativePath: string) => {
    const resolved = path.resolve(PROJECT_ROOT, relativePath)
    if (!resolved.startsWith(PROJECT_ROOT)) {
        throw new Error("Path traversal attempt blocked.")
    }
    return resolved
}

export async function filesRouter(app: FastifyInstance) {
    // ── web_search (Serper) ───────────────────────────────────────────────────────
    app.post('/web_search', async (req, reply) => {
        const schema = z.object({
            query: z.string()
        })
        const body = schema.parse(req.body)
        const apiKey = process.env.SERPER_API_KEY

        if (!apiKey) return { error: "Missing SERPER_API_KEY" }

        try {
            const { data } = await axios.post('https://google.serper.dev/search', {
                q: body.query
            }, {
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                }
            })

            const snippets = data.organic?.map((r: any) =>
                `[${r.title}](${r.link})\n${r.snippet}`
            ).join('\n\n') || "No results found."

            return { result: snippets }

        } catch (error: any) {
            return { error: `Search failed: ${error.message}` }
        }
    })

    // ── web_fetch ──────────────────────────────────────────────────────────────────
    app.post('/web_fetch', async (req, reply) => {
        try {
            const schema = z.object({
                url: z.string().url(),
                extract: z.enum(['text', 'links', 'json']).default('text')
            })
            const { url, extract } = schema.parse(req.body)

            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 30000
            })

            if (extract === 'json') {
                return { result: typeof response.data === 'string' ? response.data.slice(0, 8000) : JSON.stringify(response.data).slice(0, 8000) }
            }

            const $ = cheerio.load(response.data)

            if (extract === 'links') {
                const links = $('a[href]').map((_, el) => $(el).attr('href')).get().slice(0, 100)
                return { result: links.join('\n') }
            }

            // Default: clean text
            $('script, style, nav, footer, header').remove()
            const text = $('body').text().replace(/\s+/g, ' ').trim()
            return { result: text.slice(0, 8000) }

        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── delete_file ────────────────────────────────────────────────────────────────
    app.post('/delete_file', async (req, reply) => {
        try {
            const { path: relativePath, recursive } = req.body as any
            const p = safePath(relativePath)

            if (!fs.existsSync(p)) return { result: `Path does not exist: ${relativePath}` }

            const stat = fs.statSync(p)
            if (stat.isDirectory()) {
                if (recursive) {
                    fs.rmSync(p, { recursive: true, force: true })
                } else {
                    fs.rmdirSync(p) // Fails if not empty
                }
            } else {
                fs.unlinkSync(p)
            }
            return { result: `Deleted: ${relativePath}` }
        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── move_file ──────────────────────────────────────────────────────────────────
    app.post('/move_file', async (req, reply) => {
        try {
            const { source, destination } = req.body as any
            const src = safePath(source)
            const dst = safePath(destination)

            const dstDir = path.dirname(dst)
            if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })

            fs.renameSync(src, dst)
            return { result: `Moved ${source} → ${destination}` }
        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── create_directory ───────────────────────────────────────────────────────────
    app.post('/create_directory', async (req, reply) => {
        try {
            const { path: relativePath } = req.body as any
            const p = safePath(relativePath)
            fs.mkdirSync(p, { recursive: true })
            return { result: `Directory created: ${relativePath}` }
        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── append_file ────────────────────────────────────────────────────────────────
    app.post('/append_file', async (req, reply) => {
        try {
            const { path: relativePath, content } = req.body as any
            const p = safePath(relativePath)

            const dir = path.dirname(p)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

            fs.appendFileSync(p, content, 'utf8')
            return { result: `Appended ${content.length} chars to ${relativePath}` }
        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── file_exists ────────────────────────────────────────────────────────────────
    app.post('/file_exists', async (req, reply) => {
        try {
            const { path: relativePath } = req.body as any
            const p = safePath(relativePath)

            if (fs.existsSync(p)) {
                const stat = fs.statSync(p)
                return { result: `EXISTS — size: ${stat.size} bytes, is_dir: ${stat.isDirectory()}` }
            }
            return { result: "NOT FOUND" }
        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })
}
