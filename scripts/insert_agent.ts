
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function insertOrchestrator() {
    const { data, error } = await supabase.from('agents').insert({
        name: 'HIVE Orchestrator',
        role: 'orchestrator',
        agent_id: 'orchestrator',
        directive: 'You are the HIVE Orchestrator. Your job is to manage the user session, understand their goals, and coordinate other agents (PM, Dev) to achieve them. You also handle general chat and tool usage.',
        budget_usd: 100,
        core_memory: {},
        soul_md: '# Orchestrator\nThe central brain of the HIVE.',
        about_md: 'Manages user interactions and coordinates the swarm.'
    }).select().single()

    if (error) {
        console.error('Error inserting agent:', error)
    } else {
        console.log('Inserted agent:', data)
    }
}

insertOrchestrator()
