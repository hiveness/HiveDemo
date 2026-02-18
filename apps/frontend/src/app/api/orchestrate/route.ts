import { NextResponse } from "next/server";

/**
 * Orchestrate route — proxies to the HIVE Control Plane.
 * 
 * Set HIVE_SERVICE_URL in .env.local:
 *   - Local dev:  http://localhost:8000
 *   - Railway:    https://your-app.railway.app
 */

const HIVE_URL = () => process.env.HIVE_SERVICE_URL || 'http://localhost:8000';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { goal } = body;

        if (!goal || typeof goal !== 'string') {
            return NextResponse.json({ error: "goal is required" }, { status: 400 });
        }

        const res = await fetch(`${HIVE_URL()}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal }),
        });

        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { detail: text };
        }

        if (!res.ok) {
            return NextResponse.json({ error: data.detail || 'HIVE service error' }, { status: res.status });
        }

        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[orchestrate] Error:", error);
        return NextResponse.json(
            { error: `Cannot reach HIVE service: ${error.message}` },
            { status: 502 }
        );
    }
}
