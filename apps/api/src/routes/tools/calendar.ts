import type { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { getGoogleClient } from '../../utils/google-auth'
import { z } from 'zod'

export async function calendarRouter(app: FastifyInstance) {

    // ── calendar_list ─────────────────────────────────────────────────────────────
    app.post('/list', async (req, reply) => {
        const schema = z.object({
            days_ahead: z.number().default(7),
            calendar_id: z.string().default('primary'),
            user_id: z.string().default('gmail')
        })
        const body = schema.parse(req.body)
        const auth = await getGoogleClient(body.user_id)
        const calendar = google.calendar({ version: 'v3', auth })

        const now = new Date()
        const end = new Date()
        end.setDate(now.getDate() + body.days_ahead)

        const res = await calendar.events.list({
            calendarId: body.calendar_id,
            timeMin: now.toISOString(),
            timeMax: end.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
        })

        const events = res.data.items || []
        if (events.length === 0) return { result: `No events in the next ${body.days_ahead} days.` }

        const lines = events.map(e => {
            const start = e.start?.dateTime || e.start?.date
            return `[${e.id}] ${start} — ${e.summary || 'No title'}`
        })

        return { result: lines.join('\n') }
    })

    // ── calendar_create ───────────────────────────────────────────────────────────
    app.post('/create', async (req, reply) => {
        const schema = z.object({
            title: z.string(),
            start: z.string(), // ISO 8601
            end: z.string(),   // ISO 8601
            description: z.string().optional(),
            attendees: z.array(z.string()).optional(),
            location: z.string().optional(),
            calendar_id: z.string().default('primary'),
            user_id: z.string().default('gmail')
        })
        const body = schema.parse(req.body)
        const auth = await getGoogleClient(body.user_id)
        const calendar = google.calendar({ version: 'v3', auth })

        const event: any = {
            summary: body.title,
            start: { dateTime: body.start, timeZone: 'UTC' },
            end: { dateTime: body.end, timeZone: 'UTC' },
        }
        if (body.description) event.description = body.description
        if (body.location) event.location = body.location
        if (body.attendees) event.attendees = body.attendees.map(email => ({ email }))

        const created = await calendar.events.insert({
            calendarId: body.calendar_id,
            requestBody: event
        })

        return { result: `Event created: ${created.data.summary} at ${created.data.start?.dateTime} (ID: ${created.data.id})` }
    })

    // ── calendar_delete ───────────────────────────────────────────────────────────
    app.post('/delete', async (req, reply) => {
        const schema = z.object({
            event_id: z.string(),
            calendar_id: z.string().default('primary'),
            user_id: z.string().default('gmail')
        })
        const body = schema.parse(req.body)
        const auth = await getGoogleClient(body.user_id)
        const calendar = google.calendar({ version: 'v3', auth })

        await calendar.events.delete({
            calendarId: body.calendar_id,
            eventId: body.event_id
        })

        return { result: `Event ${body.event_id} deleted.` }
    })
}
