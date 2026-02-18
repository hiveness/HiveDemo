import type { FastifyInstance } from 'fastify'
import { ALL_SKILLS } from '@hive/tools'

export async function skillsRoutes(app: FastifyInstance) {
    app.get('/', async () => {
        return ALL_SKILLS.map(s => ({
            ...s.manifest,
            tools: s.tools.map(t => ({ name: t.name, description: t.description }))
        }))
    })

    app.post('/:name/toggle', async (req, reply) => {
        const { name } = req.params as { name: string }
        return { success: true, name }
    })
}
