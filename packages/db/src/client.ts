import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

export const getSupabase = () => {
    if (supabaseInstance) return supabaseInstance

    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY

    if (!url || !key) {
        console.error('[DB] SUPABASE_URL or SUPABASE_SERVICE_KEY is missing.')
        console.error('[DB] Available env vars:', Object.keys(process.env).filter(k => !k.includes('KEY') && !k.includes('TOKEN')))
        throw new Error('Supabase environment variables are missing.')
    }

    supabaseInstance = createClient(url, key)
    return supabaseInstance
}

// For backward compatibility
export const supabase = new Proxy({} as SupabaseClient, {
    get: (target, prop) => {
        const instance = getSupabase()
        return (instance as any)[prop]
    }
})
