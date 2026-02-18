import React, { useEffect, useRef, useState, useCallback } from "react";
import { Users } from "lucide-react";
import AgentChatbot from "./game/AgentChatbot";
import OnboardingModal from "./OnboardingModal";
import { SessionAgentsProvider, useSessionAgents } from "./SessionAgentsContext";
import { createClient } from "@/utils/supabase/client";
import HivePanel from "./HivePanel";

const GatherAppInner: React.FC = () => {
    const gameRef = useRef<HTMLDivElement>(null);
    const phaserGame = useRef<any>(null);
    const [playerCount, setPlayerCount] = useState(1);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [currentAgentName, setCurrentAgentName] = useState("");
    const [isGroupChat, setIsGroupChat] = useState(false);
    const [currentZone, setCurrentZone] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string>("");
    const [isHiveOpen, setIsHiveOpen] = useState(false);

    // block input when hive is open
    useEffect(() => {
        const event = new CustomEvent('toggle-input-capture', { detail: { blocked: isHiveOpen } });
        window.dispatchEvent(event);
    }, [isHiveOpen]);

    const { agents, isOnboarded, workspaceGoal } = useSessionAgents();

    useEffect(() => {
        // Generate a simple session ID for this run
        const newUid = crypto.randomUUID();
        setSessionId(newUid);

        // Auto-trigger a HIVE session on reload or onboarding
        const triggerAutoSession = async () => {
            // If we just onboarded, use the actual goal. Otherwise, do a mission review.
            const sessionGoal = workspaceGoal || "Review HIVE mission (company.md) and core values (values.md). Analyze recent activity and propose 1-2 small improvements to the system or documentation.";

            try {
                const res = await fetch('/api/orchestrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ goal: sessionGoal }),
                });
                const data = await res.json();
                if (data.session_id) {
                    console.log("HIVE Session started:", data.session_id);
                    localStorage.setItem('hive_session_id', data.session_id);
                    setIsHiveOpen(true); // Automatically open the panel
                }
            } catch (e) {
                console.error("Failed to start HIVE session:", e);
            }
        };

        // Delay slightly to ensure backend is ready
        if (isOnboarded) {
            setTimeout(triggerAutoSession, 2000);
        }

        // Listen for chat-spawned sessions
        const handleOpenHive = (e: any) => {
            if (e.detail?.sessionId) {
                setIsHiveOpen(true);
            }
        };
        window.addEventListener('hive:open-session', handleOpenHive);
        return () => window.removeEventListener('hive:open-session', handleOpenHive);
    }, [isOnboarded]); // Re-run when isOnboarded changes

    const focusCanvas = useCallback(() => {
        const canvas = gameRef.current?.querySelector("canvas");
        if (canvas) {
            canvas.setAttribute("tabindex", "0");
            canvas.focus();
        }
    }, []);

    const handleSpacePressed = useCallback((agentName: string, zone?: { label: string; type: string }) => {
        setCurrentAgentName(agentName);
        setIsGroupChat(zone?.type === 'group');
        setCurrentZone(zone?.label || null);
        setIsChatOpen(true);
        const scene = phaserGame.current?.scene?.getScene('DuckScene');
        if (scene) (scene as any).setIsChatOpen(true);
    }, []);

    const handleRequestHuddle = useCallback(() => {
        const scene = phaserGame.current?.scene?.getScene('DuckScene');
        if (scene) {
            (scene as any).requestHuddle();
            // Open huddle chat
            setCurrentAgentName('All Agents');
            setIsGroupChat(true);
            setCurrentZone('📋 Meeting / Quick Huddle Zone');
            setIsChatOpen(true);
            (scene as any).setIsChatOpen(true);
        }
    }, []);

    useEffect(() => {
        if (!isOnboarded || agents.length === 0) return;
        if (phaserGame.current) return;

        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const initPhaser = async () => {
            const Phaser = (await import("phaser")).default;
            const { default: DuckScene } = await import("./game/DuckScene");

            // Prepare agent configs for DuckScene
            const agentConfigs = agents.map(a => ({
                id: a.id,
                name: a.name,
                role: a.role,
                type: a.type,
                tint: a.tint,
            }));

            class DuckSceneWithCallbacks extends DuckScene {
                init() {
                    super.init({
                        onSpacePressed: handleSpacePressed,
                        agents: agentConfigs,
                    });
                }
            }

            const config: Phaser.Types.Core.GameConfig = {
                type: Phaser.AUTO,
                width: window.innerWidth,
                height: window.innerHeight,
                parent: gameRef.current!,
                backgroundColor: "#ffffff",
                scene: [DuckSceneWithCallbacks],
                pixelArt: true,
                antialias: false,
                roundPixels: true,
                scale: {
                    mode: Phaser.Scale.RESIZE,
                    autoCenter: Phaser.Scale.CENTER_BOTH,
                    width: "100%",
                    height: "100%",
                },
                input: {
                    keyboard: {
                        target: window,
                    },
                },
            };

            phaserGame.current = new Phaser.Game(config);

            pollInterval = setInterval(() => {
                try {
                    const scene = phaserGame.current?.scene?.getScene('DuckScene');
                    if (!scene) return;
                    const agentCount = (scene as any).getAgentCount?.() || 0;
                    setPlayerCount(agentCount + 1); // agents + orchestrator
                } catch (e) {
                    // scene not ready yet
                }
            }, 1000);

            setTimeout(focusCanvas, 500);
        };

        initPhaser();

        return () => {
            if (pollInterval) clearInterval(pollInterval);
            if (phaserGame.current) {
                phaserGame.current.destroy(true);
                phaserGame.current = null;
            }
        };
    }, [isOnboarded, agents, focusCanvas, handleSpacePressed]);

    // Handle ESC key to close chat
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isChatOpen) {
                setIsChatOpen(false);
                const scene = phaserGame.current?.scene?.getScene('DuckScene');
                if (scene) (scene as any).setIsChatOpen(false);
                setTimeout(focusCanvas, 10);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isChatOpen, focusCanvas]);

    // Supabase Real-time Subscription for Visuals
    useEffect(() => {
        const supabase = createClient();
        let uuidMap: Record<string, string> = {};

        // 1. Fetch agent UUID mapping
        supabase.from('agents').select('id, agent_id').then(({ data }) => {
            if (data) {
                data.forEach(a => {
                    uuidMap[a.id] = a.agent_id;
                });
            }
        });

        // 2. Subscribe to messages
        const channel = supabase
            .channel('messages-visuals')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    const scene = phaserGame.current?.scene?.getScene('DuckScene');
                    if (!scene) return;

                    const newMsg = payload.new;
                    // Check if message is agent-to-agent (both UUIDs present)
                    if (newMsg.sender_id && newMsg.receiver_id) {
                        const senderId = uuidMap[newMsg.sender_id];
                        const receiverId = uuidMap[newMsg.receiver_id];

                        if (senderId && receiverId) {
                            // Visuals: Move sender to receiver
                            (scene as any).moveAgentToAgent?.(senderId, receiverId);

                            // Visuals: Set status to "Chatting"
                            (scene as any).setAgentStatus?.(senderId, 'Chatting');
                            (scene as any).setAgentStatus?.(receiverId, 'Chatting');

                            // Reset after 5s
                            setTimeout(() => {
                                (scene as any).setAgentStatus?.(senderId, 'Idle');
                                (scene as any).setAgentStatus?.(receiverId, 'Idle');
                            }, 5000);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Find the current agent config for the chat
    const currentAgentConfig = agents.find(a => a.name === currentAgentName);

    // Count devs and PMs
    const devCount = agents.filter(a => a.type === 'duck' && a.id !== 'orchestrator').length;
    const pmCount = agents.filter(a => a.type === 'blu_guy').length;

    return (
        <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-white">
            {/* Onboarding Modal */}
            <OnboardingModal />

            {isOnboarded && (
                <>
                    {/* Header bar */}
                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-3 pointer-events-none">
                        <div className="flex items-center gap-3 pointer-events-auto bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm border border-gray-100">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
                            <span className="text-gray-800 text-sm font-semibold tracking-wide">
                                🦆 Duck Gather
                            </span>
                            <span className="text-gray-300 text-xs">•</span>
                            <span className="text-gray-500 text-xs font-medium">
                                {devCount} devs • {pmCount} PMs
                            </span>
                        </div>
                        <div className="flex items-center gap-2 pointer-events-auto">
                            <span className="text-gray-400 text-xs bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                                WASD / Arrows to move
                            </span>
                            <span className="text-gray-400 text-xs bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                                Shift = sprint
                            </span>
                            <span className="text-indigo-600 text-xs bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm font-bold">
                                Tab / ⇧Tab = Switch Duck
                            </span>
                            <span className="text-gray-400 text-xs bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
                                Click = Select
                            </span>
                            <button
                                id="request-huddle-btn"
                                onClick={handleRequestHuddle}
                                className="flex items-center gap-1.5 text-amber-600 text-xs bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-amber-200 shadow-sm font-bold hover:bg-amber-50/80 transition-all active:scale-95"
                            >
                                <Users className="w-3.5 h-3.5" />
                                Huddle
                            </button>
                            <button
                                id="hive-panel-btn"
                                onClick={() => setIsHiveOpen(true)}
                                className="flex items-center gap-1.5 text-violet-600 text-xs bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-violet-200 shadow-sm font-bold hover:bg-violet-50/80 transition-all active:scale-95"
                            >
                                🐝 HIVE
                            </button>
                        </div>
                    </div>

                    {/* Full screen game container */}
                    <div
                        ref={gameRef}
                        className="w-full h-full"
                        onClick={focusCanvas}
                    />

                    {/* Bottom status */}
                    <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center px-6 py-2 pointer-events-none">
                        <span className="text-gray-300 text-xs bg-white/60 backdrop-blur-sm px-4 py-1 rounded-full">
                            {agents.length} agents active • Space to chat 🦆
                        </span>
                    </div>

                    <AgentChatbot
                        agentName={currentAgentName}
                        agentConfig={currentAgentConfig}
                        isOpen={isChatOpen}
                        isGroupChat={isGroupChat}
                        zoneName={currentZone || undefined}
                        sessionId={sessionId}
                        onClose={() => {
                            setIsChatOpen(false);
                            const scene = phaserGame.current?.scene?.getScene('DuckScene');
                            if (scene) {
                                (scene as any).setIsChatOpen(false);
                                if (isGroupChat) {
                                    (scene as any).disperseAgents();
                                }
                            }
                            setTimeout(focusCanvas, 10);
                        }}
                    />

                    {/* <HivePanel
                        isOpen={isHiveOpen}
                        onClose={() => setIsHiveOpen(false)}
                    /> */}
                </>
            )}
        </div>
    );
};


const GatherApp: React.FC = () => {
    return (
        <SessionAgentsProvider>
            <GatherAppInner />
        </SessionAgentsProvider>
    );
};

export default GatherApp;
