"use client";

import React, { useEffect, useRef, useCallback } from "react";

const InsaneArena: React.FC = () => {
    const gameRef = useRef<HTMLDivElement>(null);
    const phaserGame = useRef<any>(null);

    // Focus the Phaser canvas so it receives keyboard events
    const focusCanvas = useCallback(() => {
        const canvas = gameRef.current?.querySelector('canvas');
        if (canvas) {
            canvas.setAttribute('tabindex', '0');
            canvas.focus();
        }
    }, []);

    useEffect(() => {
        if (phaserGame.current) return;

        const initPhaser = async () => {
            const Phaser = (await import("phaser")).default;
            const { default: OfficeScene } = await import("./game/OfficeScene");

            const config: Phaser.Types.Core.GameConfig = {
                type: Phaser.AUTO,
                width: window.innerWidth,
                height: window.innerHeight,
                parent: gameRef.current!,
                backgroundColor: "#5a8a3a",
                scene: [OfficeScene],
                pixelArt: true,
                antialias: false,
                roundPixels: true,
                scale: {
                    mode: Phaser.Scale.RESIZE,
                    autoCenter: Phaser.Scale.CENTER_BOTH,
                    width: '100%',
                    height: '100%',
                },
                physics: {
                    default: "arcade",
                    arcade: { debug: false },
                },
                input: {
                    keyboard: {
                        target: window,
                    },
                },
            };

            phaserGame.current = new Phaser.Game(config);

            // Focus canvas after a short delay to ensure it's rendered
            setTimeout(focusCanvas, 500);
        };

        initPhaser();

        return () => {
            if (phaserGame.current) {
                phaserGame.current.destroy(true);
                phaserGame.current = null;
            }
        };
    }, [focusCanvas]);

    return (
        <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black">
            {/* Header bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-3 bg-gradient-to-b from-slate-900/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
                    <span className="text-white/90 text-sm font-bold tracking-wide">Virtual Office</span>
                    <span className="text-white/40 text-xs">•</span>
                    <span className="text-white/50 text-xs">8 online</span>
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                    <span className="text-white/30 text-xs bg-white/10 px-3 py-1 rounded-full">WASD / Arrows to move</span>
                    <span className="text-white/30 text-xs bg-white/10 px-3 py-1 rounded-full">Shift = sprint</span>
                </div>
            </div>

            {/* Full screen game container */}
            <div
                ref={gameRef}
                className="w-full h-full"
                onClick={focusCanvas}
            />

            {/* Bottom status bar */}
            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-2 bg-gradient-to-t from-slate-900/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-4">
                    <span className="text-white/50 text-xs">🏢 7 Rooms</span>
                    <span className="text-white/50 text-xs">👥 8 NPCs</span>
                    <span className="text-white/50 text-xs">🗺️ Minimap</span>
                </div>
                <span className="text-white/30 text-xs">Powered by Phaser 3 • LPC Sprites</span>
            </div>
        </div>
    );
};

export default InsaneArena;
