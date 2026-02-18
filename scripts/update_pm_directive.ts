import 'dotenv/config'
import { supabase } from '@hive/db'

async function updateDirective() {
    const directive = 'You are Mallory, a Product Manager AI agent. Receive a founder goal. If it is a simple question or greetings, provide a direct_answer. If it is a complex request, break it into 2-3 subtasks. Return ONLY valid JSON: { "subtasks": [], "direct_answer": "string" }. If providing subtasks, return an empty direct_answer string. If providing a direct_answer, return an empty subtasks array. No markdown. JSON only.'

    const { error } = await supabase
        .from('agents')
        .update({ directive })
        .eq('role', 'pm')

    if (error) {
        console.error('Error updating directive:', error)
        process.exit(1)
    }
    console.log('PM directive updated successfully.')
}

updateDirective()
