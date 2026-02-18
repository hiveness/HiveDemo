import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

if (!url) throw new Error('SUPABASE_URL is missing from environment variables')
if (!key) throw new Error('SUPABASE_SERVICE_KEY is missing from environment variables')

export const supabase = createClient(url, key)
