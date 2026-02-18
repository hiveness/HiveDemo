import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/calendar'
]

export async function getGoogleClient(userId: string = 'gmail') {
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    )

    // Fetch tokens from DB
    const { data, error } = await supabase
        .from('connections')
        .select('tokens')
        .eq('name', userId)
        .single()

    if (error || !data) {
        throw new Error(`Google account not connected. Please visit /auth/google to connect.`)
    }

    const { client_id, client_secret, refresh_token, access_token, expiry_date } = data.tokens

    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.API_URL || 'http://localhost:3001'}/auth/google/callback`
    )

    oAuth2Client.setCredentials({
        refresh_token,
        access_token,
        expiry_date
    })

    // Handle token refresh automatically by googleapis, but we might want to listen for updates
    // For now, relies on access_token or refresh_token working.

    return oAuth2Client
}
