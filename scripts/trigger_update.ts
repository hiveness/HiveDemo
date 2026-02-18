import 'dotenv/config'
import { supabase } from '@hive/db'

async function triggerUpdate() {
    // Find the latest task
    const { data: task } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(1).single()
    if (!task) {
        console.log('No task found')
        return
    }

    console.log(`Updating task ${task.id}...`)

    // Toggle status to trigger update
    const originalStatus = task.status
    const tempStatus = originalStatus === 'pending' ? 'in_progress' : 'pending'

    await supabase.from('tasks').update({ status: tempStatus }).eq('id', task.id)
    console.log(`Set status to ${tempStatus}`)

    // Wait a bit
    await new Promise(r => setTimeout(r, 1000))

    await supabase.from('tasks').update({ status: originalStatus }).eq('id', task.id)
    console.log(`Reverted status to ${originalStatus}`)
}

triggerUpdate().catch(console.error)
