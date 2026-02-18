import 'dotenv/config'
import { supabase } from '@hive/db'

async function findHelloTask() {
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .ilike('goal', '%hello%')
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) {
        console.error('Error fetching tasks:', error.message)
        return
    }

    if (tasks.length === 0) {
        console.log('No "hello" task found.')
        return
    }

    const task = tasks[0]
    console.log(`Task found:`)
    console.log(`- ID: ${task.id}`)
    console.log(`- Goal: ${task.goal}`)
    console.log(`- Status: ${task.status}`)
    console.log(`- Result: ${task.result}`)
}

findHelloTask().catch(console.error)
