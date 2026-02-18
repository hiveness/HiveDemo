'use client';
import React, { useState, useEffect } from 'react';
import { Search, ToggleLeft as Toggle, Settings, Zap, Globe, MessageSquare, Database, Terminal } from 'lucide-react';

interface Skill {
    name: string;
    display_name: string;
    description: string;
    version: string;
    icon: string;
    category: string;
    requires_auth: boolean;
    enabled_by_default: boolean;
}

const CATEGORY_ICONS: Record<string, any> = {
    research: Globe,
    communication: MessageSquare,
    data: Database,
    code: Terminal,
    automation: Zap,
};

export default function SkillsPanel() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [search, setSearch] = useState('');
    const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSkills();
        const saved = localStorage.getItem('hive_enabled_skills');
        if (saved) setEnabledSkills(JSON.parse(saved));
    }, []);

    const fetchSkills = async () => {
        try {
            const res = await fetch('/api/skills');
            const data = await res.json();
            setSkills(data);
        } catch (err) {
            console.error('Failed to fetch skills:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleSkill = (name: string) => {
        const next = enabledSkills.includes(name)
            ? enabledSkills.filter(s => s !== name)
            : [...enabledSkills, name];

        setEnabledSkills(next);
        localStorage.setItem('hive_enabled_skills', JSON.stringify(next));

        // Notify backend of toggle (optional but recommended in prompt)
        fetch(`/api/skills/${name}/toggle`, { method: 'POST' });
    };

    const filteredSkills = skills.filter(s =>
        s.display_name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
    );

    const categories = Array.from(new Set(skills.map(s => s.category)));

    if (loading) return <div className="p-8 text-center text-gray-500">Loading skills...</div>;

    return (
        <div className="flex flex-col h-full bg-[#050505] text-white p-8 overflow-y-auto">
            <header className="mb-8">
                <h2 className="text-3xl font-bold mb-2">Capabilities & Skills</h2>
                <p className="text-gray-400">Enable or disable high-level tools for your HIVE swarm.</p>
            </header>

            <div className="relative mb-8">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                    type="text"
                    placeholder="Search skills (e.g. 'Gmail', 'Web Search')..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="space-y-12">
                {categories.map(cat => (
                    <section key={cat}>
                        <div className="flex items-center gap-2 mb-4">
                            {React.createElement(CATEGORY_ICONS[cat] || Zap, { size: 16, className: "text-violet-400" })}
                            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">{cat}</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredSkills.filter(s => s.category === cat).map(skill => {
                                const isEnabled = skill.enabled_by_default || enabledSkills.includes(skill.name);
                                return (
                                    <div key={skill.name} className={`p-5 rounded-2xl border transition-all ${isEnabled ? 'bg-violet-500/5 border-violet-500/30' : 'bg-white/5 border-white/5 opacity-70 hover:opacity-100'}`}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="text-3xl mb-2">{skill.icon}</div>
                                            <button
                                                onClick={() => toggleSkill(skill.name)}
                                                className={`w-12 h-6 rounded-full relative transition-colors ${isEnabled ? 'bg-violet-600' : 'bg-gray-800'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isEnabled ? 'right-1' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        <h4 className="font-bold text-lg mb-1">{skill.display_name}</h4>
                                        <p className="text-gray-400 text-sm leading-relaxed mb-4">{skill.description}</p>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {skill.requires_auth && (
                                                    <span className="text-[10px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold uppercase tracking-tight">Requires Auth</span>
                                                )}
                                                <span className="text-[10px] bg-white/5 text-gray-500 px-2 py-0.5 rounded-full border border-white/5 font-mono">v{skill.version}</span>
                                            </div>
                                            {skill.requires_auth && isEnabled && (
                                                <button className="text-gray-400 hover:text-white transition-colors">
                                                    <Settings size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
