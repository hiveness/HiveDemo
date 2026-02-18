import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/agent/approve?sessionId=xxx
// Returns all pending approval requests for a given session (used by frontend polling)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('session_id', sessionId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests: data || [] });
}

// POST /api/agent/approve
// Body: { requestId: string, decision: 'approved' | 'denied' }
export async function POST(req: NextRequest) {
    const { requestId, decision } = await req.json();

    if (!requestId) {
        return NextResponse.json({ error: 'requestId is required' }, { status: 400 });
    }

    if (!['approved', 'denied'].includes(decision)) {
        return NextResponse.json({ error: 'Invalid decision. Must be "approved" or "denied".' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
        .from('approval_requests')
        .update({
            status: decision,
            resolved_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending'); // Only update if still pending (prevent double-resolution)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
