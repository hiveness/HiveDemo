'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { ApprovalModal, ApprovalRequest } from '@/components/ApprovalModal';

// ── Agent Status & Assets ─────────────────────────────────────────────────────
type AgentStatus = 'idle' | 'thinking' | 'working' | 'crashed' | 'success';

const DUCK_SPRITES: Record<AgentStatus, string> = {
    idle: '/sprites/duck_new/Duck/Gifs/Idle.gif',
    thinking: '/sprites/duck_new/Duck/Gifs/Crouching.gif',
    working: '/sprites/duck_new/Duck/Gifs/Running.gif',
    crashed: '/sprites/duck_new/Duck/Gifs/Dead.gif',
    success: '/sprites/duck_new/Duck/Gifs/Jumping.gif',
};

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — must match server

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Message {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: any[];
}

interface Artifact {
    id: string;
    type: string;
    title: string;
    created_at: string;
}

const LogPanel = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    const [logType, setLogType] = useState('pm');
    const [logs, setLogs] = useState('');
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const fetchLogs = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logs/${logType}`);
                const data = await res.json();
                setLogs(data.logs || 'No logs found.');
            } catch (e) {
                console.error(e);
            }
        };

        fetchLogs();
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [isOpen, logType]);

    useEffect(() => {
        if (isOpen) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="w-80 border-l border-gray-800 flex flex-col bg-black/40 font-mono text-xs">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#0f0f0f]">
                <h3 className="font-bold uppercase tracking-widest text-gray-500">System Logs</h3>
                <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="p-2 border-b border-gray-800 flex gap-2 overflow-x-auto bg-[#050505]">
                {['pm', 'dev', 'orchestrator', 'api'].map(t => (
                    <button
                        key={t}
                        onClick={() => setLogType(t)}
                        className={`px-3 py-1 rounded uppercase flex-shrink-0 transition-colors ${logType === t
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : 'text-gray-600 hover:text-gray-400 border border-transparent'
                            }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-auto p-4 bg-[#050505] text-gray-400 whitespace-pre-wrap selection:bg-violet-500/30">
                {logs}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};

export default function SimpleChat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [status, setStatus] = useState<AgentStatus>('idle');
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('hive_session_id');
        }
        return null;
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [authStatus, setAuthStatus] = useState({ gmail: false, github: false });

    // ── Approval state ────────────────────────────────────────────────────────
    const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

    // Use refs for values read inside setInterval callbacks to avoid stale closures.
    // These are always in sync with their state counterparts.
    const shownRequestIds = useRef<Set<string>>(new Set());
    const isShowingModalRef = useRef(false);   // mirrors pendingApproval !== null
    const approvalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const activeSessionRef = useRef<string | null>(null); // mirrors sessionId for the interval

    // ── Start approval polling ────────────────────────────────────────────────
    // Stable — no state in deps, reads via refs only.
    const startApprovalPolling = useCallback((sid: string) => {
        // Store the session so the interval can always read the latest value
        activeSessionRef.current = sid;

        // Guard: only one interval at a time
        if (approvalPollRef.current !== null) return;

        approvalPollRef.current = setInterval(async () => {
            const currentSid = activeSessionRef.current;
            if (!currentSid) return;

            try {
                const res = await fetch(
                    `/api/agent/approve?sessionId=${encodeURIComponent(currentSid)}`
                );
                if (!res.ok) return;
                const { requests } = await res.json();
                if (!requests || requests.length === 0) return;

                // Only surface a new request if no modal is currently open
                if (isShowingModalRef.current) return;

                const unseen = requests.find(
                    (r: any) => !shownRequestIds.current.has(r.id)
                );
                if (!unseen) return;

                shownRequestIds.current.add(unseen.id);
                isShowingModalRef.current = true;
                setPendingApproval({
                    id: unseen.id,
                    requestId: unseen.id,
                    tool: unseen.tool,
                    args: unseen.args,
                    message: `Agent wants to run: **${unseen.tool}**`,
                    expiresAt: new Date(unseen.created_at).getTime() + APPROVAL_TIMEOUT_MS,
                    session_id: unseen.session_id,
                    agent_id: unseen.agent_id,
                    status: unseen.status,
                    created_at: unseen.created_at,
                });
            } catch {
                // Silently ignore transient polling errors
            }
        }, 1000);
    }, []); // ← no deps: reads everything via refs

    // ── Stop approval polling ─────────────────────────────────────────────────
    const stopApprovalPolling = useCallback(() => {
        if (approvalPollRef.current !== null) {
            clearInterval(approvalPollRef.current);
            approvalPollRef.current = null;
        }
    }, []);

    // ── Handle user resolving an approval ─────────────────────────────────────
    const handleApprovalResolve = useCallback(
        (_requestId: string, _decision: 'approved' | 'denied') => {
            isShowingModalRef.current = false;
            setPendingApproval(null);
            // Polling continues — the next pending request (if any) will surface
            // on the next tick automatically.
        },
        []
    );

    // ── 1. Load Initial Data ──────────────────────────────────────────────────
    useEffect(() => {
        // Load Artifacts
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/artifacts`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setArtifacts(data);
                } else {
                    console.error('Failed to load artifacts:', data);
                    setArtifacts([]);
                }
            })
            .catch(e => {
                console.error('Error fetching artifacts:', e);
                setArtifacts([]);
            });

        // Check Auth Status
        const checkAuth = async () => {
            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/status`
                );
                const data = await res.json();
                setAuthStatus(data);
            } catch (e) {
                console.error('Auth status check failed', e);
            }
        };
        checkAuth();

        // Listen for Auth Success popup message
        const handleAuthMessage = (event: MessageEvent) => {
            if (event.data?.type === 'HIVE_AUTH_SUCCESS') {
                checkAuth();
                alert(`Successfully connected ${event.data.provider}!`);
            }
        };
        window.addEventListener('message', handleAuthMessage);

        return () => {
            window.removeEventListener('message', handleAuthMessage);
            stopApprovalPolling();
        };
    }, [stopApprovalPolling]);

    // ── 2. Chat Logic ─────────────────────────────────────────────────────────
    const sendMessage = async () => {
        if (!input.trim()) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setStatus('thinking');

        // Generate session ID if new
        const currentSession = sessionId || `session-${Date.now()}`;
        if (!sessionId) {
            setSessionId(currentSession);
            localStorage.setItem('hive_session_id', currentSession);
        }

        // Start polling for approval requests as soon as the agent starts working
        startApprovalPolling(currentSession);

        try {
            const res = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: 'orchestrator',
                    message: userMsg,
                    history: messages,
                    sessionId: currentSession,
                }),
            });

            if (!res.ok) throw new Error(await res.text());

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setStatus(data.partial ? 'crashed' : 'success');
            setTimeout(() => setStatus('idle'), 3000);

            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: data.text || 'I processed that but have no text response.',
                },
            ]);

            // Refresh artifacts if potentially new ones were created
            fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/artifacts`)
                .then(r => r.json())
                .then(d => { if (Array.isArray(d)) setArtifacts(d); })
                .catch(() => { });

        } catch (error: any) {
            console.error(error);
            setStatus('crashed');
            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: `**Error:** ${error.message}` },
            ]);
        } finally {
            // Stop polling once the agent has finished (response received or errored)
            stopApprovalPolling();
            // Dismiss any lingering modal
            isShowingModalRef.current = false;
            setPendingApproval(null);
        }
    };

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── 3. Render ─────────────────────────────────────────────────────────────
    return (
        <div className="flex h-screen bg-[#111] text-gray-200 font-sans">

            {/* ── Approval Modal (rendered above everything) ── */}
            <ApprovalModal
                request={pendingApproval}
                onResolve={handleApprovalResolve}
            />

            {/* LEFT SIDEBAR: Config & Artifacts */}
            <div className="w-80 border-r border-gray-800 flex flex-col bg-black/40">
                <div className="p-6 border-b border-gray-800">
                    <div className="flex flex-col items-center">
                        <img
                            src={DUCK_SPRITES[status]}
                            alt="HIVE Agent Logo"
                            className="w-16 h-16 object-contain mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                        />
                        <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">
                            v2.0 Execution Upgrade
                        </p>
                    </div>
                </div>

                {/* Auth Plugins */}
                <div className="p-6 border-b border-gray-800 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                        Integrations
                    </h3>

                    {/* Google */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">✉️</span>
                            <span className="text-sm font-medium">Gmail / Cal</span>
                        </div>
                        {authStatus.gmail ? (
                            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30">
                                CONNECTED
                            </span>
                        ) : (
                            <button
                                onClick={() =>
                                    window.open(
                                        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/google`,
                                        'hive_auth',
                                        'width=500,height=600'
                                    )
                                }
                                className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors"
                            >
                                CONNECT
                            </button>
                        )}
                    </div>

                    {/* GitHub (Placeholder) */}
                    <div className="flex items-center justify-between opacity-50">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🐙</span>
                            <span className="text-sm font-medium">GitHub</span>
                        </div>
                        <span className="text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded">
                            SOON
                        </span>
                    </div>

                    {/* Logs Toggle */}
                    <button
                        onClick={() => setShowLogs(!showLogs)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-all border ${showLogs
                            ? 'bg-violet-500/20 border-violet-500/30 text-violet-300'
                            : 'bg-white/5 border-gray-800 text-gray-400 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        <span className="text-xs font-bold uppercase tracking-widest">View System Logs</span>
                        <span className="text-lg">📟</span>
                    </button>
                </div>

                {/* Artifacts List */}
                <div className="flex-1 overflow-y-auto p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
                        Recent Artifacts
                    </h3>
                    <div className="space-y-2">
                        {Array.isArray(artifacts) &&
                            artifacts.map(a => (
                                <div
                                    key={a.id}
                                    onClick={() =>
                                        window.open(
                                            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/artifacts/${a.id}`,
                                            '_blank'
                                        )
                                    }
                                    className="p-3 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer border border-transparent hover:border-violet-500/30 transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-mono text-gray-500 uppercase">
                                            {a.type}
                                        </span>
                                        <span className="text-[10px] text-gray-600">
                                            {new Date(a.created_at).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="text-sm font-medium text-gray-300 group-hover:text-white truncate">
                                        {a.title || 'Untitled Artifact'}
                                    </div>
                                </div>
                            ))}
                        {artifacts.length === 0 && (
                            <div className="text-xs text-gray-600 italic text-center py-4">
                                No artifacts yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* MAIN AREA: Chat */}
            <div className="flex-1 flex flex-col relative">

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600">
                            <div className="text-4xl mb-4 opacity-20">🐝</div>
                            <p>HIVE Agent Ready.</p>
                            <p className="text-sm opacity-50">
                                Ask me to browse the web, run verified tools, or build artifacts.
                            </p>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-3xl rounded-2xl p-5 ${m.role === 'user'
                                    ? 'bg-violet-600 text-white rounded-br-none'
                                    : 'bg-[#1a1a1a] border border-gray-800 text-gray-300 rounded-bl-none'
                                    }`}
                            >
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown>{m.content}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}

                    {(status === 'thinking' || status === 'working') && (
                        <div className="flex justify-start">
                            <div className="max-w-3xl rounded-2xl p-5 bg-[#1a1a1a] border border-gray-800 text-gray-500 rounded-bl-none flex items-center gap-3">
                                <div
                                    className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"
                                    style={{ animationDelay: '0ms' }}
                                />
                                <div
                                    className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"
                                    style={{ animationDelay: '150ms' }}
                                />
                                <div
                                    className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"
                                    style={{ animationDelay: '300ms' }}
                                />
                                <span className="text-xs font-mono uppercase tracking-widest ml-2">
                                    {pendingApproval
                                        ? '⚠️ Waiting for approval...'
                                        : status === 'thinking'
                                            ? 'Reasoning...'
                                            : 'Executing Tools...'}
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-6 bg-black/40 border-t border-gray-800">
                    <div className="max-w-4xl mx-auto relative">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder="Message HIVE..."
                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-5 py-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 resize-none h-16 custom-scrollbar"
                            disabled={status === 'thinking' || status === 'working'}
                        />
                        <div className="absolute right-4 bottom-4 text-[10px] text-gray-600">
                            RETURN to send
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDEBAR: Logs */}
            <LogPanel isOpen={showLogs} onClose={() => setShowLogs(false)} />
        </div>
    );
}
