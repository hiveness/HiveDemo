/**
 * Verifies telemetry_events table matches the schema expected by telemetry.ts
 *
 * Actual DB schema (correct):
 *   id, agent_id, task_id, event_type, model_used, input_tokens, output_tokens,
 *   cost_usd, latency_ms, success, payload, created_at
 *
 * Run with: npx tsx scripts/migrate_telemetry.ts
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

// The columns required by the current telemetry.ts implementation
const requiredColumns = [
    'id',
    'agent_id',
    'task_id',
    'event_type',
    'model_used',
    'input_tokens',
    'output_tokens',
    'cost_usd',
    'latency_ms',
    'success',
    'payload',
    'created_at',
]

async function main() {
    console.log('🔍 Checking telemetry_events schema...')

    const { data, error } = await supabase
        .from('telemetry_events')
        .select('*')
        .limit(1)

    if (error) {
        console.error('Error fetching telemetry_events:', error.message)
        process.exit(1)
    }

    // Get columns from a real row, or from an empty result
    let existingColumns: string[] = []
    if (data && data.length > 0) {
        existingColumns = Object.keys(data[0])
    } else {
        // Table is empty — try inserting a test row to verify schema
        const testId = '00000000-0000-0000-0000-000000000001'
        const { error: insertError } = await supabase.from('telemetry_events').insert({
            agent_id: testId,
            event_type: 'schema_check',
            success: true,
        })
        if (insertError) {
            console.error('Schema check insert failed:', insertError.message)
            process.exit(1)
        }
        const { data: row } = await supabase.from('telemetry_events').select('*').eq('agent_id', testId).single()
        if (row) {
            existingColumns = Object.keys(row)
            // Clean up test row
            await supabase.from('telemetry_events').delete().eq('agent_id', testId)
        }
    }

    console.log('📋 Existing columns:', existingColumns.join(', '))

    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col))

    if (missingColumns.length === 0) {
        console.log('✅ Schema is correct! All required columns exist.')
        console.log('   The telemetry error has been fixed by updating the code to match the DB schema.')
    } else {
        console.log('❌ Missing required columns:', missingColumns.join(', '))
        console.log('   Please check the database schema.')
    }

    // Also verify a real insert works with all fields
    console.log('\n🧪 Testing a full telemetry insert...')
    const testAgentId = '00000000-0000-0000-0000-000000000002'
    const { error: testError } = await supabase.from('telemetry_events').insert({
        agent_id: testAgentId,
        event_type: 'model_call',
        model_used: 'test-model',
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.0001,
        latency_ms: 500,
        success: true,
        payload: { test: true },
    })

    if (testError) {
        console.error('❌ Test insert failed:', testError.message)
    } else {
        console.log('✅ Test insert succeeded!')
        // Clean up
        await supabase.from('telemetry_events').delete().eq('agent_id', testAgentId)
    }
}

main().catch(console.error)
