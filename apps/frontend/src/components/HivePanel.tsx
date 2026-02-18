'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useSessionAgents } from './SessionAgentsContext';
import { Zap, Settings as SettingsIcon } from 'lucide-react';
import SkillsPanel from './Skills/SkillsPanel';

interface HiveTask {
    id: string;
    goal: string;
    spec?: any;
    status: string;
    assigned_agent_id?: string | null;
    parent_task_id: string | null;
    result: string | null;
    priority?: number;
    tokens_used?: number;
    created_at: string;
    updated_at: string;
    actual_cost_usd?: number | null;
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
    completed: { label: 'DONE', color: 'bg-emerald-400' },
    failed: { label: 'FAILED', color: 'bg-red-500' },
    blocked: { label: 'BLOCKED', color: 'bg-red-400' },
    blocked_budget: { label: 'OVERSUBSCRIBED', color: 'bg-orange-500' },
};

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
    1: { label: 'CRITICAL', color: 'text-red-400 bg-red-900/40 border border-red-800' },
    2: { label: 'HIGH', color: 'text-orange-400 bg-orange-900/40 border border-orange-800' },
    3: { label: 'NORMAL', color: 'text-blue-400 bg-blue-900/40 border border-blue-800' },
    4: { label: 'LOW', color: 'text-gray-400 bg-gray-800/40 border border-gray-700' },
    5: { label: 'TRIVIAL', color: 'text-gray-500 bg-gray-900/40 border border-gray-800' },
};

const SUGGESTED_MISSIONS = [
    { id: 'web', title: 'Fullstack App', goal: 'Build a Next.js 15 app with Supabase auth and local storage, using a high-end Bento Box design.', icon: '🚀', color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { id: 'reddit', title: 'Reddit Research', goal: 'Scrape /r/LocalLLaMA for the latest trends in Quantization and draft a technical blog post.', icon: '🛸', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { id: 'maps', title: 'Geo Agent', goal: 'Locate the top 5 highly-rated vegan restaurants in San Francisco and create a travel routing plan.', icon: '📍', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { id: 'code', title: 'Automator', goal: 'Write a GitHub Action that automatically triages new issues using OpenAI and labels them.', icon: '🛠️', color: 'text-blue-400', bg: 'bg-blue-500/10' },
];

const AGENT_EMOJI: Record<string, string> = {
    antigravity: '🧠',
    mallory: '📋',
    quacksworth: '🦆',
    system: '⚙️',
    duck: '🦆',
    blu_guy: '📋',
};

interface HivePanelProps {
    isOpen: boolean;
    onClose: () => void;
    onTaskStatusChange?: (agent: string, status: string) => void;
}

const HivePanel: React.FC<HivePanelProps> = ({ isOpen, onClose, onTaskStatusChange }) => {
    const { agents } = useSessionAgents();
    const [goal, setGoal] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [tasks, setTasks] = useState<HiveTask[]>([]);
    const [logs, setLogs] = useState<HiveLog[]>([]);
    const [activeTab, setActiveTab] = useState<'terminal' | 'artifacts' | 'logs'>('terminal');
    const [viewMode, setViewMode] = useState<'swarm' | 'skills' | 'settings'>('swarm');
    const [dbAgents, setDbAgents] = useState<any[]>([]);

    const LogViewer = () => {
        const [logType, setLogType] = useState('pm');
        const [logContent, setLogContent] = useState('');

        useEffect(() => {
            const fetchLogs = async () => {
                try {
                    const res = await fetch(`/api/logs/${logType}`);
                    const data = await res.json();
                    setLogContent(data.logs);
                } catch (e) {
                    console.error(e);
                }
            };
            fetchLogs();
            const interval = setInterval(fetchLogs, 2000);
            return () => clearInterval(interval);
        }, [logType]);

        return (
            <div className="flex flex-col h-full bg-[#050505] font-mono text-xs">
                <div className="flex border-b border-gray-800 p-2 gap-2">
                    {['api', 'pm', 'dev', 'orchestrator'].map(t => (
                        <button
                            key={t}
                            onClick={() => setLogType(t)}
                            className={`px-3 py-1 rounded uppercase ${logType === t ? 'bg-orange-500/20 text-orange-400' : 'text-gray-600 hover:text-gray-400'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-auto p-4 text-gray-400 whitespace-pre-wrap">
                    {logContent || 'No logs found.'}
                </div>
            </div>
        );
    };
    const [integrations, setIntegrations] = useState<Record<string, boolean>>({
        gmail: false,
        github: false,
        web_search: true,
        memory: true
    });

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

        // Load integrations
        const savedIntegrations = localStorage.getItem('hive_integrations');
        if (savedIntegrations) setIntegrations(JSON.parse(savedIntegrations));
    }, []);

    useEffect(() => {
        localStorage.setItem('hive_integrations', JSON.stringify(integrations));
    }, [integrations]);

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

        const fetchTasksAndAgents = async () => {
            const { data: tasksData } = await supabase.from('tasks').select('*').or(`id.eq.${sessionId},parent_task_id.eq.${sessionId}`).order('created_at', { ascending: true });
            if (tasksData) setTasks(tasksData as HiveTask[]);

            // Also fetch database agents for mapping
            const { data: agentsData } = await supabase.from('agents').select('*');
            if (agentsData) setDbAgents(agentsData);
        };
        fetchTasksAndAgents();

        supabase.from('telemetry_events').select('*').eq('task_id', sessionId).order('created_at', { ascending: true })
            .then(({ data }) => {
                if (data) {
                    setLogs(data.map(d => ({
                        id: d.id,
                        session_id: sessionId,
                        agent: d.agent_id,
                        action: d.event_type,
                        payload: d.payload,
                        created_at: d.created_at
                    })));
                }
            });

        const channel = supabase.channel(`hive-${sessionId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `or(id=eq.${sessionId},parent_task_id=eq.${sessionId})` }, (payload) => {
                const newTask = payload.new as HiveTask;
                setTasks(prev => {
                    const idx = prev.findIndex(t => t.id === newTask.id);
                    return idx >= 0 ? prev.map((t, i) => i === idx ? newTask : t) : [...prev, newTask];
                });
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry_events' }, (payload) => {
                const newLog = payload.new as any;
                if (newLog.task_id === sessionId) {
                    setLogs(prev => [...prev, {
                        id: newLog.id,
                        session_id: sessionId,
                        agent: newLog.agent_id,
                        action: newLog.event_type,
                        payload: newLog.payload,
                        created_at: newLog.created_at
                    }]);
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [sessionId]);

    // Update DuckScene via prop
    useEffect(() => {
        if (onTaskStatusChange) {
            const rootTask = tasks.find(t => t.id === sessionId);
            const subtasks = tasks.filter(t => t.parent_task_id === sessionId);

            // Map agent IDs to roles/names for status reporting
            const pmAgent = agents.find(a => a.role === 'pm')?.id;
            const devAgent = agents.find(a => a.role === 'dev')?.id;

            if (pmAgent) {
                const pmStatus = rootTask?.status;
                if (pmStatus === 'in_progress') onTaskStatusChange('antigravity', 'Working');
                else if (pmStatus === 'completed' || pmStatus === 'done') onTaskStatusChange('antigravity', 'Done');
                else onTaskStatusChange('antigravity', 'Idle');
            }

            if (devAgent) {
                const devTasks = subtasks.filter(t => t.assigned_agent_id === devAgent);
                if (devTasks.some(t => t.status === 'in_progress')) onTaskStatusChange('quacksworth', 'Working');
                else if (devTasks.length > 0 && devTasks.every(t => t.status === 'completed' || t.status === 'done')) onTaskStatusChange('quacksworth', 'Done');
                else onTaskStatusChange('quacksworth', 'Idle');
            }
        }
    }, [tasks, onTaskStatusChange, sessionId, agents]);

    // ── Auto-Open Primary Artifact ──
    const lastOpenedUrl = useRef<string | null>(null);
    useEffect(() => {
        const allDone = tasks.length > 0 && tasks.every(t => t.status === 'done' || t.status === 'blocked');
        if (allDone && isOpen) {
            // Priority: URL containing index.html > Any URL > Raw HTML BLOB
            const mainArtifact = tasks.find(t => t.result?.includes('index.html') && t.result?.startsWith('http'))
                || tasks.find(t => t.result?.startsWith('http'));

            if (mainArtifact?.result) {
                const url = mainArtifact.result.startsWith('http')
                    ? mainArtifact.result
                    : mainArtifact.result.includes('Public URL: ')
                        ? mainArtifact.result.split('Public URL: ')[1].trim()
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
                body: JSON.stringify({
                    goal: goal.trim(),
                    integrations // Pass user integration preferences
                }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSessionId(data.task_id);
        } catch (err: any) { setError(err.message); }
        finally { setIsLaunching(false); }
    }, [goal]);

    const allDone = tasks.length > 0 && tasks.every(t => ['done', 'completed', 'blocked', 'failed', 'blocked_budget'].includes(t.status));
    const outputTasks = tasks.filter(t => t.result && (t.result.startsWith('http') || t.result.length > 0));

    const [selectedAgentIdentity, setSelectedAgentIdentity] = useState<string | null>(null);

    if (!isOpen) return null;

    // Filter agents based on who actually has tasks or is part of the team
    const activeAgentIds = Array.from(new Set([
        ...tasks.map(t => t.assigned_agent_id || 'antigravity'),
        ...agents.map(a => a.id)
    ])).filter(id => id && (id === 'antigravity' || agents.find(a => a.id === id) || id === 'system' || tasks.some(t => t.assigned_agent_id === id)));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-7xl h-[90vh] bg-[#0a0a0a] rounded-xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden font-sans">
                {/* Identity Modal Overlay */}
                {selectedAgentIdentity && (() => {
                    const agent = agents.find(a => a.id === selectedAgentIdentity) || (selectedAgentIdentity === 'antigravity' ? agents.find(a => a.id === 'orchestrator') : null);
                    if (!agent) return null;
                    return (
                        <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in zoom-in duration-200">
                            <div className="w-full max-w-3xl h-full flex flex-col bg-[#0f0f0f] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                                    <div className="flex items-center gap-4">
                                        <div className="text-4xl" style={{ filter: `drop-shadow(0 0 10px ${agent.tint})` }}>
                                            {agent.type === 'duck' ? '🦆' : agent.type === 'blu_guy' ? '📋' : '🧠'}
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-bold text-white tracking-tight">{agent.name}</h3>
                                            <p className="text-sm text-gray-400 uppercase tracking-widest">{agent.role}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedAgentIdentity(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-500 hover:text-white">✕</button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar">
                                    <section>
                                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400 mb-4 block opacity-70">Core Identity (Soul)</label>
                                        <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed font-serif italic border-l-2 border-violet-500/30 pl-6 bg-violet-500/5 py-4 rounded-r-lg">
                                            {agent.soul.split('\n').map((line, i) => <p key={i}>{line.replace(/^#+ /, '')}</p>)}
                                        </div>
                                    </section>
                                    <section>
                                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-4 block opacity-70">About Agent</label>
                                        <div className="text-gray-300 leading-relaxed text-sm bg-blue-500/5 p-6 rounded-xl border border-blue-500/10">
                                            {agent.about.replace(/^#+ About .*\n\n/, '')}
                                        </div>
                                    </section>
                                    <section>
                                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400 mb-4 block opacity-70">Recent Memory</label>
                                        <div className="bg-emerald-500/5 p-6 rounded-xl border border-emerald-500/10 font-mono text-[11px] text-emerald-300/80">
                                            {agent.memory.split('\n').map((line, i) => (
                                                <div key={i} className="flex gap-3 mb-1">
                                                    <span className="opacity-30">{i + 1}</span>
                                                    <span>{line.replace(/^#+ /, '')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    );
                })()}

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
                    <button
                        onClick={() => setViewMode(viewMode === 'skills' ? 'swarm' : 'skills')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'skills' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        title="Swarm Skills"
                    >
                        <Zap size={20} />
                    </button>
                    <button
                        onClick={() => setViewMode(viewMode === 'settings' ? 'swarm' : 'settings')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'settings' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        title="System Settings"
                    >
                        <SettingsIcon size={20} />
                    </button>
                    {sessionId && (
                        <button onClick={() => { setSessionId(null); setTasks([]); setLogs([]); setGoal(''); setViewMode('swarm'); }} className="text-xs text-gray-500 hover:text-white px-3 py-1.5 rounded hover:bg-white/5 transition-colors">
                            New Session
                        </button>
                    )}
                    <button onClick={onClose} className="text-gray-500 hover:text-white p-2">✕</button>
                </div>
            </div>

            {/* Content */}
            {viewMode === 'skills' ? (
                <SkillsPanel />
            ) : viewMode === 'settings' ? (
                // Settings View
                <div className="flex-1 overflow-y-auto p-12 bg-[#050505]">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-3xl font-bold text-white mb-2">System Settings</h2>
                        <p className="text-gray-500 mb-12">Configure your HIVE integrations and agent capabilities.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Integrations */}
                            <div className="space-y-6">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-violet-400">Services & Integrations</h3>
                                {[
                                    { id: 'gmail', name: 'Google Gmail', icon: '✉️', desc: 'Allow agents to read and send emails' },
                                    { id: 'github', name: 'GitHub', icon: '🐙', desc: 'Enable repository access and PR creation' },
                                    { id: 'web_search', name: 'Web Research', icon: '🔍', desc: 'Agents can search the internet for info' },
                                    { id: 'memory', name: 'Corporate Memory', icon: '🧠', desc: 'Long-term storage for swarm learnings' },
                                ].map(item => (
                                    <div key={item.id} className="bg-[#111] border border-gray-800 rounded-2xl p-6 flex items-center justify-between group hover:border-gray-700 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{item.icon}</div>
                                            <div>
                                                <h4 className="text-white font-bold">{item.name}</h4>
                                                <p className="text-gray-500 text-xs">{item.desc}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setIntegrations(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                            className={`w-12 h-6 rounded-full transition-all relative ${integrations[item.id] ? 'bg-violet-600' : 'bg-gray-800'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${integrations[item.id] ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Preferences */}
                            <div className="space-y-8">
                                <div className="space-y-6">
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-blue-400">Behavioral Policy</h3>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-8 space-y-8">
                                        <div>
                                            <label className="text-white font-bold block mb-4">Autonomy Level</label>
                                            <div className="flex gap-2">
                                                {['Supervised', 'Hybrid', 'Autonomous'].map(level => (
                                                    <button key={level} className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${level === 'Hybrid' ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40' : 'bg-white/5 text-gray-500 border-white/10 hover:border-white/20'}`}>
                                                        {level}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-4">
                                                <label className="text-white font-bold">Safety Guardrails</label>
                                                <span className="text-[10px] text-emerald-400 font-mono">ENFORCED</span>
                                            </div>
                                            <p className="text-gray-500 text-xs leading-relaxed">
                                                Hive agents will automatically request approval for destructive actions (e.g. deleting files) or transactions over $5.00.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Advanced Skills (Clawhub Integration) */}
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Advanced Skills (Clawhub)</h3>
                                        <a href="https://clawhub.ai/skills?sort=downloads" target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-bold">Discover More ↗</a>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { id: 'reddit', name: 'Reddit Scraper', icon: '🤖' },
                                            { id: 'maps', name: 'Google Maps', icon: '📍' },
                                            { id: 'youtube', name: 'YouTube Video Analyser', icon: '📹' },
                                            { id: 'finance', name: 'Market Data (Yahoo)', icon: '📈' },
                                        ].map(skill => (
                                            <div key={skill.id} className="bg-[#111] border border-gray-800 rounded-xl p-4 flex items-center justify-between group hover:border-amber-500/30 transition-all cursor-pointer">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl group-hover:rotate-12 transition-transform">{skill.icon}</span>
                                                    <span className="text-xs text-gray-400 group-hover:text-white transition-colors">{skill.name}</span>
                                                </div>
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : !sessionId ? (
                // Launch Screen
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-grid-white/[0.02] overflow-y-auto">
                    <div className="text-8xl mb-8 animate-pulse text-violet-500/20">🐝</div>
                    <div className="w-full max-w-2xl mb-12">
                        <label className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3 block text-center">Mission Objective</label>
                        <div className="relative group">
                            <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <input
                                type="text"
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleLaunch()}
                                placeholder="e.g. Build a landing page for a sci-fi coffee shop..."
                                className="w-full bg-[#151515] border border-gray-800 rounded-xl px-6 py-5 text-white text-xl placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all relative z-10"
                                autoFocus
                            />
                            <button
                                onClick={handleLaunch}
                                disabled={!goal.trim() || isLaunching}
                                className="absolute right-2 top-2 bottom-2 px-8 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed z-20 flex items-center gap-2"
                            >
                                {isLaunching ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Initiating...
                                    </>
                                ) : (
                                    <>Launch Swarm <span className="text-lg">🚀</span></>
                                )}
                            </button>
                        </div>
                        {error && <p className="text-red-400 text-center mt-4 text-sm bg-red-900/10 py-2 rounded border border-red-900/30">{error}</p>}
                    </div>

                    {/* Suggested Missions */}
                    <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                        {SUGGESTED_MISSIONS.map(m => (
                            <button
                                key={m.id}
                                onClick={() => { setGoal(m.goal); setTimeout(handleLaunch, 100); }}
                                className={`flex flex-col items-start text-left p-6 rounded-2xl border border-gray-800 ${m.bg} hover:border-white/20 transition-all group relative overflow-hidden`}
                            >
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className={`text-2xl mb-4 ${m.color}`}>{m.icon}</div>
                                <h4 className="text-white font-bold text-sm mb-2 uppercase tracking-wide">{m.title}</h4>
                                <p className="text-gray-500 text-[10px] leading-relaxed line-clamp-3 group-hover:text-gray-300 transition-colors">
                                    {m.goal}
                                </p>
                            </button>
                        ))}
                    </div>

                    {/* Past Sessions */}
                    {pastSessions.length > 0 && (
                        <div className="w-full max-w-4xl border-t border-gray-900 pt-8">
                            <label className="text-gray-600 text-[10px] font-bold uppercase tracking-widest mb-4 block text-center">Re-engage Past Swarms</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pr-1">
                                {pastSessions.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSessionId(s.id)}
                                        className="flex items-center gap-3 bg-[#111] border border-gray-800 rounded-xl px-4 py-3 text-left hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group"
                                    >
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'completed' ? 'bg-emerald-400' :
                                            s.status === 'failed' ? 'bg-red-400' :
                                                s.status === 'running' ? 'bg-amber-400 animate-pulse' :
                                                    'bg-gray-500'
                                            }`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-gray-400 text-[11px] font-medium truncate group-hover:text-white transition-colors">
                                                {s.goal || 'Untitled Session'}
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
                            {activeAgentIds.map(agentId => {
                                const agent = agents.find(a => a.id === agentId) || (agentId === 'antigravity' ? agents.find(a => a.id === 'orchestrator') : null);

                                // Filter tasks for this agent card
                                const agentTasks = tasks.filter(t => {
                                    // 1. Direct ID match
                                    if (t.assigned_agent_id === agentId) return true;

                                    // 2. Unassigned tasks go to Antigravity (the orchestrator)
                                    if (agentId === 'antigravity' && !t.assigned_agent_id) return true;

                                    // 3. Match UUID to Card by Role/Name
                                    if (t.assigned_agent_id) {
                                        const dbAgent = dbAgents.find(a => a.id === t.assigned_agent_id);
                                        if (dbAgent && agent) {
                                            // If names match (e.g. "Quacksworth")
                                            if (dbAgent.name?.toLowerCase() === agent.name.toLowerCase()) return true;
                                            // If roles match and it's a dev-N or pm-N card
                                            if (dbAgent.role === 'dev' && agent.role.toLowerCase().includes('developer')) return true;
                                            if (dbAgent.role === 'pm' && agent.role.toLowerCase().includes('manager')) return true;
                                        }
                                    }
                                    return false;
                                });

                                const colors = AGENT_COLORS[agentId as keyof typeof AGENT_COLORS] || AGENT_COLORS.system;
                                const emoji = agent?.type === 'duck' ? '🦆' : agent?.type === 'blu_guy' ? '📋' : AGENT_EMOJI[agentId] || '⚙️';

                                return (
                                    <div key={agentId} className={`rounded-xl border ${colors.border} ${colors.bg} p-1 relative overflow-hidden group`}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                                        <div className="bg-[#0f0f0f]/90 rounded-lg p-4 relative z-10 h-full backdrop-blur-sm">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3 cursor-pointer group/identity" onClick={() => setSelectedAgentIdentity(agentId)}>
                                                    <div className="text-2xl group-hover/identity:scale-110 transition-transform">{emoji}</div>
                                                    <div>
                                                        <div className={`font-bold text-sm uppercase tracking-wider ${colors.text} flex items-center gap-2`}>
                                                            {agent?.name || agentId}
                                                            <span className="text-[8px] bg-white/10 px-1 rounded opacity-0 group-hover/identity:opacity-100 transition-opacity">VIEW SOUL</span>
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">
                                                            {agent?.role || (agentId === 'antigravity' ? 'Orchestrator' : 'System')}
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
                                                                        {task.goal}
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
                                                                        {(task.tokens_used ?? 0) > 0 && (
                                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-800 font-mono">
                                                                                {task.tokens_used?.toLocaleString()} TOKENS
                                                                            </span>
                                                                        )}
                                                                        {task.status === 'blocked' && (
                                                                            <button onClick={() => handleRetryTask(task.id)} className="text-[9px] px-2 py-0.5 rounded bg-red-500 hover:bg-red-400 text-white font-bold uppercase tracking-wide">
                                                                                Retry
                                                                            </button>
                                                                        )}
                                                                        {task.result && (
                                                                            <span className="text-[9px] text-gray-600 px-1">
                                                                                ✓ Result generated
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
                                        {(outputTasks[0].result?.trim().startsWith('<html') || extractUrl(outputTasks[0].result)) && (
                                            <button
                                                onClick={() => {
                                                    const url = extractUrl(outputTasks[0].result);
                                                    if (url) {
                                                        window.open(url, '_blank');
                                                    } else {
                                                        const blob = new Blob([outputTasks[0].result!], { type: 'text/html' });
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
                                    {outputTasks[0].result?.trim().startsWith('<html') || outputTasks[0].result?.trim().startsWith('<!DOCTYPE') ? (
                                        <iframe
                                            srcDoc={outputTasks[0].result}
                                            className="w-full h-full bg-white scale-[1.0] origin-top-left"
                                            title="Artifact Preview"
                                        />
                                    ) : extractUrl(outputTasks[0].result) ? (
                                        <div className="w-full h-full bg-white relative">
                                            <iframe
                                                src={extractUrl(outputTasks[0].result)!}
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
                                            {outputTasks[0].result?.substring(0, 1000)}
                                            {(outputTasks[0].result?.length || 0) > 1000 && '...'}
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
                                        <div className="text-[10px] text-gray-400 font-medium truncate max-w-[80%]">
                                            {outputTasks[0].goal}
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
                            <button
                                onClick={() => setActiveTab('logs')}
                                className={`flex-1 py-3 text-xs font-mono uppercase tracking-widest text-center transition-colors border-b-2 ${activeTab === 'logs' ? 'border-orange-500 text-orange-400 bg-orange-500/5' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
                            >
                                System Logs
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
                                            {t.goal}
                                        </div>
                                        {extractUrl(t.result) ? (
                                            <button
                                                onClick={() => window.open(extractUrl(t.result)!, '_blank')}
                                                className="flex items-center justify-center w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs transition-colors shadow-lg shadow-emerald-900/20"
                                            >
                                                🚀 Launch Website ↗
                                            </button>
                                        ) : (t.result && (t.result.trim().startsWith('<html') || t.result.trim().startsWith('<!DOCTYPE'))) ? (
                                            <button
                                                onClick={() => {
                                                    const blob = new Blob([t.result!], { type: 'text/html' });
                                                    const url = URL.createObjectURL(blob);
                                                    window.open(url, '_blank');
                                                }}
                                                className="flex items-center justify-center w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs transition-colors shadow-lg shadow-blue-900/20"
                                            >
                                                Open HTML Preview ↗
                                            </button>
                                        ) : (
                                            <div className="bg-black p-3 rounded border border-gray-800 text-gray-400 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                                                {t.result}
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
        </div >
    );
};

export default HivePanel;
