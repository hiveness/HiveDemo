import 'dotenv/config'
import Fastify from 'fastify'
import { goalsRoutes } from './routes/goals'
import { tasksRoutes } from './routes/tasks'
import { onboardingRoutes } from './routes/onboarding'

const app = Fastify({ logger: true })

app.addHook('onRequest', async (req, reply) => {
    console.log(`[API] ${req.method} ${req.url}`)
    if (req.url === '/health' || req.method === 'OPTIONS') return
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
        reply.status(401).send({ error: 'Unauthorized' })
    }
})

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

app.register(goalsRoutes, { prefix: '/goals' })
app.register(tasksRoutes, { prefix: '/tasks' })
app.register(onboardingRoutes, { prefix: '/onboarding' })

const port = Number(process.env.PORT ?? 3000)

const start = async () => {
    try {
        await app.listen({ port, host: '0.0.0.0' })
        console.log(`HIVE Control Plane running at http://localhost:${port}`)
    } catch (err) {
        app.log.error(err)
        process.exit(1)
    }
}

start()
