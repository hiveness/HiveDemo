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

app.get('/', async (req, reply) => {
    reply.type('text/html').send(`
        <html>
            <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
                <h1>🐝 Hive API is running</h1>
                <p>The frontend is available at <a href="http://localhost:3000" style="color: #38bdf8;">http://localhost:3000</a></p>
                <div style="background: #1e293b; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                    <code style="color: #94a3b8;">GET /health</code> - API Status
                </div>
            </body>
        </html>
    `)
})

app.register(goalsRoutes, { prefix: '/goals' })
app.register(goalsRoutes, { prefix: '/run' })  // Alias for legacy/frontend compatibility
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
