/**
 * One-time migration: adds company_id column to telemetry_events if missing.
 * Run with: npx tsx scripts/add_company_id_column.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
    console.log('Checking telemetry_events schema...')

    // Step 1: Try inserting a row with company_id to see if column exists
    const { error: checkError } = await supabase
        .from('telemetry_events')
        .select('company_id')
        .limit(1)

    if (!checkError) {
        console.log('✅ company_id column already exists in telemetry_events. Nothing to do.')
        return
    }

    if (!checkError.message.includes('company_id')) {
        console.error('Unexpected error:', checkError.message)
        process.exit(1)
    }

    console.log('❌ company_id column is missing. Attempting to add it...')

    // Step 2: Use Supabase's pg REST endpoint (available via service role)
    // We'll use the /pg endpoint which allows raw SQL with service role
    const response = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
            query: 'ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS company_id text;'
        })
    })

    const result = await response.json()
    console.log('Response:', JSON.stringify(result, null, 2))

    if (response.ok) {
        console.log('✅ Successfully added company_id column!')
    } else {
        console.error('❌ Failed via /pg/query endpoint')
        
        // Step 3: Try creating a helper function via RPC and then dropping it
        console.log('Trying alternative: creating a temporary SQL function...')
        
        // Create the function
        const createFnResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'apikey': SUPABASE_SERVICE_KEY,
            },
        })
        console.log('Create fn status:', createFnResponse.status)
    }
}

main().catch(console.error)
