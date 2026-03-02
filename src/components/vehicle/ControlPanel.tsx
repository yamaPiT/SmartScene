"use client";

import { useVehicleStore } from "@/lib/store";
import {
    CloudRain,
    Wind,
    Thermometer,
    ArrowUp,
    ArrowDown,
    MoveLeft,
    MoveRight,
    Triangle,
    Zap,
    Car,
    Power
} from "lucide-react";
import clsx from "clsx";

export const ControlPanel = () => {
    // -------------------------------------------------------------
    // 【Store (状態管理) からのデータ取得】
    // -------------------------------------------------------------
    // 車両の全状態を管理するStore（データベースのようなもの）から、更新用関数(setVss)を取得します。
    const { setVss } = useVehicleStore();

    // =========
    // VSSセレクタ (状態の「購読」)
    // =========
    // 以下は useVehicleStore というカスタムフックを使い、必要なデータをピンポイントで「購読」しています。
    // 値が変わるたびに、このコンポーネント(画面)が自動的に再描画（Re-render）されて最新情報を反映します。

    // 基本環境ステータス
    const ignition = useVehicleStore(s => s["Vehicle.IgnitionState"]); // エンジンの状態 (START/STOP)
    const rainLevel = useVehicleStore(s => s["Vehicle.Exterior.Air.RainIntensity"]); // 外の雨量 (0〜100%)
    const speed = useVehicleStore(s => s["Vehicle.Speed"]); // 車速 (km/h)
    const rearDistance = useVehicleStore(s => s["Vehicle.ADAS.ObstacleDetection.Rear.Distance"]); // 後方車両との距離 (m)
    const temp = useVehicleStore(s => s["Vehicle.Cabin.HVAC.AmbientAirTemperature"]); // エアコンの設定温度
    const fanSpeed = useVehicleStore(s => s["Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed"]); // エアコンの風量 (OFF/LO/MED/HI/AUTO)

    // デフロスタ（フロントの曇り止め：温風）とデフォッガ（リアの曇り止め：電熱線）
    const frontDef = useVehicleStore(s => s["Vehicle.Cabin.HVAC.IsFrontDefrosterActive"]);
    const rearDef = useVehicleStore(s => s["Vehicle.Cabin.HVAC.IsRearDefrosterActive"]);

    // 灯火類（ハザード・ウインカー）の状態
    const hazard = useVehicleStore(s => s["Vehicle.Body.Lights.Hazard.IsSignaling"]);
    const leftSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling"]);
    const rightSig = useVehicleStore(s => s["Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling"]);

    // ワイパーの動作モード (OFF/INT/LO/HI/AUTO)
    const wiperMode = useVehicleStore(s => s["Vehicle.Body.Windshield.Wiper.Mode"]);

    // -------------------------------------------------------------
    // 【各種コントロールのヘルパー関数群】
    // このセクションでは、ボタンが押された時の「振る舞い（ビジネスロジック）」を定義しています
    // -------------------------------------------------------------

    const handleWindowPress = (target: string, action: 'OPEN' | 'CLOSE') => {
        const state = useVehicleStore.getState();
        const updates: any = {};
        const targets = { ...state["Internal.WindowTarget"] };

        if (state["Vehicle.IgnitionState"] === 'START') {
            const flags = { ...state["Internal.ManualOverrideFlags"] };
            if (target === 'ALL') {
                ['FL', 'FR', 'RL', 'RR'].forEach(pos => {
                    targets[pos] = action === 'OPEN' ? 100 : 0;
                    flags[`Vehicle.Cabin.Door.Row${pos.startsWith('F') ? '1' : '2'}.${pos.endsWith('L') ? 'Left' : 'Right'}.Window.Position`] = true;
                });
            } else {
                targets[target] = action === 'OPEN' ? 100 : 0;
                const row = target.startsWith('F') ? 'Row1' : 'Row2';
                const side = target.endsWith('L') ? 'Left' : 'Right';
                flags[`Vehicle.Cabin.Door.${row}.${side}.Window.Position`] = true;
            }
            updates["Internal.ManualOverrideFlags"] = flags;
        }

        updates["Internal.WindowTarget"] = targets;
        state.updateState(updates);
    };

    const handleWindowRelease = (target: string) => {
        const state = useVehicleStore.getState();
        const updates: any = {};
        const targets = { ...state["Internal.WindowTarget"] };
        const memory = { ...(state["Internal.UserMemoryState"] || {}) } as any;

        const processRelease = (posKey: string, vssKey: keyof typeof state) => {
            // ALWAYS STOP exactly where it is on release (Press and Hold)
            const currentPos = state[vssKey] as number;
            targets[posKey] = currentPos;

            // Update user memory to remember this stop point
            if (state["Vehicle.IgnitionState"] === 'START') {
                memory[vssKey as string] = currentPos;
            }
        };

        if (target === 'ALL') {
            processRelease('FL', "Vehicle.Cabin.Door.Row1.Left.Window.Position");
            processRelease('FR', "Vehicle.Cabin.Door.Row1.Right.Window.Position");
            processRelease('RL', "Vehicle.Cabin.Door.Row2.Left.Window.Position");
            processRelease('RR', "Vehicle.Cabin.Door.Row2.Right.Window.Position");
        } else {
            const row = target.startsWith('F') ? 'Row1' : 'Row2';
            const side = target.endsWith('L') ? 'Left' : 'Right';
            processRelease(target, `Vehicle.Cabin.Door.${row}.${side}.Window.Position` as any);
        }

        updates["Internal.WindowTarget"] = targets;
        updates["Internal.UserMemoryState"] = memory;
        state.updateState(updates);
    };

    const handleWindowAllClick = (action: 'OPEN' | 'CLOSE') => {
        const state = useVehicleStore.getState();
        const updates: any = {};
        const targets = { ...state["Internal.WindowTarget"] };
        const memory = { ...(state["Internal.UserMemoryState"] || {}) } as any;
        const targetValue = action === 'OPEN' ? 100 : 0;

        ['FL', 'FR', 'RL', 'RR'].forEach(pos => {
            targets[pos] = targetValue;

            if (state["Vehicle.IgnitionState"] === 'START') {
                const row = pos.startsWith('F') ? 'Row1' : 'Row2';
                const side = pos.endsWith('L') ? 'Left' : 'Right';
                const vssKey = `Vehicle.Cabin.Door.${row}.${side}.Window.Position`;
                // Store the final destination in memory since it's a one-click to target
                memory[vssKey] = targetValue;
            }
        });

        if (state["Vehicle.IgnitionState"] === 'START') {
            const flags = { ...state["Internal.ManualOverrideFlags"] };
            flags["Vehicle.Cabin.Door.Row1.Left.Window.Position"] = true;
            flags["Vehicle.Cabin.Door.Row1.Right.Window.Position"] = true;
            flags["Vehicle.Cabin.Door.Row2.Left.Window.Position"] = true;
            flags["Vehicle.Cabin.Door.Row2.Right.Window.Position"] = true;
            updates["Internal.ManualOverrideFlags"] = flags;
            updates["Internal.UserMemoryState"] = memory;
        }

        updates["Internal.WindowTarget"] = targets;
        state.updateState(updates);
    };

    // ウインカー（方向指示器）ボタン操作時の処理です。
    const handleTurnSignal = (direction: 'LEFT' | 'RIGHT') => {
        const state = useVehicleStore.getState();
        const isLeft = direction === 'LEFT';

        // 1. ウインカーの純粋なトグル（ON / OFF 切り替え）制御
        // 実車のレバー操作のように、押すたびに点灯/消灯が切り替わります。
        if (isLeft) {
            // setVssを使って、現在の状態の逆（!leftSig）をセットします。これで点灯/消灯させます。
            setVss("Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling", !leftSig);

            // 【排他制御】左を点けたなら、右は確実に消去します（ハザード以外で両方付くことはありません）
            if (!leftSig) setVss("Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling", false);
        } else {
            setVss("Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling", !rightSig);
            if (!rightSig) setVss("Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling", false);
        }

        // 2. シナリオエンジン起動時（RUNNING）のみ機能する特別トリガー
        // 自動制御シナリオが動いている最中にウインカーを作動させると、「手動操作による車線変更（LANE CHANGE）」とみなし、
        // 「サンキューハザード」シナリオに必要な「車線変更開始時の後方との距離」を内部ステータスとして記録します。
        if (state.isScenarioRunning) {
            setVss("Internal.LaneChangeStatus", 'CHANGING'); // 車線変更のアニメーション発火
            setVss("Internal.LaneChangeStartRearDistance", rearDistance); // 当時の後続車との距離をスナップショット保存
        }
    };

    return (
        // -------------------------------------------------------------
        // 【UI表示 (Render) セクション】
        // -------------------------------------------------------------
        // 大枠のコンテナです。Tailwind CSSを使って画面サイズに応じたレスポンシブなグリッドレイアウトを組んでいます。
        // grid-cols-1（スマホは縦1列） -> md:grid-cols-2（タブレットは2列） -> lg:grid-cols-4（パソコンでは4列表示）
        <div className="bg-gray-900 border-t border-gray-800 p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-gray-200">

            {/* ======== SFR201: 環境・イグニッション制御セクション ======== */}
            <section className="space-y-4">

                {/* 
                  START/STOP ボタン：
                  フレックスボックスで左寄せ(justify-start)に配置されています。
                  クリックされると onClick が発火し、エンジンのON/OFF状態を切り替えます。
                  Tailwind の clsx を用い、ONの時は「赤い光るボタン」、OFFの時は「控えめなグレーのボタン」へと視覚的にデザインが切り替わります。
                */}
                <div className="flex justify-start items-center mb-4">
                    <button
                        onClick={() => setVss("Vehicle.IgnitionState", ignition === 'START' ? 'STOP' : 'START')}
                        className={clsx(
                            "w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border-2",
                            ignition === 'START'
                                ? "bg-red-600 border-red-400 text-white shadow-red-900/50"
                                : "bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:border-gray-500"
                        )}
                        title={ignition === 'START' ? 'STOP ENGINE' : 'START ENGINE'}
                    >
                        <Power size={20} />
                    </button>
                </div>
                <div className="space-y-2">
                    <label className="text-xs">Rain Level: {rainLevel}%</label>
                    <input
                        type="range"
                        min="0" max="100" step="10"
                        value={rainLevel}
                        onChange={(e) => setVss("Vehicle.Exterior.Air.RainIntensity", Number(e.target.value))}
                        className="w-full cursor-pointer accent-blue-500"
                    />
                </div>

                {/* Speed */}
                <div className="space-y-2">
                    <label className="text-xs">Speed: {speed} km/h</label>
                    <input
                        type="range"
                        min="0" max="180" step="5"
                        value={speed}
                        onChange={(e) => setVss("Vehicle.Speed", Number(e.target.value))}
                        className="w-full cursor-pointer accent-green-500"
                    />
                </div>

                {/* Rear Distance (New) */}
                <div className="space-y-2">
                    <label className="text-xs flex items-center gap-1"><Car size={12} /> Rear Dist: {rearDistance} m</label>
                    <input
                        type="range"
                        min="0" max="50" step="1"
                        value={rearDistance}
                        onChange={(e) => setVss("Vehicle.ADAS.ObstacleDetection.Rear.Distance", Number(e.target.value))}
                        className="w-full cursor-pointer accent-yellow-500"
                    />
                </div>
            </section>

            {/* ======== SFR202: 空調・ワイパー制御セクション ======== */}
            {/* 
              【イグニッション連動の操作ロック】
              車のエンジン(イグニッション)が STOP の場合は、このセクション全体に `opacity-30` (半透明化) と 
              `pointer-events-none` (マウスクリックなどの操作不能化) というCSSクラスが付与されます。
              これによって、「エンジン停止時はマニュアル操作を受け付けない」という仕様をUI側で物理的に強制しています。
            */}
            <section className={clsx("space-y-4 transition-opacity", ignition === 'STOP' && "opacity-30 pointer-events-none")}>

                {/* --- ワイパーのモード切替UI --- */}
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 12A10 10 0 0 0 2 12" />
                            <path d="M12 20V12" />
                            <path d="M12 12 5 15" />
                        </svg> WIPER
                    </h3>
                    <div className="flex gap-1">
                        {(['OFF', 'INT', 'LO', 'HI', 'AUTO'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setVss("Vehicle.Body.Windshield.Wiper.Mode", mode)}
                                className={clsx(
                                    "flex-1 text-[10px] py-2 rounded transition-colors font-bold",
                                    wiperMode === mode ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"
                                )}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2 pt-4 border-t border-gray-800">
                    <Thermometer size={16} /> CLIMATE
                </h3>
                <div className="flex items-center justify-between bg-gray-800 p-2 rounded">
                    <span className="text-xs">TEMP</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setVss("Vehicle.Cabin.HVAC.AmbientAirTemperature", Math.max(15.0, temp - 0.5))}
                            className="p-1 hover:bg-gray-700 rounded"
                        >
                            <ArrowDown size={14} />
                        </button>
                        <span className="w-12 text-center font-mono">{temp.toFixed(1)}°C</span>
                        <button
                            onClick={() => setVss("Vehicle.Cabin.HVAC.AmbientAirTemperature", Math.min(40.0, temp + 0.5))}
                            className="p-1 hover:bg-gray-700 rounded"
                        >
                            <ArrowUp size={14} />
                        </button>
                    </div>
                </div>
                <div className="flex gap-1 bg-gray-800 p-1 rounded">
                    {['OFF', 'LO', 'MED', 'HI', 'AUTO'].map((s) => (
                        <button
                            key={s}
                            onClick={() => setVss("Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed", s as any)}
                            className={clsx(
                                "flex-1 text-[10px] py-1 rounded transition-colors",
                                fanSpeed === s ? "bg-blue-600 text-white" : "hover:bg-gray-700 text-gray-400"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </section >

            {/* SFR203: Windows */}
            < section className={clsx("space-y-4 transition-opacity", ignition === 'STOP' && "opacity-30 pointer-events-none")}>
                <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
                    <Wind size={16} /> WINDOWS
                </h3>
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex gap-2">
                        <button
                            onClick={() => handleWindowAllClick('CLOSE')}
                            className="flex-1 bg-gray-800 hover:bg-gray-700 text-xs py-1 rounded select-none cursor-pointer">ALL CLOSE</button>
                        <button
                            onClick={() => handleWindowAllClick('OPEN')}
                            className="flex-1 bg-gray-800 hover:bg-gray-700 text-xs py-1 rounded select-none cursor-pointer">ALL OPEN</button>
                    </div>
                    {(['FL', 'FR', 'RL', 'RR'] as const).map((pos) => (
                        <div key={pos} className="flex flex-col bg-gray-800 p-2 rounded">
                            <span className="text-[10px] text-gray-500 uppercase mb-1">{pos}</span>
                            <div className="flex justify-between gap-1 overflow-hidden">
                                <button
                                    onMouseDown={() => handleWindowPress(pos, 'CLOSE')}
                                    onMouseUp={() => handleWindowRelease(pos)}
                                    onMouseLeave={() => handleWindowRelease(pos)}
                                    className="flex-1 text-[10px] px-1 py-1 bg-gray-700 hover:bg-gray-600 rounded select-none cursor-pointer">CL</button>
                                <button
                                    onMouseDown={() => handleWindowPress(pos, 'OPEN')}
                                    onMouseUp={() => handleWindowRelease(pos)}
                                    onMouseLeave={() => handleWindowRelease(pos)}
                                    className="flex-1 text-[10px] px-1 py-1 bg-gray-700 hover:bg-gray-600 rounded select-none cursor-pointer">OP</button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Defroster & Defogger */}
                <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-gray-700">
                    <button
                        onClick={() => setVss("Vehicle.Cabin.HVAC.IsFrontDefrosterActive", !frontDef)}
                        className={clsx(
                            "w-full text-xs py-2 rounded flex items-center justify-center gap-2 border transition-colors",
                            frontDef ? "bg-orange-900/50 border-orange-500 text-orange-200" : "bg-gray-800 border-transparent text-gray-400 hover:bg-gray-700"
                        )}
                    >
                        <Wind size={14} /> DEFROSTER (FRONT) {frontDef ? 'ON' : 'OFF'}
                    </button>
                    <button
                        onClick={() => setVss("Vehicle.Cabin.HVAC.IsRearDefrosterActive", !rearDef)}
                        className={clsx(
                            "w-full text-xs py-2 rounded flex items-center justify-center gap-2 border transition-colors",
                            rearDef ? "bg-orange-900/50 border-orange-500 text-orange-200" : "bg-gray-800 border-transparent text-gray-400 hover:bg-gray-700"
                        )}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="4" y1="6" x2="20" y2="6" />
                            <line x1="4" y1="12" x2="20" y2="12" />
                            <line x1="4" y1="18" x2="20" y2="18" />
                        </svg> DEFOGGER (REAR) {rearDef ? 'ON' : 'OFF'}
                    </button>
                </div>
            </section >

            {/* SFR205: Turn Signal & Lights */}
            < section className={clsx("space-y-4 transition-opacity", ignition === 'STOP' && "opacity-30 pointer-events-none")}>
                <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
                    <Zap size={16} /> TURN SIGNAL
                </h3>

                {/* Hazard */}
                <button
                    onClick={() => setVss("Vehicle.Body.Lights.Hazard.IsSignaling", !hazard)}
                    className={clsx(
                        "w-full py-3 rounded-lg flex items-center justify-center gap-2 border-2 transition-all font-bold",
                        hazard ? "bg-red-900/50 border-red-500 text-red-500 animate-pulse" : "bg-gray-800 border-gray-700 text-gray-500 hover:border-red-900"
                    )}
                >
                    <Triangle size={20} fill={hazard ? "currentColor" : "none"} /> HAZARD
                </button>

                {/* Turn Signals */}
                <div className="flex gap-4">
                    <button
                        onClick={() => handleTurnSignal('LEFT')}
                        className={clsx(
                            "flex-1 py-4 rounded-lg flex items-center justify-center border-2 transition-all",
                            leftSig ? "bg-amber-900/50 border-amber-500 text-amber-500" : "bg-gray-800 border-gray-700 text-gray-500 hover:border-amber-900"
                        )}
                    >
                        <MoveLeft size={24} />
                    </button>
                    <button
                        onClick={() => handleTurnSignal('RIGHT')}
                        className={clsx(
                            "flex-1 py-4 rounded-lg flex items-center justify-center border-2 transition-all",
                            rightSig ? "bg-amber-900/50 border-amber-500 text-amber-500" : "bg-gray-800 border-gray-700 text-gray-500 hover:border-amber-900"
                        )}
                    >
                        <MoveRight size={24} />
                    </button>
                </div>
            </section >
        </div >
    );
};
