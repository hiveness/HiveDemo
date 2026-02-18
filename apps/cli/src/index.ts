import 'dotenv/config'
import axios from 'axios'
import * as readline from 'readline'

const API_URL = process.env.HIVE_API_URL || 'http://127.0.0.1:3000'
const API_KEY = process.env.API_KEY || 'test'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '🐝 HIVE > '
})

console.log('\x1b[33m%s\x1b[0m', '----------------------------------------')
console.log('\x1b[33m%s\x1b[0m', '  HIVE CLI - Interactive Goal Sender    ')
console.log('\x1b[33m%s\x1b[0m', '----------------------------------------')
console.log(`Endpoint: ${API_URL}`)
console.log('Type "exit" to quit.\n')

rl.prompt()

rl.on('line', async (line) => {
    const goal = line.trim()

    if (goal.toLowerCase() === 'exit') {
        process.exit(0)
    }

    if (!goal) {
        rl.prompt()
        return
    }

    try {
        console.log('\x1b[2m%s\x1b[0m', 'Sending goal...')
        const { data } = await axios.post(`${API_URL}/goals`,
            { goal, budget_usd: 2 },
            { headers: { 'x-api-key': API_KEY } }
        )

        console.log('\x1b[32m%s\x1b[0m', `🚀 Queued: ${data.task_id}`)
        console.log('\x1b[2m%s\x1b[0m', 'Agents are working. Use /tasks (Telegram) or wait for logs.')
    } catch (err: any) {
        const errorData = err.response?.data?.error
        const errorMessage = typeof errorData === 'object' ? JSON.stringify(errorData) : (errorData || err.message)
        console.log('\x1b[31m%s\x1b[0m', `❌ Error: ${errorMessage}`)
    }

    console.log('')
    rl.prompt()
}).on('close', () => {
    console.log('\nGoodbye!')
    process.exit(0)
})
