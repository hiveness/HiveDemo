"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface AgentConfig {
    id: string;
    name: string;
    role: string;        // e.g. "Frontend Developer", "Product Manager"
    type: "duck" | "blu_guy";
    tint: string;        // hex color e.g. "0x44cc88"
    soul: string;        // full soul.md content
    personality: {
        name: string;
        role: string;
        traits: string[];
        appearance: { type: string; tint: string };
        speech_pattern: string;
    };
    memory: {
        learnings: string[];
        blink_count: number;
    };
}

interface SessionAgentsState {
    workspaceGoal: string;
    devCount: number;
    agents: AgentConfig[];
    isOnboarded: boolean;
    isGenerating: boolean;
}

interface SessionAgentsContextType extends SessionAgentsState {
    generateAgents: (goal: string, devCount: number) => Promise<void>;
    getAgentByName: (name: string) => AgentConfig | undefined;
    getAgentByIndex: (index: number) => AgentConfig | undefined;
    updateAgentMemory: (agentId: string, memory: { learnings: string[]; blink_count: number }) => void;
}

const SessionAgentsContext = createContext<SessionAgentsContextType | null>(null);

export function useSessionAgents() {
    const ctx = useContext(SessionAgentsContext);
    if (!ctx) throw new Error("useSessionAgents must be used within SessionAgentsProvider");
    return ctx;
}

export const SessionAgentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<SessionAgentsState>({
        workspaceGoal: "",
        devCount: 0,
        agents: [],
        isOnboarded: false,
        isGenerating: false,
    });

    const generateAgents = useCallback(async (goal: string, devCount: number) => {
        setState(prev => ({ ...prev, isGenerating: true, workspaceGoal: goal, devCount }));

        try {
            const res = await fetch("/api/agent/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ goal, devCount }),
            });

            if (!res.ok) throw new Error("Failed to generate agents");

            const data = await res.json();

            setState(prev => ({
                ...prev,
                agents: data.agents,
                isOnboarded: true,
                isGenerating: false,
            }));
        } catch (err) {
            console.error("Agent generation failed:", err);
            setState(prev => ({ ...prev, isGenerating: false }));
            throw err;
        }
    }, []);

    const getAgentByName = useCallback((name: string) => {
        return state.agents.find(a => a.name === name || a.id === name);
    }, [state.agents]);

    const getAgentByIndex = useCallback((index: number) => {
        return state.agents[index];
    }, [state.agents]);

    const updateAgentMemory = useCallback((agentId: string, memory: { learnings: string[]; blink_count: number }) => {
        setState(prev => ({
            ...prev,
            agents: prev.agents.map(a =>
                a.id === agentId ? { ...a, memory } : a
            ),
        }));
    }, []);

    return (
        <SessionAgentsContext.Provider value={{
            ...state,
            generateAgents,
            getAgentByName,
            getAgentByIndex,
            updateAgentMemory,
        }}>
            {children}
        </SessionAgentsContext.Provider>
    );
};
