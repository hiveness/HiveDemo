'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface HiveTask {
    id: string;
    session_id: string;
    owner: string;
    instruction: string;
    status: string;
    output: string | null;
    parent_task_id: string | null;
    created_at: string;
    updated_at: string;
    // ── DAG columns ──
    dependencies?: string[];
    priority?: number;
    token_budget?: number | null;
    tokens_used?: number;
    assigned_agent?: string | null;
    retry_count?: number;
    max_retries?: number;
    metadata?: Record<string, any>;
}

interface HiveLog {
    id: string;
    session_id: string;
    agent: string;
    action: string;
    payload: any;
    created_at: string;
}

interface HiveSession {
    id: string;
    goal: string;
    status: string;
    created_at: string;
    updated_at: string;
}

const AGENT_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    antigravity: { bg: 'bg-violet-950/40', border: 'border-violet-500/30', text: 'text-violet-300', glow: 'shadow-violet-500/10' },
    mallory: { bg: 'bg-blue-950/40', border: 'border-blue-500/30', text: 'text-blue-300', glow: 'shadow-blue-500/10' },
    quacksworth: { bg: 'bg-emerald-950/40', border: 'border-emerald-500/30', text: 'text-emerald-300', glow: 'shadow-emerald-500/10' },
    system: { bg: 'bg-gray-900/60', border: 'border-gray-600/40', text: 'text-gray-400', glow: 'shadow-gray-500/10' },
};

const STATUS_STYLES: Record<string, { label: string; color: string; pulse?: boolean }> = {
    pending: { label: 'WAITING', color: 'bg-gray-500' },
    in_progress: { label: 'WORKING', color: 'bg-amber-400', pulse: true },
    done: { label: 'DONE', color: 'bg-emerald-400' },
    blocked: { label: 'BLOCKED', color: 'bg-red-400' },
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
    1: { label: 'CRITICAL', color: 'text-red-400 bg-red-900/40 border border-red-800' },
    2: { label: 'HIGH', color: 'text-orange-400 bg-orange-900/40 border border-orange-800' },
    3: { label: 'NORMAL', color: 'text-blue-400 bg-blue-900/40 border border-blue-800' },
    4: { label: 'LOW', color: 'text-gray-400 bg-gray-800/40 border border-gray-700' },
    5: { label: 'TRIVIAL', color: 'text-gray-500 bg-gray-900/40 border border-gray-800' },
};

const AGENT_EMOJI: Record<string, string> = {
    antigravity: '🧠',
    mallory: '📋',
    quacksworth: '🦆',
    system: '⚙️',
};

interface HivePanelProps {
    isOpen: boolean;
    onClose: () => void;
    onTaskStatusChange?: (agent: string, status: string) => void;
}

const HivePanel: React.FC<HivePanelProps> = ({ isOpen, onClose, onTaskStatusChange }) => {
    const [goal, setGoal] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [tasks, setTasks] = useState<HiveTask[]>([]);
    const [logs, setLogs] = useState<HiveLog[]>([]);
    const [activeTab, setActiveTab] = useState<'terminal' | 'artifacts'>('terminal');

    // Helper to extract URL from text (handles "Public URL: http...")
    const extractUrl = (text: string | null | undefined) => {
        if (!text) return null;
        if (text.startsWith('http')) return text;
        const match = text.match(/https?:\/\/[^\s)]+/);
        return match ? match[0] : null;
    };
    const [isLaunching, setIsLaunching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [pastSessions, setPastSessions] = useState<HiveSession[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Persistence: Load on mount
    useEffect(() => {
        const saved = localStorage.getItem('hive_session_id');
        if (saved) setSessionId(saved);

        // Fetch past sessions
        const supabase = createClient();
        supabase.from('hive_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10)
            .then(({ data }) => {
                if (data) setPastSessions(data);
            });
    }, []);

    // Persistence: Save on change
    useEffect(() => {
        if (sessionId) localStorage.setItem('hive_session_id', sessionId);
        else localStorage.removeItem('hive_session_id');
    }, [sessionId]);

    // Session Control
    const handleSessionControl = useCallback(async (action: 'pause' | 'resume') => {
        if (!sessionId) return;
        try {
            await fetch(`/api/orchestrate/${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            setIsPaused(action === 'pause');
        } catch (e) { console.error(e); }
    }, [sessionId]);

    const handleRetryTask = useCallback(async (taskId: string) => {
        if (!sessionId) return;
        try {
            await fetch(`/api/orchestrate/${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry', task_id: taskId }),
            });
        } catch (e) { console.error(e); }
    }, [sessionId]);

    // Auto-scroll logs
    useEffect(() => {
        if (activeTab === 'terminal') {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, activeTab]);

    // Realtime Subscription
    useEffect(() => {
        if (!sessionId) return;
        const supabase = createClient();

        // Initial load
        supabase.from('hive_tasks').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
            .then(({ data }) => data && setTasks(data));
        supabase.from('hive_agent_logs').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
            .then(({ data }) => data && setLogs(data));

        const channel = supabase.channel(`hive-${sessionId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'hive_tasks', filter: `session_id=eq.${sessionId}` }, (payload) => {
                const newTask = payload.new as HiveTask;
                setTasks(prev => {
                    const idx = prev.findIndex(t => t.id === newTask.id);
                    return idx >= 0 ? prev.map((t, i) => i === idx ? newTask : t) : [...prev, newTask];
                });
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hive_agent_logs', filter: `session_id=eq.${sessionId}` }, (payload) => {
                setLogs(prev => [...prev, payload.new as HiveLog]);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [sessionId]);

    // Update DuckScene via prop
    useEffect(() => {
        if (onTaskStatusChange) {
            ['antigravity', 'mallory', 'quacksworth'].forEach(agent => {
                const agentTasks = tasks.filter(t => (t.assigned_agent || t.owner) === agent);
                if (agentTasks.some(t => t.status === 'in_progress')) onTaskStatusChange(agent, 'Working');
                else if (agentTasks.every(t => t.status === 'done') && agentTasks.length > 0) onTaskStatusChange(agent, 'Done');
                else if (agentTasks.some(t => t.status === 'blocked')) onTaskStatusChange(agent, 'Blocked');
                else onTaskStatusChange(agent, 'Idle');
            });
        }
    }, [tasks, onTaskStatusChange]);

    // ── Auto-Open Primary Artifact ──
    const lastOpenedUrl = useRef<string | null>(null);
    useEffect(() => {
        const allDone = tasks.length > 0 && tasks.every(t => t.status === 'done' || t.status === 'blocked');
        if (allDone && isOpen) {
            // Priority: URL containing index.html > Any URL > Raw HTML BLOB
            const mainArtifact = tasks.find(t => t.output?.includes('index.html') && t.output?.startsWith('http'))
                || tasks.find(t => t.output?.startsWith('http'));

            if (mainArtifact?.output) {
                const url = mainArtifact.output.startsWith('http')
                    ? mainArtifact.output
                    : mainArtifact.output.includes('Public URL: ')
                        ? mainArtifact.output.split('Public URL: ')[1].trim()
                        : null;

                if (url && url !== lastOpenedUrl.current) {
                    console.log("[HIVE] Mission success! Auto-opening deliverable:", url);
                    window.open(url, '_blank');
                    lastOpenedUrl.current = url;
                }
            }
        }
    }, [tasks, isOpen]);

    const handleLaunch = useCallback(async () => {
        if (!goal.trim()) return;
        setIsLaunching(true);
        setError(null);
        setTasks([]);
        setLogs([]);
        try {
            const res = await fetch('/api/orchestrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal: goal.trim() }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSessionId(data.session_id);
        } catch (err: any) { setError(err.message); }
        finally { setIsLaunching(false); }
    }, [goal]);

    if (!isOpen) return null;

    const allDone = tasks.length > 0 && tasks.every(t => t.status === 'done' || t.status === 'blocked');
    const outputTasks = tasks.filter(t => t.output && (t.output.startsWith('http') || t.output.length > 50));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-7xl h-[90vh] bg-[#0a0a0a] rounded-xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden font-sans">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#0f0f0f]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center bg-violet-500/20 rounded-lg text-lg">🐝</div>
                        <div>
                            <h2 className="text-white font-bold text-sm tracking-wide">HIVE CONTROL</h2>
                            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Autonomous Swarm Orchestrator</p>
                        </div>
                    </div>
                    {sessionId && (
                        <div className="flex items-center gap-3 bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                            <span className="text-xs text-gray-400 font-mono">{sessionId.split('-')[0]}</span>
                            <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-orange-500' : allDone ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                            {!allDone && (
                                <button onClick={() => handleSessionControl(isPaused ? 'resume' : 'pause')} className="text-[10px] uppercase text-gray-500 hover:text-white transition-colors">
                                    {isPaused ? 'Resume' : 'Pause'}
                                </button>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {sessionId && (
                            <button onClick={() => { setSessionId(null); setTasks([]); setLogs([]); setGoal(''); }} className="text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded hover:bg-white/5 transition-colors">
                                New Session
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-500 hover:text-white p-2">✕</button>
                    </div>
                </div>

                {/* Content */}
                {!sessionId ? (
                    // Launch Screen
                    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-grid-white/[0.02]">
                        <div className="text-8xl mb-8 animate-pulse text-violet-500/20">🐝</div>
                        <div className="w-full max-w-xl">
                            <label className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3 block text-center">Mission Objective</label>
                            <div className="relative group">
                                <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <input
                                    type="text"
                                    value={goal}
                                    onChange={(e) => setGoal(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleLaunch()}
                                    placeholder="e.g. Build a landing page for a sci-fi coffee shop..."
                                    className="w-full bg-[#151515] border border-gray-800 rounded-xl px-6 py-4 text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all relative z-10"
                                    autoFocus
                                />
                                <button
                                    onClick={handleLaunch}
                                    disabled={!goal.trim() || isLaunching}
                                    className="absolute right-2 top-2 bottom-2 px-6 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed z-20"
                                >
                                    {isLaunching ? 'Initiating...' : 'Launch Swarm'}
                                </button>
                            </div>
                            {error && <p className="text-red-400 text-center mt-4 text-sm bg-red-900/10 py-2 rounded border border-red-900/30">{error}</p>}
                        </div>

                        {/* Past Sessions */}
                        {pastSessions.length > 0 && (
                            <div className="w-full max-w-xl mt-8">
                                <label className="text-gray-600 text-[10px] font-bold uppercase tracking-widest mb-3 block">Recent Sessions</label>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {pastSessions.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setSessionId(s.id)}
                                            className="w-full flex items-center gap-3 bg-[#111] border border-gray-800 rounded-lg px-4 py-3 text-left hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group"
                                        >
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'completed' ? 'bg-emerald-400' :
                                                s.status === 'failed' ? 'bg-red-400' :
                                                    s.status === 'running' ? 'bg-amber-400 animate-pulse' :
                                                        'bg-gray-500'
                                                }`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-gray-300 text-xs font-medium truncate group-hover:text-white transition-colors">
                                                    {s.goal || 'Untitled Session'}
                                                </div>
                                                <div className="text-gray-600 text-[10px] font-mono mt-0.5">
                                                    {new Date(s.created_at).toLocaleDateString()} · {s.status}
                                                </div>
                                            </div>
                                            <span className="text-gray-700 text-xs group-hover:text-violet-400 transition-colors">→</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // Split View
                    <div className="flex-1 flex overflow-hidden">
                        {/* LEFT: Task Graph */}
                        <div className="w-[60%] border-r border-gray-800 flex flex-col bg-[#0a0a0a] relative">
                            <div className="p-6 overflow-y-auto space-y-6">
                                {['antigravity', 'mallory', 'quacksworth'].map(agent => {
                                    const agentTasks = tasks.filter(t => (t.assigned_agent || t.owner) === agent);
                                    if (agentTasks.length === 0 && !allDone) return null;

                                    const colors = AGENT_COLORS[agent as keyof typeof AGENT_COLORS] || AGENT_COLORS.system;

                                    return (
                                        <div key={agent} className={`rounded-xl border ${colors.border} ${colors.bg} p-1 relative overflow-hidden group`}>
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                                            <div className="bg-[#0f0f0f]/90 rounded-lg p-4 relative z-10 h-full backdrop-blur-sm">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-2xl">{AGENT_EMOJI[agent]}</div>
                                                        <div>
                                                            <div className={`font-bold text-sm uppercase tracking-wider ${colors.text}`}>{agent}</div>
                                                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">
                                                                {agent === 'antigravity' ? 'Orchestrator' : agent === 'mallory' ? 'Product Manager' : 'Lead Engineer'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-mono text-gray-500 bg-black/40 px-2 py-1 rounded">
                                                        {agentTasks.filter(t => t.status === 'done').length} / {agentTasks.length}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    {agentTasks.map(task => {
                                                        const status = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
                                                        const priority = PRIORITY_LABELS[task.priority || 3];

                                                        return (
                                                            <div key={task.id} className="bg-black/40 border border-white/5 rounded p-3 hover:border-white/10 transition-colors group/task">
                                                                <div className="flex items-start gap-3">
                                                                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${status.color} ${status.pulse ? 'animate-pulse' : ''}`} />
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-gray-300 text-xs leading-relaxed font-mono break-words mb-2">
                                                                            {task.instruction}
                                                                        </div>
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${status.color.replace('bg-', 'text-')} bg-black/40 border border-white/5`}>
                                                                                {status.label}
                                                                            </span>
                                                                            {task.priority && task.priority !== 3 && (
                                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${priority.color}`}>
                                                                                    {priority.label}
                                                                                </span>
                                                                            )}
                                                                            {task.tokens_used > 0 && (
                                                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-800 font-mono">
                                                                                    {task.tokens_used.toLocaleString()} TOKENS
                                                                                </span>
                                                                            )}
                                                                            {task.status === 'blocked' && (
                                                                                <button onClick={() => handleRetryTask(task.id)} className="text-[9px] px-2 py-0.5 rounded bg-red-500 hover:bg-red-400 text-white font-bold uppercase tracking-wide">
                                                                                    Retry
                                                                                </button>
                                                                            )}
                                                                            {task.output && (
                                                                                <span className="text-[9px] text-gray-600 px-1">
                                                                                    ✓ Output generated
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {agentTasks.length === 0 && (
                                                        <div className="text-center py-6 text-gray-700 text-xs italic">
                                                            Awaiting assignments...
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* NEW: Artifact Preview Section (Prominent at Bottom) */}
                            {outputTasks.length > 0 && (
                                <div className="mt-auto p-6 border-t border-gray-800 bg-black/60 backdrop-blur-md">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-emerald-400 text-sm">✨</span>
                                            <h3 className="text-gray-300 text-xs font-bold uppercase tracking-widest">Latest Running Artifact</h3>
                                        </div>
                                        <div className="flex gap-2">
                                            {(outputTasks[0].output?.trim().startsWith('<html') || extractUrl(outputTasks[0].output)) && (
                                                <button
                                                    onClick={() => {
                                                        const url = extractUrl(outputTasks[0].output);
                                                        if (url) {
                                                            window.open(url, '_blank');
                                                        } else {
                                                            const blob = new Blob([outputTasks[0].output!], { type: 'text/html' });
                                                            const blobUrl = URL.createObjectURL(blob);
                                                            window.open(blobUrl, '_blank');
                                                        }
                                                    }}
                                                    className="text-[10px] bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-full hover:bg-emerald-600/30 transition-all font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-900/10 animate-pulse"
                                                >
                                                    🚀 Launch Full Preview
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-gray-700 bg-white/5 overflow-hidden h-64 relative group">
                                        {outputTasks[0].output?.trim().startsWith('<html') || outputTasks[0].output?.trim().startsWith('<!DOCTYPE') ? (
                                            <iframe
                                                srcDoc={outputTasks[0].output}
                                                className="w-full h-full bg-white scale-[1.0] origin-top-left"
                                                title="Artifact Preview"
                                            />
                                        ) : extractUrl(outputTasks[0].output) ? (
                                            <div className="w-full h-full bg-white relative">
                                                <iframe
                                                    src={extractUrl(outputTasks[0].output)!}
                                                    className="w-full h-full border-0"
                                                    title="Artifact Preview"
                                                />
                                                <div className="absolute top-2 right-2 flex gap-2">
                                                    <div className="bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                                        <span className="animate-pulse">●</span> LIVE
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 font-mono text-xs text-gray-500 overflow-y-auto h-full whitespace-pre-wrap">
                                                {outputTasks[0].output?.substring(0, 1000)}
                                                {(outputTasks[0].output?.length || 0) > 1000 && '...'}
                                            </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
                                            <div className="text-[10px] text-gray-400 font-medium truncate max-w-[80%]">
                                                {outputTasks[0].instruction}
                                            </div>
                                            <div className="text-[10px] text-gray-500 font-mono">
                                                {new Date(outputTasks[0].updated_at).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Terminal & Artifacts */}
                        <div className="w-[40%] flex flex-col bg-[#050505]">
                            <div className="flex border-b border-gray-800">
                                <button
                                    onClick={() => setActiveTab('terminal')}
                                    className={`flex-1 py-3 text-xs font-mono uppercase tracking-widest text-center transition-colors border-b-2 ${activeTab === 'terminal' ? 'border-green-500 text-green-400 bg-green-500/5' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
                                >
                                    {'>'}_ Terminal
                                </button>
                                <button
                                    onClick={() => setActiveTab('artifacts')}
                                    className={`flex-1 py-3 text-xs font-mono uppercase tracking-widest text-center transition-colors border-b-2 ${activeTab === 'artifacts' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
                                >
                                    Artifacts ({outputTasks.length})
                                </button>
                            </div>

                            {activeTab === 'terminal' ? (
                                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 bg-[#050505] selection:bg-green-500/30">
                                    {logs.length === 0 && <div className="text-gray-700 italic text-center mt-20">// System initialized. Waiting for stream...</div>}
                                    {logs.map(log => {
                                        const colors = AGENT_COLORS[log.agent] || AGENT_COLORS.system;
                                        return (
                                            <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded -mx-1">
                                                <span className="text-gray-700 shrink-0 select-none">
                                                    {new Date(log.created_at).toLocaleTimeString([], { hour12: false })}
                                                </span>
                                                <span className={`${colors.text} font-bold shrink-0 w-24 text-right uppercase tracking-wider`}>
                                                    {log.agent}
                                                </span>
                                                <span className="text-gray-400 break-words flex-1">
                                                    <span className="text-gray-600 uppercase text-[10px] mr-2 border border-gray-800 px-1 rounded">
                                                        {log.action}
                                                    </span>
                                                    {typeof log.payload === 'string' ? log.payload : (log.payload?.instruction || log.payload?.goal || JSON.stringify(log.payload))}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <div ref={logsEndRef} />
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#0a0a0a]">
                                    {outputTasks.length === 0 && (
                                        <div className="text-center py-20">
                                            <div className="text-4xl mb-4 grayscale opacity-20">📦</div>
                                            <p className="text-gray-600 text-xs">No artifacts generated yet.</p>
                                        </div>
                                    )}
                                    {outputTasks.map(t => (
                                        <div key={t.id} className="bg-[#0f0f0f] border border-gray-800 rounded-lg p-4 group hover:border-blue-500/30 transition-colors">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-blue-400 text-xs font-bold uppercase tracking-wider">
                                                    Generative Artifact
                                                </span>
                                                <span className="text-gray-600 text-[10px]">{new Date(t.updated_at).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="text-gray-300 text-sm mb-4 font-medium leading-relaxed">
                                                {t.instruction}
                                            </div>
                                            {extractUrl(t.output) ? (
                                                <button
                                                    onClick={() => window.open(extractUrl(t.output)!, '_blank')}
                                                    className="flex items-center justify-center w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs transition-colors shadow-lg shadow-emerald-900/20"
                                                >
                                                    🚀 Launch Website ↗
                                                </button>
                                            ) : (t.output && (t.output.trim().startsWith('<html') || t.output.trim().startsWith('<!DOCTYPE'))) ? (
                                                <button
                                                    onClick={() => {
                                                        const blob = new Blob([t.output!], { type: 'text/html' });
                                                        const url = URL.createObjectURL(blob);
                                                        window.open(url, '_blank');
                                                    }}
                                                    className="flex items-center justify-center w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs transition-colors shadow-lg shadow-blue-900/20"
                                                >
                                                    Open HTML Preview ↗
                                                </button>
                                            ) : (
                                                <div className="bg-black p-3 rounded border border-gray-800 text-gray-400 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                                                    {t.output}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HivePanel;
