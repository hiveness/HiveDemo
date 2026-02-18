'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ApprovalRequest {
    id: string;
    requestId?: string; // alias for id — both are supported
    tool: string;
    args: Record<string, unknown>;
    message?: string;
    expiresAt: number;
    session_id?: string;
    agent_id?: string;
    status?: string;
    created_at?: string;
}

interface ApprovalModalProps {
    request: ApprovalRequest | null;
    onResolve: (requestId: string, decision: 'approved' | 'denied') => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ApprovalModal({ request, onResolve }: ApprovalModalProps) {
    const [secondsLeft, setSecondsLeft] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Countdown timer
    useEffect(() => {
        if (!request) return;

        const remaining = Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000));
        setSecondsLeft(remaining);

        const tick = setInterval(() => {
            const r = Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000));
            setSecondsLeft(r);
            if (r === 0) clearInterval(tick);
        }, 1000);

        return () => clearInterval(tick);
    }, [request]);

    if (!request) return null;

    const requestId = request.requestId || request.id;
    const displayMessage = request.message || `Agent wants to run: **${request.tool}**`;

    const handleDecision = async (decision: 'approved' | 'denied') => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            await fetch('/api/agent/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, decision }),
            });
            onResolve(requestId, decision);
        } catch (err) {
            console.error('[ApprovalModal] Failed to submit decision:', err);
            setIsSubmitting(false);
        }
    };

    // Colour the countdown red when under 30 seconds
    const timerColour = secondsLeft <= 30 ? 'text-red-400' : 'text-zinc-400';

    // Format seconds as mm:ss
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    const timerLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border border-zinc-200 dark:border-zinc-700 animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">⚠️</span>
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            Agent Needs Permission
                        </h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Review the action below before allowing it to proceed.
                        </p>
                    </div>
                </div>

                {/* Message */}
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                    {displayMessage.replace(/\*\*/g, '')}
                </p>

                {/* Tool + Args Preview */}
                <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 mb-5 font-mono text-xs overflow-auto max-h-48 border border-zinc-200 dark:border-zinc-700">
                    <div className="text-zinc-500 dark:text-zinc-400 mb-1">
                        Tool:{' '}
                        <span className="text-blue-500 dark:text-blue-400 font-semibold">
                            {request.tool}
                        </span>
                    </div>
                    <pre className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
                        {JSON.stringify(request.args, null, 2)}
                    </pre>
                </div>

                {/* Footer: timer + action buttons */}
                <div className="flex justify-between items-center">
                    <span className={`text-xs font-mono ${timerColour}`}>
                        Auto-denies in {timerLabel}
                    </span>

                    <div className="flex gap-3">
                        <button
                            onClick={() => handleDecision('denied')}
                            disabled={isSubmitting || secondsLeft === 0}
                            className="px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Deny
                        </button>
                        <button
                            onClick={() => handleDecision('approved')}
                            disabled={isSubmitting || secondsLeft === 0}
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Submitting…' : 'Approve'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
