import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/artifacts/[id]
 *
 * Proxies to the backend API server's GET /artifacts/:id endpoint.
 * This allows the preview page iframe (sandboxed to same-origin) to load
 * artifact content without CORS issues.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

    try {
        const upstream = await fetch(`${apiUrl}/artifacts/${id}`, {
            headers: {
                'x-api-key': process.env.API_KEY || 'test',
            },
            // Don't cache — artifacts expire server-side
            cache: 'no-store',
        })

        if (!upstream.ok) {
            const errorText = await upstream.text()
            return new NextResponse(
                `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#ef4444;">
                    <h2>⚠️ Artifact Not Found</h2>
                    <p>${upstream.status === 404 ? 'This artifact has expired or does not exist.' : errorText}</p>
                </body></html>`,
                {
                    status: upstream.status,
                    headers: { 'Content-Type': 'text/html' },
                }
            )
        }

        // Forward the content-type and body from the backend
        const contentType = upstream.headers.get('content-type') || 'text/html'
        const contentDisposition = upstream.headers.get('content-disposition')
        const body = await upstream.arrayBuffer()

        const responseHeaders: Record<string, string> = {
            'Content-Type': contentType,
        }
        if (contentDisposition) {
            responseHeaders['Content-Disposition'] = contentDisposition
        }

        return new NextResponse(body, {
            status: 200,
            headers: responseHeaders,
        })
    } catch (err: any) {
        return new NextResponse(
            `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#ef4444;">
                <h2>⚠️ Backend Unavailable</h2>
                <p>Could not reach the HIVE API: ${err.message}</p>
            </body></html>`,
            {
                status: 502,
                headers: { 'Content-Type': 'text/html' },
            }
        )
    }
}

/**
 * POST /api/artifacts
 *
 * Proxies artifact creation to the backend. Called by agent-tools.ts
 * via callBackendRaw('/artifacts/', ...) which hits the backend directly,
 * but this route is available as a fallback if needed.
 */
export async function POST(req: NextRequest) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const body = await req.json()

    try {
        const upstream = await fetch(`${apiUrl}/artifacts/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.API_KEY || 'test',
            },
            body: JSON.stringify(body),
        })

        const data = await upstream.json()
        return NextResponse.json(data, { status: upstream.status })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 502 })
    }
}
