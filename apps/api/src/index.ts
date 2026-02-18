import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import Fastify from 'fastify'
import { Server } from 'socket.io'
import { goalsRoutes } from './routes/goals'
import { tasksRoutes } from './routes/tasks'
import { onboardingRoutes } from './routes/onboarding'
import { skillsRoutes } from './routes/skills'
import { authRoutes } from './routes/auth'
import { artifactsRoutes } from './routes/artifacts'
import { telemetryRoutes } from './routes/telemetry'
import { filesRouter } from './routes/tools/files'
import { shellRouter } from './routes/tools/shell'
import { browserRouter } from './routes/tools/browser'
import { gmailRouter } from './routes/tools/gmail'
import { calendarRouter } from './routes/tools/calendar'
import { chatRoutes } from './routes/chat'

import cors from '@fastify/cors'

const app = Fastify({ logger: true })

app.register(cors, {
    origin: true, // Allow all origins for dev, or specify ['http://localhost:3000']
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
})

// Socket.io initialization
const io = new Server(app.server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
})

io.on('connection', (socket) => {
    console.log('[Socket] Browser connected:', socket.id)

    socket.on('hive:subscribe', (sessionId) => {
        socket.join(`session:${sessionId}`)
        console.log(`[Socket] Client subscribed to session:${sessionId}`)
    })

    socket.on('hive:unsubscribe', (sessionId) => {
        socket.leave(`session:${sessionId}`)
        console.log(`[Socket] Client unsubscribed from session:${sessionId}`)
    })
})

// Attach io to app for use in routes
app.decorate('io', io)

app.addHook('onRequest', async (req, reply) => {
    // console.log(`[API] ${req.method} ${req.url}`)
    if (req.url === '/health' || req.url.startsWith('/socket.io/') || req.url.startsWith('/auth') || req.url.startsWith('/artifacts') || req.method === 'OPTIONS') return
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
        reply.status(401).send({ error: 'Unauthorized' })
    }
})

// BullMQ Event Bridge to Socket.io
import { QueueEvents, Queue } from 'bullmq'
import { Redis } from 'ioredis'

const redisUrl = process.env.UPSTASH_REDIS_URL
if (redisUrl) {
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
    const pmEvents = new QueueEvents('pm-tasks', { connection: connection.duplicate() as any })
    const devEvents = new QueueEvents('dev-tasks', { connection: connection.duplicate() as any })
    const pmQueue = new Queue('pm-tasks', { connection: connection.duplicate() as any })
    const devQueue = new Queue('dev-tasks', { connection: connection.duplicate() as any })

    const broadcastStatus = async (queue: Queue, jobId: string, status: string, taskStatus: string) => {
        const job = await queue.getJob(jobId)
        if (!job?.data) return
        const { taskId, rootTaskId, agentId } = job.data
        const room = rootTaskId || taskId
        if (!room) return

        io.to(`session:${room}`).emit('hive:agent-status', {
            agent: agentId,
            status,
            taskStatus,
            result: taskStatus === 'done' ? job.returnvalue : undefined
        })
    }

    pmEvents.on('active', ({ jobId }) => broadcastStatus(pmQueue, jobId, 'Planning', 'in_progress'))
    pmEvents.on('completed', ({ jobId }) => broadcastStatus(pmQueue, jobId, 'Done', 'done'))
    pmEvents.on('failed', ({ jobId }) => broadcastStatus(pmQueue, jobId, 'Failed', 'blocked'))

    devEvents.on('active', ({ jobId }) => broadcastStatus(devQueue, jobId, 'Coding', 'in_progress'))
    devEvents.on('completed', ({ jobId }) => broadcastStatus(devQueue, jobId, 'Done', 'done'))
    devEvents.on('failed', ({ jobId }) => broadcastStatus(devQueue, jobId, 'Failed', 'blocked'))
}

// ── Logs Route ──────────────────────────────────────────────────────────────
app.get('/logs/:type', async (req, reply) => {
    const { type } = req.params as { type: string };
    const validTypes = ['api', 'pm', 'dev', 'orchestrator'];
    if (!validTypes.includes(type)) {
        return reply.status(400).send({ error: 'Invalid log type' });
    }

    // Logs are in the root directory: /Users/sahil/Downloads/HiveDemo/logs/
    // API runs in /Users/sahil/Downloads/HiveDemo/apps/api/
    // So we need to go up two levels: ../../logs
    const logPath = path.join(process.cwd(), '../../logs', `${type}.log`);
    const logPathRoot = path.join(process.cwd(), 'logs', `${type}.log`);

    console.log(`[API] Requesting logs for ${type}`);
    console.log(`[API] CWD: ${process.cwd()}`);
    console.log(`[API] Trying path 1: ${logPath} (Exists: ${fs.existsSync(logPath)})`);
    console.log(`[API] Trying path 2: ${logPathRoot} (Exists: ${fs.existsSync(logPathRoot)})`);

    try {
        if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            const readSize = Math.min(stats.size, 50 * 1024);
            const buffer = Buffer.alloc(readSize);
            const fd = fs.openSync(logPath, 'r');
            fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
            fs.closeSync(fd);
            return { logs: buffer.toString('utf-8') };
        } else if (fs.existsSync(logPathRoot)) {
            const content = fs.readFileSync(logPathRoot, 'utf-8');
            const lines = content.split('\n').slice(-500).join('\n');
            return { logs: lines };
        } else {
            return { logs: `No log file found at ${logPath} or ${logPathRoot}` };
        }
    } catch (e) {
        app.log.error(e);
        return reply.status(500).send({ error: 'Failed to read logs' });
    }
});

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
app.register(skillsRoutes, { prefix: '/skills' })
app.register(authRoutes, { prefix: '/auth' })
app.register(artifactsRoutes, { prefix: '/artifacts' })
app.register(filesRouter, { prefix: '/tools' })
app.register(shellRouter, { prefix: '/tools' })
app.register(browserRouter, { prefix: '/tools/browser' })
app.register(gmailRouter, { prefix: '/tools/gmail' })
app.register(calendarRouter, { prefix: '/tools/calendar' })
app.register(telemetryRoutes, { prefix: '/telemetry' })
app.register(chatRoutes)

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
