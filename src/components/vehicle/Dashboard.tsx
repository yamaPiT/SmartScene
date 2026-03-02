"use client";

import { useVehicleStore } from "@/lib/store";
import { MoveLeft, MoveRight, Fan, Thermometer } from "lucide-react";
import clsx from "clsx";

export const Dashboard = () => {
    const speed = useVehicleStore(s => s["Vehicle.Speed"]);
    // Lights VSS
    const hazard = useVehicleStore(s => s["Vehicle.Body.Lights.Hazard.IsSignaling"]);
    const leftSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling"]);
    const rightSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling"]);

    const temp = useVehicleStore(s => s["Vehicle.Cabin.HVAC.AmbientAirTemperature"]);
    const fanSpeed = useVehicleStore(s => s["Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed"]);

    // Dashboard logic: Indicators blink if Hazard OR specific signal is ON
    const isLeftOn = leftSig || hazard;
    const isRightOn = rightSig || hazard;

    return (
        <div className="bg-black border-4 border-gray-800 rounded-3xl p-6 w-full max-w-2xl mx-auto shadow-[0_0_20px_rgba(0,0,0,0.8)] relative overflow-hidden">
            {/* Glossy Overlay */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-gray-800/10 to-transparent pointer-events-none" />

            {/* Main Cluster */}
            <div className="flex justify-between items-center text-cyan-400">

                {/* Left Indicator */}
                <div className={clsx(
                    "transition-opacity duration-300",
                    isLeftOn ? "opacity-100 animate-pulse text-green-500" : "opacity-10 text-gray-700"
                )}>
                    <MoveLeft size={48} fill="currentColor" />
                </div>

                {/* Center Speedometer */}
                <div className="flex flex-col items-center justify-center">
                    <span className="text-6xl font-black tracking-tighter" style={{ textShadow: "0 0 10px cyan" }}>
                        {Math.floor(speed)}
                    </span>
                    <span className="text-xl font-bold text-gray-500 mt-[-5px]">km/h</span>
                </div>

                {/* Right Indicator */}
                <div className={clsx(
                    "transition-opacity duration-300",
                    isRightOn ? "opacity-100 animate-pulse text-green-500" : "opacity-10 text-gray-700"
                )}>
                    <MoveRight size={48} fill="currentColor" />
                </div>
            </div>

            {/* Info Bar */}
            <div className="mt-8 flex justify-center gap-8 text-sm font-mono text-cyan-200/70 border-t border-gray-800 pt-4">
                <div className="flex items-center gap-2">
                    <Thermometer size={14} />
                    <span>{temp.toFixed(1)}°C</span>
                </div>
                <div className="flex items-center gap-2">
                    <Fan size={14} />
                    <span>{fanSpeed}</span>
                </div>
            </div>
        </div>
    );
};
