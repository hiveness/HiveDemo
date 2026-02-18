"use client";

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

const TILE_SIZE = 50;
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2000;

const SimpleArena = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState({ x: 10, y: 10, color: "#4f46e5" });
  const playerRef = useRef(player);

  useEffect(() => {
    playerRef.current = player;
    draw();
  }, [player]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    for (let i = 0; i <= canvas.width; i += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i <= canvas.height; i += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    // Draw Player
    const { x, y, color } = playerRef.current;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(
      x * TILE_SIZE + 5,
      y * TILE_SIZE + 5,
      TILE_SIZE - 10,
      TILE_SIZE - 10,
      8
    );
    ctx.fill();

    // Player shadow/glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Tag
    ctx.fillStyle = "#111827";
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("You", x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE - 10);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { x, y } = playerRef.current;
      let newX = x;
      let newY = y;

      switch (e.key.toLowerCase()) {
        case "arrowup":
        case "w":
          newY = Math.max(0, y - 1);
          break;
        case "arrowdown":
        case "s":
          newY = Math.min(CANVAS_HEIGHT / TILE_SIZE - 1, y + 1);
          break;
        case "arrowleft":
        case "a":
          newX = Math.max(0, x - 1);
          break;
        case "arrowright":
        case "d":
          newX = Math.min(CANVAS_WIDTH / TILE_SIZE - 1, x + 1);
          break;
      }

      if (newX !== x || newY !== y) {
        // Use GSAP for smooth position transition if needed, 
        // but for grid movement, we update state.
        // We could animate a "ghost" or actual position if we weren't strictly grid-based.
        setPlayer((prev) => ({ ...prev, x: newX, y: newY }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Initial draw
  useEffect(() => {
    draw();
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-[80vh] bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden shadow-2xl group"
    >
      <div className="absolute top-6 left-6 z-10 bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Simple Workspace</h2>
        <p className="text-sm text-slate-500 mt-1">Use Arrow Keys or WASD to move</p>
        <div className="mt-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-600">Online</span>
        </div>
      </div>
      
      <div className="w-full h-full overflow-auto custom-scrollbar">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="bg-white cursor-crosshair transition-opacity duration-500"
        />
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default SimpleArena;
