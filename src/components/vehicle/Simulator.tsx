"use client";

import { useEffect, useRef, useCallback } from "react";
import { useVehicleStore } from "@/lib/store";
import { Dashboard } from "./Dashboard";
import { ExternalView } from "./ExternalView";
import { ControlPanel } from "./ControlPanel";

// Audio Hook (Internal)
const useClickSound = () => {
    const audioContextRef = useRef<AudioContext | null>(null);

    const playClick = useCallback(() => {
        if (!audioContextRef.current) {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (Ctx) audioContextRef.current = new Ctx();
        }

        const ctx = audioContextRef.current;
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => { });
        }

        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            // Sound Design: Crisper "Tick" for 90bpm
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.03);

            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.03);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.03);
        } catch (e) {
            console.warn("Audio play failed", e);
        }
    }, []);

    return playClick;
};

export const Simulator = () => {
    const playClick = useClickSound();
    const wasSignalingRef = useRef(false);

    // Tick accumulator for precise timing
    const tickAccumulator = useRef(0);

    const prevRainLevelRef = useRef(0);

    // ========================================================================
    // Physics Loop (100ms)
    // ========================================================================
    useEffect(() => {
        const interval = setInterval(() => {
            const state = useVehicleStore.getState();
            const laneChangeStatus = state["Internal.LaneChangeStatus"];
            const laneChangeStartTime = state["Internal.LaneChangeStartTime"];

            const left = state["Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling"];
            const right = state["Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling"];
            const hazard = state["Vehicle.Body.Lights.Hazard.IsSignaling"];
            const isSignaling = left || right || hazard;

            const updates: Partial<any> = {};

            // Logic 1: Removed (Turn Signal Auto-Off logic deleted per Phase 5 SW205 requirement)

            // Logic 2: Audio Tick (90 bpm ~= 666ms interval)
            if (isSignaling) {
                if (!wasSignalingRef.current) {
                    playClick();
                    tickAccumulator.current = 0;
                } else {
                    tickAccumulator.current += 100;
                    if (tickAccumulator.current >= 666) {
                        playClick();
                        tickAccumulator.current -= 666;
                    }
                }
                wasSignalingRef.current = true;
            } else {
                wasSignalingRef.current = false;
                tickAccumulator.current = 0;
            }

            // Logic 3: Removed (Moved to store.ts to avoid race condition with ScenarioRunner)

            // Logic 3.5: Blinker Sync Tick (500ms toggle for purely synchronized UI blinking)
            // tickAccumulator increments by 100ms each loop.
            const blinkerTickPhase = Math.floor(tickAccumulator.current / 500) % 2 === 0;
            if (state["Internal.BlinkerTick"] !== blinkerTickPhase) {
                updates["Internal.BlinkerTick"] = blinkerTickPhase;
            }

            // Logic 4: Window Physics (3.33% per 100ms = ~3000ms full open/close)
            const getNewPos = (pos: number, target: number) => {
                const diff = target - pos;
                if (Math.abs(diff) <= 3.4) return target;
                return pos + Math.sign(diff) * 3.333;
            };

            const windows = [
                { id: 'FL', key: "Vehicle.Cabin.Door.Row1.Left.Window.Position" as const },
                { id: 'FR', key: "Vehicle.Cabin.Door.Row1.Right.Window.Position" as const },
                { id: 'RL', key: "Vehicle.Cabin.Door.Row2.Left.Window.Position" as const },
                { id: 'RR', key: "Vehicle.Cabin.Door.Row2.Right.Window.Position" as const },
            ];

            const targets = state["Internal.WindowTarget"] || {};

            windows.forEach(w => {
                const currentPos = state[w.key];

                if (targets[w.id] !== undefined) {
                    // Strictly follow the WindowTarget, whether set by manual button or scenario
                    const nextPos = getNewPos(currentPos, targets[w.id]);
                    if (nextPos !== currentPos) {
                        updates[w.key] = nextPos;
                    } else {
                        // Once reached, we could optionally clear the target to stop calculations, 
                        // but leaving it is fine as getNewPos will return currentPos.
                    }
                }
            });

            if (Object.keys(updates).length > 0) {
                state.updateState(updates);
            }

        }, 100);

        return () => clearInterval(interval);
    }, [playClick]);

    return (
        <div className="flex flex-col gap-6 w-full h-full">
            {/* Upper Section: Split vertically actually? User wants Car Picture under Sub-window. */}
            {/* Let's stack them within the left grid cell. */}
            <div className="flex flex-col gap-4">
                {/* 1. Dashboard (Speed/Temp) - Make it more compact height-wise? */}
                <Dashboard />

                {/* 2. External View (Car) - Make it BIG */}
                <div className="flex-1 min-h-[400px]">
                    <ExternalView />
                </div>
            </div>

            {/* Lower Section: Controls */}
            <ControlPanel />
        </div>
    );
};
