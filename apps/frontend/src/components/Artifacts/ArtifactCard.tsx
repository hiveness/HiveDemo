'use client';
import React, { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';

// ── Type metadata ─────────────────────────────────────────────────────────────
const TYPE_ICONS: Record<string, string> = {
    html: '🌐',
    pdf: '📄',
    form: '📋',
    react: '⚛️',
    csv: '📊',
    markdown: '📝',
};

const TYPE_LABELS: Record<string, string> = {
    html: 'HTML Page',
    pdf: 'PDF Document',
    form: 'Interactive Form',
    react: 'React Component',
    csv: 'Data Table',
    markdown: 'Markdown Doc',
};

const TYPE_COLORS: Record<string, { card: string; badge: string; btn: string }> = {
    html: {
        card: 'bg-blue-950/40 border-blue-500/30',
        badge: 'bg-blue-500/20 text-blue-300',
        btn: 'bg-blue-600 hover:bg-blue-500',
    },
    pdf: {
        card: 'bg-red-950/40 border-red-500/30',
        badge: 'bg-red-500/20 text-red-300',
        btn: 'bg-red-600 hover:bg-red-500',
    },
    form: {
        card: 'bg-green-950/40 border-green-500/30',
        badge: 'bg-green-500/20 text-green-300',
        btn: 'bg-green-600 hover:bg-green-500',
    },
    react: {
        card: 'bg-cyan-950/40 border-cyan-500/30',
        badge: 'bg-cyan-500/20 text-cyan-300',
        btn: 'bg-cyan-600 hover:bg-cyan-500',
    },
    csv: {
        card: 'bg-yellow-950/40 border-yellow-500/30',
        badge: 'bg-yellow-500/20 text-yellow-300',
        btn: 'bg-yellow-600 hover:bg-yellow-500',
    },
    markdown: {
        card: 'bg-purple-950/40 border-purple-500/30',
        badge: 'bg-purple-500/20 text-purple-300',
        btn: 'bg-purple-600 hover:bg-purple-500',
    },
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ArtifactPayload {
    artifact_id: string;
    preview_url: string;
    type: string;
    title: string;
    description?: string;
}

interface ArtifactCardProps {
    artifactId: string;
    previewUrl: string;
    type: string;
    title: string;
    description?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ArtifactCard({ artifactId, previewUrl, type, title, description }: ArtifactCardProps) {
    const [copied, setCopied] = useState(false);

    const icon = TYPE_ICONS[type] ?? '📁';
    const label = TYPE_LABELS[type] ?? type.toUpperCase();
    const colors = TYPE_COLORS[type] ?? {
        card: 'bg-zinc-900/40 border-zinc-500/30',
        badge: 'bg-zinc-500/20 text-zinc-300',
        btn: 'bg-zinc-600 hover:bg-zinc-500',
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(previewUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback: select text
        }
    };

    const handleOpen = () => {
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className={`my-3 rounded-2xl border ${colors.card} overflow-hidden shadow-xl transition-all hover:shadow-2xl`}>
            {/* Header bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-2.5">
                    <span className="text-xl leading-none">{icon}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${colors.badge}`}>
                        {label}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handleCopy}
                        title="Copy link"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                    >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                    <button
                        onClick={handleOpen}
                        title="Open in new tab"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <ExternalLink size={14} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
                <h3 className="text-white font-semibold text-sm leading-snug mb-1 truncate">{title}</h3>
                {description && (
                    <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">{description}</p>
                )}
            </div>

            {/* Footer CTA */}
            <div className="px-5 pb-4 flex items-center gap-2">
                <button
                    onClick={handleOpen}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-xs font-bold uppercase tracking-wide transition-all active:scale-95 shadow-lg ${colors.btn}`}
                >
                    Open ↗
                </button>
                <button
                    onClick={handleCopy}
                    className="px-4 py-2.5 rounded-xl text-xs font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                >
                    {copied ? '✓ Copied' : 'Copy link'}
                </button>
            </div>

            {/* Artifact ID footer */}
            <div className="px-5 py-2 border-t border-white/5 bg-black/10 flex justify-between items-center">
                <span className="text-[9px] font-mono text-gray-600">ID: {artifactId.split('-')[0]}…</span>
                <span className="text-[9px] text-gray-600">Expires in 24h</span>
            </div>
        </div>
    );
}

// ── Parser helper (used by message renderer) ──────────────────────────────────
export function parseArtifactFromText(text: string): ArtifactPayload | null {
    if (!text) return null;

    // 1. Try parsing the whole text as JSON first (most common case)
    try {
        const parsed = JSON.parse(text.trim());
        if (parsed.artifact_id && parsed.preview_url && parsed.type && parsed.title) {
            return parsed as ArtifactPayload;
        }
    } catch {
        // not pure JSON — try to find embedded JSON
    }

    // 2. Scan for a JSON object containing artifact_id anywhere in the text
    const jsonMatch = text.match(/\{[^{}]*"artifact_id"[^{}]*\}/s);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.artifact_id && parsed.preview_url && parsed.type && parsed.title) {
                return parsed as ArtifactPayload;
            }
        } catch {
            // malformed embedded JSON
        }
    }

    return null;
}

export default ArtifactCard;
