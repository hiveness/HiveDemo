'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function PreviewPage() {
    const params = useParams();
    const id = params.id as string;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="fixed inset-0 bg-[#050505] flex flex-col">
            <header className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0a] z-50">
                <div className="flex items-center gap-4">
                    <div className="w-6 h-6 bg-violet-600 rounded flex items-center justify-center text-[10px] font-bold">🐝</div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">HIVE Artifact Preview <span className="text-gray-600 mx-2">|</span> {id}</span>
                </div>
                <button
                    onClick={() => window.close()}
                    className="text-gray-500 hover:text-white transition-colors text-xs"
                >
                    Close Preview
                </button>
            </header>

            <div className="flex-1 relative">
                <iframe
                    src={`/api/artifacts/${id}`}
                    className="absolute inset-0 w-full h-full bg-white"
                    sandbox="allow-scripts allow-forms allow-same-origin"
                    title="Artifact Preview"
                />
            </div>
        </div>
    );
}
