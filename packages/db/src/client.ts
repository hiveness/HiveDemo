import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

export const getSupabase = () => {
    if (supabaseInstance) return supabaseInstance

    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY

    if (!url || !key || url === 'undefined' || key === 'undefined') {
        const missing = []
        if (!url || url === 'undefined') missing.push('SUPABASE_URL')
        if (!key || key === 'undefined') missing.push('SUPABASE_SERVICE_KEY')

        console.error(`[DB] Critical: ${missing.join(' and ')} missing from environment.`)
        throw new Error(`Supabase environment variables are missing: ${missing.join(', ')}`)
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
