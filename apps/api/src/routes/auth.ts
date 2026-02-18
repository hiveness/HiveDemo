import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

// Simple Google OAuth implementation
// In a real app, use passport or similar. Here we'll do manual flow for control.

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function authRoutes(app: FastifyInstance) {
    // Supabase client (service role for writing connections)
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    )

    // ── GET /google ──────────────────────────────────────────────────────────────
    app.get('/google', async (req, reply) => {
        const clientId = process.env.GOOGLE_CLIENT_ID
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:3001'}/auth/google/callback`

        if (!clientId) return reply.status(500).send({ error: 'Missing GOOGLE_CLIENT_ID' })

        const scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/calendar'
        ]

        const url = `${GOOGLE_AUTH_URL}?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes.join(' ')}&access_type=offline&prompt=consent`

        return reply.redirect(url)
    })

    // ── GET /auth/google/callback ────────────────────────────────────────────────
    app.get('/google/callback', async (req, reply) => {
        const { code } = req.query as { code: string }

        if (!code) return reply.send({ error: 'No code provided' })

        try {
            const tokenParams = new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:3001'}/auth/google/callback`,
                grant_type: 'authorization_code'
            })

            const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: tokenParams
            })

            const tokenData = await tokenRes.json()
            if (tokenData.error) throw new Error(tokenData.error)

            // Store in DB
            const { error } = await supabase.from('connections').upsert({
                name: 'gmail',
                tokens: tokenData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'name' })

            if (error) throw error

            return reply.type('text/html').send(`
                <h1>Authentication Successful</h1>
                <p>Google account connected. You can close this window.</p>
                <script>
                    window.opener.postMessage({ type: 'HIVE_AUTH_SUCCESS', provider: 'google' }, '*');
                    window.close();
                </script>
            `)

        } catch (error: any) {
            return reply.status(500).send({ error: error.message })
        }
    })

    // ── GET /auth/status ─────────────────────────────────────────────────────────
    app.get('/status', async (req, reply) => {
        const { data } = await supabase.from('connections').select('name')
        const connections = data?.map(c => c.name) || []
        return {
            gmail: connections.includes('gmail'),
            github: connections.includes('github')
        }
    })
}
