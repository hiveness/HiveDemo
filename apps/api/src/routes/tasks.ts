import type { FastifyInstance } from 'fastify'
import { supabase } from '@hive/db'

export async function tasksRoutes(app: FastifyInstance) {
    app.get('/', async () => {
        const { data } = await supabase.from('tasks')
            .select('id, goal, status, result, actual_cost_usd, created_at')
            .order('created_at', { ascending: false }).limit(50)
        return { tasks: data ?? [] }
    })

    app.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string }
        const { data: task } = await supabase.from('tasks').select('*').eq('id', id).single()
        if (!task) return reply.status(404).send({ error: 'Not found' })

        const { data: subtasks } = await supabase.from('tasks').select('*').eq('parent_task_id', id)
        const { data: telemetry } = await supabase.from('telemetry_events').select('*').eq('task_id', id).order('created_at')

        return { task, subtasks: subtasks ?? [], telemetry: telemetry ?? [] }
    })

    app.get('/:id/result', async (req, reply) => {
        const { id } = req.params as { id: string }
        const { data } = await supabase.from('tasks')
            .select('id, goal, status, result, actual_cost_usd').eq('id', id).single()
        if (!data) return reply.status(404).send({ error: 'Not found' })
        return data
    })
}
