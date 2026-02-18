"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

// We use dynamic import for simple-peer since it's a Node-style module
let SimplePeerClass: any = null;

interface ProximityVideoProps {
    socket: any;
    nearbyPlayers: { id: string; distance: number }[];
}

interface PeerConnection {
    peer: any;
    stream: MediaStream | null;
    videoEl: HTMLVideoElement | null;
}

const ProximityVideo: React.FC<ProximityVideoProps> = ({ socket, nearbyPlayers }) => {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
    const peersRef = useRef<Map<string, PeerConnection>>(new Map());
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const nearbyRef = useRef(nearbyPlayers);
    const streamRef = useRef<MediaStream | null>(null);

    // Keep nearbyRef up to date
    useEffect(() => {
        nearbyRef.current = nearbyPlayers;
    }, [nearbyPlayers]);

    // Get local media stream
    const initLocalStream = useCallback(async () => {
        if (streamRef.current) return streamRef.current;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: { width: 320, height: 240, frameRate: 15 },
            });
            setLocalStream(stream);
            streamRef.current = stream;
            return stream;
        } catch (err) {
            console.warn('[Gather] Camera/mic not available:', err);
            return null;
        }
    }, []);

    // Load SimplePeer
    useEffect(() => {
        import('simple-peer').then((mod) => {
            SimplePeerClass = mod.default || mod;
        }).catch(() => {
            console.warn('[Gather] simple-peer not available, video chat disabled');
        });
    }, []);

    // Handle incoming signals
    useEffect(() => {
        if (!socket) return;

        const handleSignal = async (data: { from: string; signal: any }) => {
            let pc = peersRef.current.get(data.from);

            if (!pc) {
                // We received a signal but don't have a peer yet — create as non-initiator
                const stream = await initLocalStream();
                if (!SimplePeerClass || !stream) return;

                const peer = new SimplePeerClass({
                    initiator: false,
                    trickle: true,
                    stream,
                });

                pc = { peer, stream: null, videoEl: null };
                peersRef.current.set(data.from, pc);

                peer.on('signal', (signal: any) => {
                    socket.emit('signal', { to: data.from, signal });
                });

                peer.on('stream', (remoteStream: MediaStream) => {
                    setPeerStreams(prev => {
                        const next = new Map(prev);
                        next.set(data.from, remoteStream);
                        return next;
                    });
                });

                peer.on('close', () => {
                    peersRef.current.delete(data.from);
                    setPeerStreams(prev => {
                        const next = new Map(prev);
                        next.delete(data.from);
                        return next;
                    });
                });

                peer.on('error', (err: any) => {
                    console.warn('[Gather] Peer error with', data.from, err.message);
                    peer.destroy();
                    peersRef.current.delete(data.from);
                });
            }

            // Apply the signal
            try {
                pc.peer.signal(data.signal);
            } catch (e) {
                console.warn('[Gather] Signal error:', e);
            }
        };

        socket.on('signal', handleSignal);
        return () => {
            socket.off('signal', handleSignal);
        };
    }, [socket, initLocalStream]);

    // Manage peer connections based on proximity
    useEffect(() => {
        if (!socket || !SimplePeerClass) return;

        const nearbyIds = new Set(nearbyPlayers.map(p => p.id));

        // Create connections for newly nearby players
        nearbyPlayers.forEach(async ({ id }) => {
            if (peersRef.current.has(id)) return;

            // Deterministic initiator: lower socket ID initiates
            const shouldInitiate = socket.id < id;
            if (!shouldInitiate) return; // Wait for the other side to initiate

            const stream = await initLocalStream();
            if (!stream) return;

            const peer = new SimplePeerClass({
                initiator: true,
                trickle: true,
                stream,
            });

            const pc: PeerConnection = { peer, stream: null, videoEl: null };
            peersRef.current.set(id, pc);

            peer.on('signal', (signal: any) => {
                socket.emit('signal', { to: id, signal });
            });

            peer.on('stream', (remoteStream: MediaStream) => {
                setPeerStreams(prev => {
                    const next = new Map(prev);
                    next.set(id, remoteStream);
                    return next;
                });
            });

            peer.on('close', () => {
                peersRef.current.delete(id);
                setPeerStreams(prev => {
                    const next = new Map(prev);
                    next.delete(id);
                    return next;
                });
            });

            peer.on('error', (err: any) => {
                console.warn('[Gather] Peer error:', err.message);
                peer.destroy();
                peersRef.current.delete(id);
            });
        });

        // Destroy connections for players no longer nearby
        peersRef.current.forEach((pc, id) => {
            if (!nearbyIds.has(id)) {
                pc.peer.destroy();
                peersRef.current.delete(id);
                setPeerStreams(prev => {
                    const next = new Map(prev);
                    next.delete(id);
                    return next;
                });
            }
        });
    }, [nearbyPlayers, socket, initLocalStream]);

    // Set local video
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            peersRef.current.forEach(pc => pc.peer.destroy());
            peersRef.current.clear();
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    const hasConnections = peerStreams.size > 0 || localStream;

    if (!hasConnections) return null;

    return (
        <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2 items-end">
            {/* Remote streams */}
            {Array.from(peerStreams.entries()).map(([id, stream]) => (
                <VideoPanel key={id} stream={stream} label={id.slice(0, 6)} />
            ))}

            {/* Local preview */}
            {localStream && (
                <div className="relative">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-32 h-24 rounded-xl object-cover border-2 border-indigo-400/50 shadow-lg"
                    />
                    <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded-md">
                        You
                    </span>
                </div>
            )}
        </div>
    );
};

// ── Video Panel for remote streams ─────────────────────────────────────────
const VideoPanel: React.FC<{ stream: MediaStream; label: string }> = ({ stream, label }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="relative">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-40 h-30 rounded-xl object-cover border-2 border-emerald-400/50 shadow-lg"
            />
            <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded-md">
                {label}
            </span>
        </div>
    );
};

export default ProximityVideo;
