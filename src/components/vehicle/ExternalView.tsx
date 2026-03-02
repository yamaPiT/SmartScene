"use client";

import { useVehicleStore } from "@/lib/store";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { ArrowUp, User } from "lucide-react";

export const ExternalView = () => {
    // -------------------------------------------------------------
    // 【Store (状態管理) からのデータ取得】
    // useVehicleStore フックを用いて、必要な車両ステータスを単一方向データフローで取得します。
    // 値が更新されると、このコンポーネントがリアクティブに再描画されます。
    // -------------------------------------------------------------
    const rainLevel = useVehicleStore(s => s["Vehicle.Exterior.Air.RainIntensity"]); // 雨量 (0-100)
    const wiperMode = useVehicleStore(s => s["Vehicle.Body.Windshield.Wiper.Mode"]); // ワイパーモード
    const laneChangeStatus = useVehicleStore(s => s["Internal.LaneChangeStatus"]); // 車線変更の進行状態

    const isFrontDefrosterActive = useVehicleStore(s => s["Vehicle.Cabin.HVAC.IsFrontDefrosterActive"]);
    const isRearDefrosterActive = useVehicleStore(s => s["Vehicle.Cabin.HVAC.IsRearDefrosterActive"]);
    const fanSpeed = useVehicleStore(s => s["Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed"]); // ファン速度

    // パッシング/ハザードなど灯火類の状態と、完全同期のためのBlinkerTick（500ms周期のシステム時計）
    const hazard = useVehicleStore(s => s["Vehicle.Body.Lights.Hazard.IsSignaling"]);
    const leftSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling"]);
    const rightSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling"]);
    const blinkerTick = useVehicleStore(s => s["Internal.BlinkerTick"]);

    // 各窓の現在の開度（物理的にアニメーション中の現在位置）
    const wFL = useVehicleStore(s => s["Vehicle.Cabin.Door.Row1.Left.Window.Position"]);
    const wFR = useVehicleStore(s => s["Vehicle.Cabin.Door.Row1.Right.Window.Position"]);
    const wRL = useVehicleStore(s => s["Vehicle.Cabin.Door.Row2.Left.Window.Position"]);
    const wRR = useVehicleStore(s => s["Vehicle.Cabin.Door.Row2.Right.Window.Position"]);

    // ファン（エアコン）の設定に応じたプロペラのアニメーション速度（CSS animation-duration）を算出します
    const getFanAnimationDuration = () => {
        switch (fanSpeed) {
            case 'LO': return '3s'; // ゆっくり
            case 'MED': return '1s'; // 中くらい
            case 'HI': return '0.3s'; // 速い
            case 'AUTO': return '1s';
            case 'OFF':
            default: return '0s'; // 停止
        }
    };

    // -------------------------------------------------------------
    // 【ワイパーの物理アニメーション制御 (React Local State)】
    // -------------------------------------------------------------
    // wiperAngle: 90 = 水平位置（停止）, 0 = 垂直位置（直立）
    const [wiperAngle, setWiperAngle] = useState(90);

    // useEffect は、設定されている依存配列（wiperMode, rainLevel）が変化した時に自動実行される副作用フックです。
    useEffect(() => {
        // ワイパーがOFFの場合は、即座に水平(90度)に戻して処理を終了します。
        if (wiperMode === 'OFF') {
            setWiperAngle(90);
            return;
        }

        let speed = 0;
        switch (wiperMode) {
            case 'INT': speed = 2000; break;     // 2秒間隔
            case 'LO': speed = 1000; break;      // 1秒間隔
            case 'HI': speed = 500; break;       // 0.5秒間隔
            case 'AUTO': speed = rainLevel > 0 ? Math.max(500, 2000 - rainLevel * 15) : 0; break; // 雨量に応じて無段階で速度変化
        }

        if (speed === 0) {
            setWiperAngle(90);
            return;
        }

        // setInterval を使って定期的にワイパーの角度を変化させます（擬似的な物理ループ）
        const interval = setInterval(() => {
            setWiperAngle(0); // 一旦 0度(上) まで振り上げる
            setTimeout(() => setWiperAngle(90), 300); // 0.3秒後に 90度(下) まで下ろす
        }, speed);

        // クリーンアップ関数: モード変更時やコンポーネント破棄時に古いインターバルを取り消します。
        return () => clearInterval(interval);
    }, [wiperMode, rainLevel]);

    // ウインカー/ハザードが点灯すべきかどうかの論理積
    // システムの時計（BlinkerTick）と同期させているため、左右が必ず同じタイミングで点滅します。
    const isLeftBlinking = (leftSig || hazard) && blinkerTick;
    const isRightBlinking = (rightSig || hazard) && blinkerTick;

    return (
        <div className="w-full h-full min-h-[400px] bg-slate-800 relative overflow-hidden rounded-xl border border-gray-700 shadow-inner flex flex-col items-center justify-center p-4">
            <div className="absolute inset-0 bg-gradient-to-b from-sky-900 to-slate-900 opacity-50" />

            {/* ======== 雨天エフェクト描画 ======== */}
            {/* 雨量(rainLevel)に応じて、画面に重ねる雨レイヤーの枚数（密度）を動的に生成します。 */}
            {rainLevel > 0 && Array.from({ length: Math.max(1, Math.ceil(rainLevel / 20)) }).map((_, i) => (
                <div
                    key={i}
                    className="absolute inset-0 pointer-events-none z-10 animate-rain"
                    style={{
                        // data URIを使ってSVGを背景画像として設定（太さを一定に保つ）
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round' opacity='1'%3E%3Cpath d='M10 0 L5 15'/%3E%3Cpath d='M30 20 L25 35'/%3E%3C/g%3E%3C/svg%3E")`,
                        backgroundSize: '40px 40px', // 雨粒のサイズを絶対固定
                        backgroundPosition: `${i * 15}px ${i * 25}px`, // レイヤーごとに位置をズラして自然な密度を作る
                        opacity: 0.4 + (rainLevel / 100) * 0.4, // 雨が強いほど全体を白く霞ませる
                        animationDelay: `${i * -0.15}s`, // 落下タイミングをズラす
                        filter: "drop-shadow(0px 0px 2px rgba(255,255,255,0.8))"
                    }}
                />
            ))}

            {/* ======== クルマ本体のイラスト ======== */}
            <div className="relative w-[90%] max-w-[600px] aspect-[16/9] bg-gray-900 rounded-t-[60px] border-4 border-gray-600 flex flex-col items-center shadow-2xl overflow-hidden mt-8">

                {/* --- フロントガラスエリア --- */}
                <div className="w-full h-[65%] bg-gray-800 relative flex justify-center overflow-hidden">

                    {/* リアウィンドウ（透過） & デフォッガ熱線 */}
                    <div className="absolute top-4 w-[60%] h-[40%] bg-sky-900/20 rounded-t-[30px] border-t-2 border-x-2 border-gray-600 flex flex-col justify-evenly px-6 py-2">
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className={clsx(
                                    "w-full h-[2px] rounded-full",
                                    // isRearDefrosterActiveがONなら赤く発熱ループ(animate-pulse)、OFFなら薄暗い灰色
                                    isRearDefrosterActive ? "bg-red-500 shadow-[0_0_8px_red] opacity-100 animate-pulse" : "bg-gray-400 opacity-20"
                                )}
                            />
                        ))}
                    </div>

                    {/* ドライバーのシルエット */}
                    <div className="absolute top-10 left-[22%] z-0 flex flex-col items-center transform scale-110">
                        <div className="w-16 h-16 bg-gray-300 rounded-full mb-[-5px] shadow-lg" />
                        <div className="w-24 h-12 bg-gray-300 rounded-t-xl" />
                        <div className="absolute top-10 w-28 h-28 border-4 border-white rounded-full opacity-80" />
                    </div>

                    {/* フロントガラス本体 */}
                    <div className="absolute top-2 w-[92%] h-[90%] bg-blue-900/30 rounded-t-[45px] border border-blue-500/20 backdrop-blur-[1px] relative overflow-hidden z-10">

                        {/* フロントデフロスタの温風表示 */}
                        {isFrontDefrosterActive && (
                            <div className="absolute inset-0 flex justify-center items-end pb-4 gap-12 opacity-80 animate-pulse pointer-events-none">
                                <ArrowUp size={48} className="text-red-500 stroke-[5px]" />
                                <ArrowUp size={48} className="text-red-500 stroke-[5px]" />
                                <ArrowUp size={48} className="text-red-500 stroke-[5px]" />
                            </div>
                        )}

                        {/* --- ワイパーの描画 --- */}
                        {/* 
                           UI幾何学ルールの遵守：
                           ワイパーのアーム要素自身の origin-bottom (下端) を中心としてCSS変数 wiperAngle に応じて回転させます。
                           その際、軸となる白い丸の中心とズレないよう、left や bottom のピクセル座標を厳密に計算配置しています。
                        */}
                        <div className="absolute bottom-2 left-[15%] pointer-events-none z-20">
                            {/* 回転軸となる白い丸 */}
                            <div className="absolute w-5 h-5 bg-white rounded-full shadow-md border-2 border-gray-300 -left-2.5 -bottom-2.5 z-20" />
                            {/* ワイパーアーム本体 */}
                            <div
                                className="absolute w-2 h-[160px] bg-white border border-gray-400 origin-bottom transition-transform duration-300 ease-in-out shadow-lg z-10"
                                style={{ left: '-4px', bottom: '0px', transform: `rotate(${wiperAngle}deg)` }}
                            />
                        </div>
                        <div className="absolute bottom-2 left-[55%] pointer-events-none z-20">
                            <div className="absolute w-5 h-5 bg-white rounded-full shadow-md border-2 border-gray-300 -left-2.5 -bottom-2.5 z-20" />
                            <div
                                className="absolute w-2 h-[160px] bg-white border border-gray-400 origin-bottom transition-transform duration-300 ease-in-out shadow-lg z-10"
                                style={{ left: '-4px', bottom: '0px', transform: `rotate(${wiperAngle}deg)` }}
                            />
                        </div>
                    </div>
                </div>

                {/* --- フロントバンパー＆ヘッドライトエリア --- */}
                <div className="w-full h-[35%] bg-gray-900 flex px-2 items-center relative z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
                    {/* Left Light */}
                    <div className="flex flex-col gap-1 shrink-0 w-16">
                        <div className="w-full h-8 bg-white rounded-t-xl rounded-bl-xl shadow-[0_0_15px_rgba(255,255,255,0.6)] border-2 border-gray-400" />
                        <div
                            className={clsx(
                                "w-full h-6 bg-amber-500 rounded-b-md border-2 border-amber-700 transition-all duration-75",
                                isLeftBlinking ? "brightness-150 shadow-[0_0_20px_orange] opacity-100" : "opacity-30"
                            )}
                        />
                    </div>

                    {/* Grille & Logo */}
                    <div className="flex-1 h-full mx-1 flex justify-center items-center relative">
                        <div className="w-full h-[80%] bg-gray-800 bg-[linear-gradient(180deg,#1f2937_50%,#000_50%)] bg-[length:100%_8px] border-y-4 border-gray-700 rounded-sm" />
                        <div className="absolute inset-0 flex items-center justify-center gap-8">
                            {/* Left Propeller */}
                            <svg width="32" height="32" viewBox="0 0 24 24" className={clsx("text-white opacity-80", fanSpeed !== 'OFF' && "animate-spin")} style={{ animationDuration: getFanAnimationDuration() }}>
                                <path fill="currentColor" d="M12 2L15 8H9L12 2ZM12 22L9 16H15L12 22ZM2 12L8 9V15L2 12ZM22 12L16 15V9L22 12ZM12 12M12 12" />
                            </svg>
                            <div className="bg-gradient-to-br from-blue-900 to-black px-4 py-1 border-2 border-slate-300 shadow-xl rounded-lg z-10">
                                <span className="text-lg font-black text-white tracking-widest" style={{ textShadow: "0 2px 4px black" }}>NCES</span>
                            </div>
                            {/* Right Propeller */}
                            <svg width="32" height="32" viewBox="0 0 24 24" className={clsx("text-white opacity-80", fanSpeed !== 'OFF' && "animate-spin")} style={{ animationDuration: getFanAnimationDuration() }}>
                                <path fill="currentColor" d="M12 2L15 8H9L12 2ZM12 22L9 16H15L12 22ZM2 12L8 9V15L2 12ZM22 12L16 15V9L22 12ZM12 12M12 12" />
                            </svg>
                        </div>
                    </div>

                    {/* Right Light */}
                    <div className="flex flex-col gap-1 shrink-0 w-16">
                        <div className="w-full h-8 bg-white rounded-t-xl rounded-br-xl shadow-[0_0_15px_rgba(255,255,255,0.6)] border-2 border-gray-400" />
                        <div
                            className={clsx(
                                "w-full h-6 bg-amber-500 rounded-b-md border-2 border-amber-700 transition-all duration-75",
                                isRightBlinking ? "brightness-150 shadow-[0_0_20px_orange] opacity-100" : "opacity-30"
                            )}
                        />
                    </div>
                </div>

            </div>

            {/* Window Info Overlays and Text Indicators at Bottom */}
            <div className="mt-8 flex justify-between items-center w-[90%] max-w-[600px] h-16 relative z-20">
                {/* Left Window */}
                <div className="text-[10px] sm:text-xs font-mono text-gray-400 bg-black p-2 rounded border-l-2 border-blue-500 shrink-0 shadow-[0_0_15px_black]">
                    <div className="font-bold text-blue-400 mb-1">Left Window Open</div>
                    <div className="flex flex-col sm:flex-row sm:gap-3">
                        <span>Front: {Math.floor(wFL)}%</span>
                        <span>Rear: {Math.floor(wRL)}%</span>
                    </div>
                </div>

                {/* Text Indicators */}
                <div className="flex-1 flex flex-col items-center justify-center gap-1 overflow-hidden px-2 z-20">
                    {hazard ? (
                        <div className="text-pink-400 font-bold text-xs sm:text-base tracking-widest uppercase animate-bounce drop-shadow-[0_0_10px_pink] text-center bg-black px-4 py-1 rounded-full shadow-[0_0_10px_black]">
                            ♥THANKYU♥
                        </div>
                    ) : (leftSig || rightSig) ? (
                        <div className="text-amber-400 font-black text-sm sm:text-xl tracking-widest uppercase animate-pulse drop-shadow-[0_0_10px_orange] text-center bg-black px-4 py-1 rounded-full shadow-[0_0_10px_black]">
                            LANE CHANGE
                        </div>
                    ) : null}
                </div>

                {/* Right Window */}
                <div className="text-[10px] sm:text-xs font-mono text-gray-400 bg-black p-2 rounded border-r-2 border-blue-500 text-right shrink-0 shadow-[0_0_15px_black]">
                    <div className="font-bold text-blue-400 mb-1">Right Window Open</div>
                    <div className="flex flex-col sm:flex-row sm:gap-3 justify-end">
                        <span>Front: {Math.floor(wFR)}%</span>
                        <span>Rear: {Math.floor(wRR)}%</span>
                    </div>
                </div>
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
