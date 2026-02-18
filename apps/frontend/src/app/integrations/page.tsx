'use client';
import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle2, XCircle, ExternalLink, Mail, Github, Database, Zap } from 'lucide-react';

interface Integration {
    name: string;
    description: string;
    icon: string;
    status: 'connected' | 'not_connected';
}

const INTEGRATIONS = [
    { id: 'gmail', name: 'Gmail', icon: Mail, description: 'Read and send emails, watch for new messages.', auth_url: '/api/auth/google' },
    { id: 'github', name: 'GitHub', icon: Github, description: 'Manage issues, pull requests, and repositories.', auth_url: '/api/auth/github' },
    { id: 'notion', name: 'Notion', icon: Database, description: 'Access workspace pages and databases.', auth_url: '/api/auth/notion' },
];

export default function IntegrationsPage() {
    const [connections, setConnections] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConnections();

        // Listen for OAuth success messages from child windows
        const handleMessage = (e: MessageEvent) => {
            if (e.data.type === 'HIVE_AUTH_SUCCESS') {
                fetchConnections();
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const fetchConnections = async () => {
        try {
            // This would normally be an API call to check DB connections
            // For now, we'll simulate based on known connected services
            // In a real app, GET /api/auth/status
            setConnections({ gmail: true }); // Mocking Gmail as connected for now
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = (url: string) => {
        const width = 600, height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open(url, 'hive-auth', `width=${width},height=${height},left=${left},top=${top}`);
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white p-12">
            <header className="max-w-5xl mx-auto mb-16">
                <div className="flex items-center gap-3 text-violet-400 mb-4">
                    <Shield size={24} />
                    <span className="font-bold tracking-widest uppercase text-sm">Security & Access</span>
                </div>
                <h1 className="text-5xl font-bold mb-4">Integrations</h1>
                <p className="text-xl text-gray-400 max-w-2xl leading-relaxed">
                    Connect HIVE to your external tools to enable automated workflows and cross-platform intelligence.
                </p>
            </header>

            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {INTEGRATIONS.map((int) => {
                    const isConnected = connections[int.id];
                    return (
                        <div key={int.id} className="bg-[#111] border border-white/5 rounded-3xl p-8 hover:border-white/10 transition-all group flex flex-col h-full">
                            <div className="flex items-start justify-between mb-8">
                                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-500">
                                    <int.icon size={32} />
                                </div>
                                {isConnected ? (
                                    <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-emerald-400/20">
                                        <CheckCircle2 size={12} /> Connected
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-gray-500 bg-white/5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/5">
                                        Not Connected
                                    </div>
                                )}
                            </div>

                            <h3 className="text-2xl font-bold mb-3">{int.name}</h3>
                            <p className="text-gray-500 text-sm leading-relaxed mb-8 flex-1">
                                {int.description}
                            </p>

                            <button
                                onClick={() => handleConnect(int.auth_url)}
                                className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${isConnected
                                        ? 'bg-white/5 text-gray-400 hover:bg-red-500/10 hover:text-red-400 border border-white/5'
                                        : 'bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-900/40'
                                    }`}
                            >
                                {isConnected ? 'Disconnect' : (
                                    <>Connect {int.name} <ExternalLink size={14} /></>
                                )}
                            </button>
                        </div>
                    );
                })}

                {/* Coming Soon Card */}
                <div className="bg-[#111]/30 border border-white/5 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center opacity-50">
                    <Zap size={32} className="text-gray-700 mb-4" />
                    <h3 className="text-xl font-bold text-gray-700">More Coming Soon</h3>
                    <p className="text-gray-800 text-xs mt-2 px-4">Slack, Jira, and Salesforce adapters are in development.</p>
                </div>
            </div>
        </div>
    );
}
