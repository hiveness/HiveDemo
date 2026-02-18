
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function checkMessages() {
    // Check if Orchestrator exists first
    const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('*')
        .eq('agent_id', 'orchestrator')
        .single()

    console.log('Orchestrator Agent:', agent || agentError)

    // Fetch last 10 messages
    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

    if (msgError) {
        console.error('Error fetching messages:', msgError)
    } else {
        console.log(`Found ${messages.length} messages.`)
        if (messages.length > 0) {
            console.log('Last message:', messages[0])
        }
    }
}

checkMessages()
