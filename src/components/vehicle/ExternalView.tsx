"use client";

import { useVehicleStore } from "@/lib/store";
import clsx from "clsx";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Environment, MeshReflectorMaterial } from "@react-three/drei";
import { CarModel3D } from "./CarModel3D";
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ----------------------------------------------------------------------------------
// 水たまりの波紋 (Ripple) エフェクトコンポーネント
// ----------------------------------------------------------------------------------
const RippleEffect = ({ index, rainLevel }: { index: number, rainLevel: number }) => {
    const ringRef = useRef<THREE.Mesh>(null);
    const matRef = useRef<THREE.MeshBasicMaterial>(null);

    // 完全なランダムで開始位置と時間を設定
    const originX = (Math.random() - 0.5) * 15;
    const originZ = (Math.random() - 0.5) * 15;
    const speed = 1.0 + Math.random();
    const delay = Math.random() * 2;

    useFrame(({ clock }) => {
        if (!ringRef.current || !matRef.current) return;
        const time = (clock.elapsedTime * speed + delay) % 1.0; // 0.0〜1.0 のループ

        // 広がりながら消えていくアニメーション
        const scale = time * 2.0;
        ringRef.current.scale.set(scale, scale, 1);
        matRef.current.opacity = (1.0 - time) * 0.4 * (rainLevel / 100);
    });

    return (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[originX, -0.34, originZ]}>
            <ringGeometry args={[0.3, 0.35, 32]} />
            <meshBasicMaterial ref={matRef} color="#ffffff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
    );
};

export const ExternalView = () => {
    // -------------------------------------------------------------
    // 【Store (状態管理) からのデータ取得】
    // -------------------------------------------------------------
    const rainLevel = useVehicleStore(s => s["Vehicle.Exterior.Air.RainIntensity"]); // 雨量 (0-100)

    // デフロスタ（前・後）の状態
    const isFrontDefrosterActive = useVehicleStore(s => s["Vehicle.Cabin.HVAC.IsFrontDefrosterActive"]);
    const isRearDefrosterActive = useVehicleStore(s => s["Vehicle.Cabin.HVAC.IsRearDefrosterActive"]);

    return (
        <div className="w-full h-full min-h-[400px] bg-slate-100 relative overflow-hidden rounded-xl border border-gray-300 shadow-inner flex flex-col items-center justify-center p-4">
            {/* 非常に明るい空風の背景 */}
            <div className="absolute inset-0 bg-gradient-to-b from-sky-300 to-indigo-100 opacity-80 z-0" />

            {/* ======== 雨天エフェクト描画 ======== */}
            {/* 降雨密度を大幅に下げて視認性を高める (maxを少数に制限し、透明度を薄くする) */}
            {rainLevel > 0 && Array.from({ length: Math.max(1, Math.ceil(rainLevel / 40)) }).map((_, i) => (
                <div
                    key={i}
                    className="absolute inset-0 pointer-events-none z-30 animate-rain"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round' opacity='1'%3E%3Cpath d='M10 0 L5 15'/%3E%3Cpath d='M30 20 L25 35'/%3E%3C/g%3E%3C/svg%3E")`,
                        backgroundSize: '40px 40px',
                        backgroundPosition: `${i * 15}px ${i * 25}px`,
                        opacity: 0.15 + (rainLevel / 100) * 0.2, // 透明度を下げて控えめに
                        animationDelay: `${i * -0.15}s`,
                    }}
                />
            ))}

            {/* ======== 3D Canvas エリア ======== */}
            <div className="relative w-full flex-1 min-h-[300px] mt-2 mb-2 z-20 rounded-xl overflow-hidden border-2 border-slate-300 bg-white shadow-2xl">
                <Canvas shadows>
                    {/* カメラを近づけて車体を大きく表示 */}
                    <PerspectiveCamera makeDefault position={[-4.5, 2.5, 5]} fov={45} />
                    <OrbitControls
                        enablePan={false}
                        minDistance={3}
                        maxDistance={15}
                        maxPolarAngle={Math.PI / 2 - 0.05} // 地面より下に潜らないように制限
                    />

                    {/* --- 照明設定（極めて明るく） --- */}
                    <ambientLight intensity={1.5} />
                    <Environment preset="city" /> {/* 車体にリアルな環境光の反射を追加 */}
                    <directionalLight
                        castShadow
                        position={[10, 15, 10]}
                        intensity={2.0}
                        shadow-mapSize-width={2048}
                        shadow-mapSize-height={2048}
                    />

                    {/* --- 車両モデル --- */}
                    <CarModel3D
                        isFrontDefrosterActive={isFrontDefrosterActive}
                        isRearDefrosterActive={isRearDefrosterActive}
                    />

                    {/* --- 地面（パーキング風アスファルト＆水たまり） --- */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
                        <planeGeometry args={[100, 100]} />
                        {/* 雨量に応じて地面の反射（水たまり）を直感的に変化させる */}
                        {rainLevel > 0 ? (
                            <MeshReflectorMaterial
                                blur={[300, 100]}
                                resolution={1024}
                                mixBlur={1}
                                mixStrength={0.5 + (rainLevel / 100 * 2.5)} // 雨量が多いほど水たまりの反射が強くなる
                                roughness={0.9 - (rainLevel / 100 * 0.7)} // 濡れるほど表面がツルツルに（反射が鮮明に）なる
                                depthScale={1.2}
                                minDepthThreshold={0.4}
                                maxDepthThreshold={1.4}
                                color="#8a9ea8"
                                metalness={0.5}
                                mirror={0.6}
                            />
                        ) : (
                            <meshStandardMaterial color="#b0bec5" roughness={0.9} />
                        )}
                    </mesh>

                    {/* --- 水たまりの波紋エフェクト --- */}
                    {rainLevel > 0 && Array.from({ length: Math.ceil(rainLevel / 10) }).map((_, i) => (
                        <RippleEffect key={`ripple-${i}`} index={i} rainLevel={rainLevel} />
                    ))}
                </Canvas>
            </div>

            <style jsx global>{`
                @keyframes fall {
                    from { background-position: 0 0; }
                    to { background-position: -20px 40px; }
                }
                .animate-rain {
                    animation: fall 0.3s linear infinite;
                }
            `}</style>
        </div>
    );
};
