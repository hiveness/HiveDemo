import { NextResponse, NextRequest } from "next/server";

/**
 * Session-specific Control Plane routes.
 * Proxies /api/orchestrate/[sessionId]/... to HIVE service.
 */

const HIVE_URL = () => process.env.HIVE_SERVICE_URL || 'http://localhost:8000';

// Helper to proxy GET requests
async function proxyGet(path: string) {
    const res = await fetch(`${HIVE_URL()}${path}`);
    const data = await res.json();
    if (!res.ok) {
        return NextResponse.json({ error: data.detail || 'HIVE error' }, { status: res.status });
    }
    return NextResponse.json(data);
}

// Helper to proxy POST requests
async function proxyPost(path: string, body?: any) {
    const res = await fetch(`${HIVE_URL()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
        return NextResponse.json({ error: data.detail || 'HIVE error' }, { status: res.status });
    }
    return NextResponse.json(data);
}

export async function GET(
    req: NextRequest,
    { params }: { params: { sessionId: string } }
) {
    const { sessionId } = params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'tasks';

    try {
        switch (action) {
            case 'tasks':
                return proxyGet(`/session/${sessionId}/tasks`);
            case 'progress':
                return proxyGet(`/session/${sessionId}/progress`);
            case 'ready':
                const agent = searchParams.get('agent') || '';
                return proxyGet(`/session/${sessionId}/ready${agent ? `?agent=${agent}` : ''}`);
            case 'telemetry':
                const limit = searchParams.get('limit') || '50';
                return proxyGet(`/session/${sessionId}/telemetry?limit=${limit}`);
            case 'token-usage':
                return proxyGet(`/session/${sessionId}/token-usage`);
            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error: any) {
        return NextResponse.json(
            { error: `Cannot reach HIVE service: ${error.message}` },
            { status: 502 }
        );
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: { sessionId: string } }
) {
    const { sessionId } = params;
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    try {
        switch (action) {
            case 'pause':
                return proxyPost(`/session/${sessionId}/pause`);
            case 'resume':
                return proxyPost(`/session/${sessionId}/resume`);
            case 'add_task':
                return proxyPost(`/session/${sessionId}/task`, {
                    instruction: body.instruction,
                    assigned_agent: body.assigned_agent,
                    priority: body.priority || 3,
                    dependencies: body.dependencies || [],
                    token_budget: body.token_budget,
                });
            case 'reprioritize':
                if (!body.task_id) {
                    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
                }
                return proxyPost(`/session/${sessionId}/task/${body.task_id}/reprioritize`, {
                    priority: body.priority,
                });
            case 'retry':
                if (!body.task_id) {
                    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
                }
                return proxyPost(`/session/${sessionId}/task/${body.task_id}/retry`);
            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error: any) {
        return NextResponse.json(
            { error: `Cannot reach HIVE service: ${error.message}` },
            { status: 502 }
        );
    }
}
