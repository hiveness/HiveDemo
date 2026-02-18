import type { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'

const REACT_HARNESS = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-4 bg-white">
  <div id="root"></div>
  <script type="text/babel">
    {content}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
  </script>
</body>
</html>`

const FORM_WRAPPER = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50 flex items-center justify-center p-8">
  <div class="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full">
    <h1 class="text-2xl font-bold mb-6">{title}</h1>
    {content}
  </div>
</body>
</html>`

export async function artifactsRoutes(app: FastifyInstance) {
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    )

    // ── POST /artifacts — create ──────────────────────────────────────────────
    app.post('/', async (req, reply) => {
        const body = req.body as {
            type: string
            content: string
            title: string
            description?: string
            agent_id?: string
            session_id?: string
        }

        const validTypes = ['html', 'pdf', 'form', 'react', 'csv', 'markdown']
        if (!validTypes.includes(body.type)) {
            return reply.status(400).send({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` })
        }

        const { data, error } = await supabase
            .from('hive_artifacts')
            .insert({
                type: body.type,
                content: body.content,
                title: body.title,
                description: body.description ?? null,
                agent_id: body.agent_id ?? null,
                session_id: body.session_id ?? null,
            })
            .select()
            .single()

        if (error) return reply.status(500).send({ error: error.message })

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
        const previewUrl = `${baseUrl}/preview/${data.id}`

        return {
            artifact_id: data.id,
            preview_url: previewUrl,
            type: data.type,
            title: data.title,
            description: data.description,
        }
    })

    // ── GET /artifacts — list ─────────────────────────────────────────────────
    app.get('/', async (req, reply) => {
        const { data, error } = await supabase
            .from('hive_artifacts')
            .select('id, type, title, description, created_at, expires_at')
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) return reply.status(500).send({ error: error.message })
        return data || []
    })

    // ── GET /artifacts/:id — serve rendered content ───────────────────────────
    app.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string }

        const { data, error } = await supabase
            .from('hive_artifacts')
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) {
            return reply.status(404).send({ error: 'Artifact not found or expired.' })
        }

        // Check expiry if expires_at is set
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            return reply.status(404).send({ error: 'Artifact has expired.' })
        }

        const { content, title, type } = data

        // ── HTML — serve directly with CSP sandbox ────────────────────────────
        if (type === 'html') {
            const html = (content.includes('<!DOCTYPE') || content.includes('<html'))
                ? content
                : `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-4">${content}</body>
</html>`
            return reply
                .type('text/html')
                .header('Content-Security-Policy',
                    "default-src 'self' 'unsafe-inline' cdn.tailwindcss.com unpkg.com cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline' cdn.tailwindcss.com unpkg.com cdnjs.cloudflare.com; img-src * data:;")
                .send(html)
        }

        // ── React — wrap in Babel harness ─────────────────────────────────────
        if (type === 'react') {
            const html = REACT_HARNESS
                .replace('{title}', title)
                .replace('{content}', content)
            return reply.type('text/html').send(html)
        }

        // ── Form — wrap in form UI shell ──────────────────────────────────────
        if (type === 'form') {
            const html = FORM_WRAPPER
                .replace(/\{title\}/g, title)
                .replace('{content}', content)
            return reply.type('text/html').send(html)
        }

        // ── Markdown — render as styled HTML ──────────────────────────────────
        if (type === 'markdown') {
            // Simple markdown-to-HTML conversion (no external dep needed for basic cases)
            const htmlBody = content
                .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`(.*?)`/g, '<code>$1</code>')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')

            const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown.min.css">
  <style>
    body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, sans-serif; }
    .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; }
  </style>
</head>
<body class="markdown-body"><p>${htmlBody}</p></body>
</html>`
            return reply.type('text/html').send(html)
        }

        // ── CSV — serve as downloadable file ──────────────────────────────────
        if (type === 'csv') {
            return reply
                .type('text/csv')
                .header('Content-Disposition', `attachment; filename="${title}.csv"`)
                .send(content)
        }

        // ── PDF — serve content as HTML (weasyprint not available in Node) ────
        if (type === 'pdf') {
            // Serve as styled HTML for browser printing
            const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print { .no-print { display: none; } }
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="no-print" style="background:#f0f9ff;border:1px solid #bae6fd;padding:12px 16px;border-radius:8px;margin-bottom:24px;font-family:sans-serif;font-size:13px;color:#0369a1;">
    📄 <strong>PDF Artifact</strong> — Use <kbd>Ctrl+P</kbd> / <kbd>Cmd+P</kbd> to print or save as PDF.
  </div>
  ${content}
</body>
</html>`
            return reply.type('text/html').send(html)
        }

        return reply.status(400).send({ error: `Unknown artifact type: ${type}` })
    })
}
