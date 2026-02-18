"use client";

import React, { useState } from "react";
import { Rocket, Users, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { useSessionAgents } from "./SessionAgentsContext";

const OnboardingModal: React.FC = () => {
    const { isOnboarded, isGenerating, generateAgents } = useSessionAgents();
    const [step, setStep] = useState(1);
    const [goal, setGoal] = useState("");
    const [devCount, setDevCount] = useState(3);
    const [error, setError] = useState("");

    if (isOnboarded) return null;

    const handleSubmit = async () => {
        if (!goal.trim()) {
            setError("Please describe your workspace goal");
            return;
        }
        if (devCount < 1 || devCount > 8) {
            setError("Developer count must be between 1 and 8");
            return;
        }
        setError("");
        try {
            await generateAgents(goal.trim(), devCount);
        } catch {
            setError("Failed to generate agents. Please try again.");
        }
    };

    const pmCount = Math.ceil(devCount / 2);
    const totalAgents = devCount + pmCount + 1; // +1 for orchestrator

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950">
            {/* Animated background particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full bg-white/5 animate-pulse"
                        style={{
                            width: `${Math.random() * 6 + 2}px`,
                            height: `${Math.random() * 6 + 2}px`,
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${Math.random() * 3 + 2}s`,
                        }}
                    />
                ))}
            </div>

            {/* Main card */}
            <div className="relative w-full max-w-lg mx-4">
                {/* Glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-3xl blur-xl opacity-30 animate-pulse" />

                <div className="relative bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-8 pt-8 pb-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white tracking-tight">Duck Gather</h1>
                                <p className="text-xs text-indigo-300/80 font-medium">Workspace Setup</p>
                            </div>
                        </div>

                        {/* Step indicator */}
                        <div className="flex gap-2 mt-6">
                            <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-indigo-500' : 'bg-white/10'}`} />
                            <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-indigo-500' : 'bg-white/10'}`} />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-8 pb-8">
                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-2 mb-3 mt-4">
                                    <Rocket className="w-5 h-5 text-indigo-400" />
                                    <h2 className="text-lg font-semibold text-white">What's the goal?</h2>
                                </div>
                                <p className="text-sm text-slate-400 mb-5">
                                    Describe what your team will be working on. This shapes each duck's soul & expertise.
                                </p>
                                <textarea
                                    value={goal}
                                    onChange={(e) => setGoal(e.target.value)}
                                    placeholder="e.g. Build a real-time collaborative design tool with AI features..."
                                    className="w-full h-32 bg-slate-800/60 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 resize-none transition-all"
                                />
                                <button
                                    onClick={() => {
                                        if (!goal.trim()) {
                                            setError("Please describe your workspace goal");
                                            return;
                                        }
                                        setError("");
                                        setStep(2);
                                    }}
                                    className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-semibold text-sm transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                                >
                                    Continue
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-2 mb-3 mt-4">
                                    <Users className="w-5 h-5 text-indigo-400" />
                                    <h2 className="text-lg font-semibold text-white">Team Size</h2>
                                </div>
                                <p className="text-sm text-slate-400 mb-5">
                                    How many developers do you need? We'll auto-assign PMs (1 PM per 2 devs).
                                </p>

                                {/* Dev count input */}
                                <div className="flex items-center justify-center gap-6 py-6">
                                    <button
                                        onClick={() => setDevCount(Math.max(1, devCount - 1))}
                                        className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/10 text-white text-xl font-bold hover:bg-slate-700 transition-all active:scale-90"
                                    >
                                        −
                                    </button>
                                    <div className="text-center">
                                        <div className="text-5xl font-bold text-white tabular-nums">{devCount}</div>
                                        <div className="text-xs text-slate-500 mt-1 font-medium">developers</div>
                                    </div>
                                    <button
                                        onClick={() => setDevCount(Math.min(8, devCount + 1))}
                                        className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/10 text-white text-xl font-bold hover:bg-slate-700 transition-all active:scale-90"
                                    >
                                        +
                                    </button>
                                </div>

                                {/* Team breakdown */}
                                <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-4 mb-5">
                                    <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Team Breakdown</div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-300 flex items-center gap-2">
                                                🦆 Duck Developers
                                            </span>
                                            <span className="text-sm font-bold text-amber-400">{devCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-300 flex items-center gap-2">
                                                🧑‍💼 PM (Blu Guys)
                                            </span>
                                            <span className="text-sm font-bold text-blue-400">{pmCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-white/5 pt-2">
                                            <span className="text-sm text-slate-300 flex items-center gap-2">
                                                ✨ Orchestrator
                                            </span>
                                            <span className="text-sm font-bold text-yellow-400">1</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-white/10 pt-2 mt-1">
                                            <span className="text-sm font-semibold text-white">Total Agents</span>
                                            <span className="text-sm font-bold text-indigo-400">{totalAgents}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setStep(1)}
                                        disabled={isGenerating}
                                        className="px-5 py-3.5 bg-slate-800 border border-white/10 text-slate-300 rounded-2xl font-medium text-sm hover:bg-slate-700 transition-all disabled:opacity-50"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={isGenerating}
                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-semibold text-sm transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Generating {totalAgents} agents...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4" />
                                                Generate Team
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {error && (
                            <p className="mt-3 text-sm text-red-400 text-center font-medium">{error}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OnboardingModal;
