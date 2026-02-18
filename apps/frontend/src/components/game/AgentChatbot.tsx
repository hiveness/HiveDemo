"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Bot, User } from 'lucide-react';
import { AgentConfig } from '../SessionAgentsContext';
import { ArtifactCard, parseArtifactFromText } from '../Artifacts/ArtifactCard';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'agent';
    timestamp: Date;
    blinked?: boolean;
}

interface AgentChatbotProps {
    agentName: string;
    agentConfig?: AgentConfig;
    isOpen: boolean;
    onClose: () => void;
    isGroupChat?: boolean;
    zoneName?: string;
    sessionId?: string;
}

const AgentChatbot: React.FC<AgentChatbotProps> = ({ agentName, agentConfig, isOpen, onClose, isGroupChat, zoneName, sessionId }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [busyness, setBusyness] = useState(0);
    const [isBlinking, setIsBlinking] = useState(false);
    const [agentMemory, setAgentMemory] = useState<any>({ learnings: [], blink_count: 0 });

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initialize memory from config
    useEffect(() => {
        if (agentConfig?.memory && typeof agentConfig.memory === 'object') {
            setAgentMemory(agentConfig.memory);
        }
    }, [agentConfig]);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            const displayName = agentConfig?.name || agentName;
            setMessages([
                {
                    id: '1',
                    text: isGroupChat
                        ? (zoneName?.includes('Meeting')
                            ? `Welcome to the Huddle! ✨ Antigravity (Orchestrator) and the agents have arrived to assist you.`
                            : `Welcome to the ${zoneName || 'Group chat'}. All agents are here to help!`)
                        : `Hello! I'm ${displayName}. How can I help you today?`,
                    sender: 'agent',
                    timestamp: new Date(),
                },
            ]);
        }
    }, [isOpen, isGroupChat, zoneName, agentName, agentConfig]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const displayName = agentConfig?.name || agentName;

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            text: inputValue,
            sender: 'user',
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            const body: any = {
                agentId: isGroupChat ? "All Agents" : (agentConfig?.id || agentName),
                message: inputValue,
                history: messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
                sessionId
            };

            // Send inline config for dynamic agents
            if (agentConfig) {
                body.inlineConfig = {
                    soul: agentConfig.soul,
                    personality: agentConfig.personality,
                    memory: agentMemory,
                };
            }

            const response = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (data.blinked) {
                setIsBlinking(true);
                setTimeout(() => setIsBlinking(false), 2000);
            }

            // Update local memory if returned
            if (data.updatedMemory) {
                setAgentMemory(data.updatedMemory);
            }

            setBusyness(data.busyness || 0);

            const agentMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: data.text || "I'm having trouble thinking right now...",
                sender: 'agent',
                timestamp: new Date(),
                blinked: data.blinked
            };
            setMessages((prev) => [...prev, agentMsg]);

            // If a HIVE session was spawned, tell the parent to open the HIVE panel
            if (data.hive_session_id) {
                localStorage.setItem('hive_session_id', data.hive_session_id);
                // Dispatch event so HivePanel or GatherApp can open it
                window.dispatchEvent(new CustomEvent('hive:open-session', {
                    detail: { sessionId: data.hive_session_id }
                }));
            }
        } catch (error) {
            console.error("Chat Error:", error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                text: "Sorry, I couldn't process that. Please try again.",
                sender: 'agent',
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // Stop keystrokes from propagating to the game while typing
    const stopPropagation = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="fixed bottom-24 right-8 w-96 max-h-[600px] bg-white/90 backdrop-blur-xl border border-gray-200 rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-300">
            {/* Header */}
            <div className={`${isGroupChat ? 'bg-emerald-600/95' : 'bg-indigo-600/95'} px-6 py-4 flex items-center justify-between text-white shadow-md transition-colors duration-500`}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md relative overflow-hidden">
                        {isGroupChat ? <Bot size={22} className="text-white" /> : (
                            agentConfig?.type === 'blu_guy' ?
                                <img src="/sprites/blu_guy/Blu%20Guy/Sprites/Idle/Down%20Idle/01.png" className="w-8 h-8 object-contain" alt="" /> :
                                <Bot size={22} className="text-white" />
                        )}
                        {isBlinking && (
                            <div className="absolute inset-0 bg-white/40 animate-pulse flex items-center justify-center">
                                <span className="text-[8px] font-bold text-indigo-900">BLINK</span>
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold text-base tracking-tight">
                            {isGroupChat ? (zoneName || 'Group Chat') : displayName}
                        </h3>
                        {agentConfig && !isGroupChat && (
                            <p className="text-[10px] text-white/70">{agentConfig.role}</p>
                        )}
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5" title="Blinking Memory Capacity">
                                <div className="relative w-16 h-4 bg-black/20 rounded-md overflow-hidden border border-white/10">
                                    <div
                                        className="h-full bg-emerald-400 transition-all duration-1000 ease-out"
                                        style={{ width: `${busyness}%` }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-full h-full opacity-30 mix-blend-overlay bg-[url('/ui/bars/Bars/Sprites/Stamina%20or%20Power%20Bar/05.png')] bg-cover" />
                                    </div>
                                </div>
                                <span className="text-[10px] text-indigo-100/80 font-mono">
                                    {Math.round(busyness)}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] scrollbar-hide"
            >
                {messages.map((msg) => {
                    // ── Artifact detection: agent messages that are pure JSON artifact payloads ──
                    if (msg.sender === 'agent') {
                        const artifact = parseArtifactFromText(msg.text);
                        if (artifact) {
                            return (
                                <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <ArtifactCard
                                        artifactId={artifact.artifact_id}
                                        previewUrl={artifact.preview_url}
                                        type={artifact.type}
                                        title={artifact.title}
                                        description={artifact.description}
                                    />
                                </div>
                            );
                        }
                    }

                    return (
                        <div
                            key={msg.id}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                        >
                            <div className={`flex gap-3 max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${msg.sender === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {msg.sender === 'user' ? <User size={14} /> : (
                                        agentConfig?.type === 'blu_guy' && !isGroupChat ?
                                            <img src="/sprites/blu_guy/Blu%20Guy/Sprites/Idle/Down%20Idle/01.png" className="w-6 h-6 object-contain" alt="" /> :
                                            <Bot size={14} />
                                    )}
                                </div>
                                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === 'user'
                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                    : 'bg-gray-50 text-gray-700 border border-gray-100 rounded-tl-none'
                                    }`}>
                                    {msg.text.split("Action Taken:")[0].split("Confidence Score:")[0]}

                                    {msg.sender === 'agent' && (
                                        <div className="mt-3 space-y-2 border-t border-gray-100 pt-2 text-[11px]">
                                            {msg.text.includes("Action Taken:") && (
                                                <div className="flex items-center gap-2 text-indigo-600 font-semibold bg-indigo-50/50 px-2 py-1 rounded-lg">
                                                    <span className="uppercase tracking-widest text-[9px] opacity-70">Action:</span>
                                                    <span>{msg.text.match(/Action Taken:\s*(.*)/)?.[1]?.split("Confidence Score:")[0]}</span>
                                                </div>
                                            )}
                                            {msg.text.includes("Confidence Score:") && (
                                                <div className="flex items-center gap-2 text-emerald-600 font-semibold bg-emerald-50/50 px-2 py-1 rounded-lg w-fit">
                                                    <span className="uppercase tracking-widest text-[9px] opacity-70">Confidence:</span>
                                                    <span>{msg.text.match(/Confidence Score:\s*([\d.]+)/)?.[1]}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {msg.blinked && (
                                        <div className="mt-2 text-[10px] italic text-indigo-400 font-medium border-t border-indigo-50/50 pt-1">
                                            ✨ Blinked: Memory compressed to maintain clarity.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {isLoading && (
                    <div className="flex justify-start animate-pulse">
                        <div className="bg-gray-50 px-4 py-3 rounded-2xl text-sm text-gray-400 italic">
                            {displayName} is thinking...
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-5 bg-gray-50/50 border-t border-gray-100">
                <div className="relative group">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={stopPropagation}
                        onKeyUp={(e) => e.stopPropagation()}
                        onKeyPress={(e) => e.stopPropagation()}
                        placeholder={isGroupChat ? `Message the group...` : `Ask ${displayName}...`}
                        className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3.5 pr-14 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-xl transition-all shadow-lg active:scale-95"
                    >
                        <Send size={18} />
                    </button>
                </div>
                <p className="mt-3 text-[10px] text-center text-gray-400 font-medium uppercase tracking-widest">
                    Press Enter to send • Esc to close
                </p>
            </div>
        </div>
    );
};

export default AgentChatbot;
