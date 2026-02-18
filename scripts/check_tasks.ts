import 'dotenv/config'
import { supabase } from '@hive/db'

async function checkTasks() {
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error fetching tasks:', error.message)
        return
    }

    console.log('Recent Tasks:')
    tasks.forEach(task => {
        console.log(`- ID: ${task.id}`)
        console.log(`  Goal: ${task.goal}`)
        console.log(`  Status: ${task.status}`)
        console.log(`  Result: ${task.result}`)
        console.log('---')
    })
}

checkTasks().catch(console.error)
