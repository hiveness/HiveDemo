import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

console.log('[DB] SUPABASE_URL present:', !!url)
console.log('[DB] SUPABASE_SERVICE_KEY present:', !!key)

if (!url) {
    console.error('[DB] Missing SUPABASE_URL. All env vars:', Object.keys(process.env).filter(k => !k.includes('KEY') && !k.includes('TOKEN')))
    throw new Error('SUPABASE_URL is missing from environment variables')
}
if (!key) throw new Error('SUPABASE_SERVICE_KEY is missing from environment variables')

export const supabase = createClient(url, key)
