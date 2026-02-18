import type { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { getGoogleClient } from '../../utils/google-auth'
import { z } from 'zod'

export async function gmailRouter(app: FastifyInstance) {

    // ── gmail_list ────────────────────────────────────────────────────────────────
    app.post('/list', async (req, reply) => {
        const schema = z.object({
            query: z.string().default('is:unread'),
            max_results: z.number().default(10),
            user_id: z.string().default('gmail')
        })

        const body = schema.parse(req.body)
        const auth = await getGoogleClient(body.user_id)
        const gmail = google.gmail({ version: 'v1', auth })

        const res = await gmail.users.messages.list({
            userId: 'me',
            q: body.query,
            maxResults: body.max_results
        })

        const messages = res.data.messages || []
        if (messages.length === 0) return { result: "No messages found matching query." }

        const summaries = []
        // Fetch details in parallel (limited batch)
        const details = await Promise.all(messages.map(msg =>
            gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata',
                metadataHeaders: ['Subject', 'From', 'Date']
            })
        ))

        for (const detail of details) {
            const headers: any = {}
            detail.data.payload?.headers?.forEach(h => { headers[h.name!] = h.value })
            summaries.push(`ID: ${detail.data.id} | From: ${headers.From || '?'} | Subject: ${headers.Subject || '?'} | Date: ${headers.Date || '?'}`)
        }

        return { result: summaries.join('\n') }
    })

    // ── gmail_read ────────────────────────────────────────────────────────────────
    app.post('/read', async (req, reply) => {
        const schema = z.object({
            message_id: z.string(),
            user_id: z.string().default('gmail')
        })
        const body = schema.parse(req.body)
        const auth = await getGoogleClient(body.user_id)
        const gmail = google.gmail({ version: 'v1', auth })

        const msg = await gmail.users.messages.get({
            userId: 'me',
            id: body.message_id,
            format: 'full'
        })

        const payload = msg.data.payload
        const headers: any = {}
        payload?.headers?.forEach(h => { headers[h.name!] = h.value })

        let bodyText = ''
        if (payload?.body?.data) {
            bodyText = Buffer.from(payload.body.data, 'base64').toString('utf-8')
        } else if (payload?.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8')
                    break
                }
            }
        }

        return {
            result: `From: ${headers.From}\nTo: ${headers.To}\nSubject: ${headers.Subject}\nDate: ${headers.Date}\n\n${bodyText.slice(0, 4000)}`
        }
    })

    // ── gmail_send ────────────────────────────────────────────────────────────────
    app.post('/send', async (req, reply) => {
        const schema = z.object({
            to: z.string(),
            subject: z.string(),
            body: z.string(),
            cc: z.string().optional(),
            reply_to_id: z.string().optional(),
            user_id: z.string().default('gmail')
        })
        const body = schema.parse(req.body)
        const auth = await getGoogleClient(body.user_id)
        const gmail = google.gmail({ version: 'v1', auth })

        const messageParts = [
            `To: ${body.to}`,
            `Subject: ${body.subject}`,
            body.cc ? `Cc: ${body.cc}` : '',
            '',
            body.body
        ].filter(Boolean).join('\n')

        const encodedMessage = Buffer.from(messageParts)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')

        const sendBody: any = { raw: encodedMessage }

        if (body.reply_to_id) {
            const original = await gmail.users.messages.get({ userId: 'me', id: body.reply_to_id })
            if (original.data.threadId) {
                sendBody.threadId = original.data.threadId
            }
        }

        await gmail.users.messages.send({
            userId: 'me',
            requestBody: sendBody
        })

        return { result: `Email sent to ${body.to} — Subject: ${body.subject}` }
    })

    // ── gmail_draft ───────────────────────────────────────────────────────────────
    app.post('/draft', async (req, reply) => {
        const schema = z.object({
            to: z.string(),
            subject: z.string(),
            body: z.string(),
            user_id: z.string().default('gmail')
        })
        const body = schema.parse(req.body)
        const auth = await getGoogleClient(body.user_id)
        const gmail = google.gmail({ version: 'v1', auth })

        const messageParts = [
            `To: ${body.to}`,
            `Subject: ${body.subject}`,
            '',
            body.body
        ].join('\n')

        const encodedMessage = Buffer.from(messageParts)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')

        const draft = await gmail.users.drafts.create({
            userId: 'me',
            requestBody: {
                message: { raw: encodedMessage }
            }
        })

        return { result: `Draft saved (ID: ${draft.data.id}) — To: ${body.to} | Subject: ${body.subject}` }
    })
}
