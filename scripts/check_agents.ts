
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function checkAgents() {
    const { data, error } = await supabase.from('agents').select('*')
    if (error) {
        console.error('Error fetching agents:', error)
        return
    }
    console.log('Agents found:', data)
}

checkAgents()
