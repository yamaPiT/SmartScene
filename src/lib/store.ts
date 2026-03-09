import { create } from 'zustand';
import { VehicleState } from './types';
import { ScenarioNode } from './scenarioTypes';

/*
  =============================================================================
  【グローバル状態管理 (Store)】
  このファイルは、本教育用シミュレータの中枢となる状態管理（Zustand）を定義しています。
  
  ■ 主な役割:
  1. OSDVI / VSS (Vehicle Signal Specification) に準拠した車載API状態の保持
  2. シナリオエンジン（ScenarioRunner）が監視・実行するためのシナリオツリー(JSON)の保持
  3. 「手動操作」と「自動制御（スマート機能）」が衝突した際の『優先権（オーバーライド）』や、
     自動制御から復帰する際の『状態キャッシュ（PreRunStateCache）』の管理
  =============================================================================
*/

export const USER_OVERRIDE_DURATION = 3000; // ms

interface VehicleStore extends VehicleState {
    // Scenario State
    scenarios: ScenarioNode[];
    isScenarioRunning: boolean;

    // --------------------------------------------------------------------
    // Scenario Actions (シナリオの追加・更新・実行状態のトグル)
    // --------------------------------------------------------------------
    addScenario: (scenario: ScenarioNode) => void;
    updateScenario: (id: string, newNode: ScenarioNode) => void;
    setScenarioRunning: (isRunning: boolean) => void;

    // --------------------------------------------------------------------
    // Conflict Resolution (手動介入・コンフリクト解決)
    // --------------------------------------------------------------------
    // ユーザーが各種スイッチを手動操作した時刻を記録し、
    // シナリオ（自動制御）がその操作を上書きしないよう調停するために使用
    lastUserInteract: Record<keyof VehicleState, number>;
    recordUserInteraction: (key: keyof VehicleState) => void;

    // --------------------------------------------------------------------
    // Generic Setter for VSS State
    // 全てのVSS値の更新は必ずこのメソッドを経由させる。
    // （ここで各種エッジ検出や、イグニッション状態に連動した初期化プロセスが介入する）
    // --------------------------------------------------------------------
    setVss: <K extends keyof VehicleState>(key: K, value: VehicleState[K]) => void;

    // Batch Update for Physics/Scenarios (複数のVSS値を1フレームで一括更新)
    updateState: (newState: Partial<VehicleState>) => void;
}



export const useVehicleStore = create<VehicleStore>((set, get) => ({
    // --- Initial VSS State ---
    "Vehicle.IgnitionState": 'STOP',
    "Vehicle.Speed": 0,
    "Vehicle.Exterior.Air.RainIntensity": 0,

    // Lights Initial
    "Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling": false,
    "Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling": false,
    "Vehicle.Body.Lights.Hazard.IsSignaling": false,

    "Vehicle.Body.Windshield.Wiper.Mode": 'OFF',
    "Vehicle.Cabin.Door.Row1.Left.Window.Position": 0,
    "Vehicle.Cabin.Door.Row1.Right.Window.Position": 0,
    "Vehicle.Cabin.Door.Row2.Left.Window.Position": 0,
    "Vehicle.Cabin.Door.Row2.Right.Window.Position": 0,
    "Vehicle.Cabin.HVAC.AmbientAirTemperature": 25.0,
    "Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed": 'OFF',
    "Vehicle.Cabin.HVAC.IsFrontDefrosterActive": false,
    "Vehicle.Cabin.HVAC.IsRearDefrosterActive": false,
    "Vehicle.ADAS.ObstacleDetection.Rear.Distance": 20.0,
    "Internal.LaneChangeStatus": 'NONE',
    "Internal.LaneChangeStartTime": null,
    "Internal.LaneChangeStartRearDistance": null,
    "Internal.ActiveScenarioTrigger": null,

    /* 
      【シミュレータ独自の内部状態】
      PreRunStateCache: 自動制御（スマート機能）が介入する直前の状態を保持し、RESTORE時に復元する先。
      UserMemoryState: ユーザーが手動で設定した（期待する）最新の窓開度などを保持。
      ManualOverrideFlags: シナリオ実行中にユーザーが手動操作を行ったかをフラグとして記録。
      WasRainBelow10: 雨天シナリオにおける「エッジ検出（雨が降り始めた瞬間のみ発動）」のフラグ。
    */
    "Internal.PreRunStateCache": {},
    "Internal.UserMemoryState": {},
    "Internal.ManualOverrideFlags": {},
    "Internal.WasRainBelow10": true,
    "Internal.WindowTarget": {},
    "Internal.WindowPressing": {},
    "Internal.WindowPressStart": {},
    "Internal.BlinkerTick": false,

    // Scenario State
    scenarios: [
        {
            id: 'scenario-rain',
            description: '雨天時のスマートシーンシナリオ',
            type: 'BLOCK',
            children: [
                {
                    id: 's1-if1',
                    type: 'IF',
                    description: '雨センサが10％以上の雨を検出',
                    reference: '/* Ref: OSDVI API Spec / VSS Core, p.42 */',
                    condition: { parameter: 'Vehicle.Exterior.Air.RainIntensity', operator: '>=', value: 10 },
                    thenBody: {
                        id: 's1-block1',
                        type: 'BLOCK',
                        description: '',
                        children: [
                            {
                                id: 's1-if-edge',
                                type: 'IF',
                                description: '前回RainLevelが10%未満だった場合のみ窓と防曇を操作',
                                condition: { parameter: 'Internal.WasRainBelow10', operator: '==', value: true },
                                thenBody: {
                                    id: 's1-edge-block',
                                    type: 'BLOCK',
                                    description: '',
                                    children: [
                                        { id: 'a1', type: 'ACTION', description: '全ての窓を閉める（※事前に現在の窓の開度を記憶すること）', reference: '/* Ref: OSDVI API Spec / VSS Core, p.85 */\n// (内部的に窓の状態をキャッシュし、0%へ向けて駆動開始)', action: { target: 'Vehicle.Cabin.Door.Row1.Left.Window.Position', value: 0 } },
                                        { id: 'a2', type: 'ACTION', description: '', action: { target: 'Vehicle.Cabin.Door.Row1.Right.Window.Position', value: 0 } },
                                        { id: 'a3', type: 'ACTION', description: '', action: { target: 'Vehicle.Cabin.Door.Row2.Left.Window.Position', value: 0 } },
                                        { id: 'a4', type: 'ACTION', description: '', action: { target: 'Vehicle.Cabin.Door.Row2.Right.Window.Position', value: 0 } },
                                        { id: 'a5', type: 'ACTION', description: 'かつ デフォッガをONにする', reference: '/* Ref: OSDVI API Spec / VSS Core, p.91 "HVAC Rear Defroster" */', action: { target: 'Vehicle.Cabin.HVAC.IsRearDefrosterActive', value: true } },
                                        { id: 'a6', type: 'ACTION', description: 'かつ デフロスタをONにする', reference: '/* Ref: OSDVI API Spec / VSS Core, p.91 "HVAC Front Defroster" */', action: { target: 'Vehicle.Cabin.HVAC.IsFrontDefrosterActive', value: true } }
                                    ]
                                }
                            },
                            {
                                id: 's1-if2',
                                type: 'IF',
                                description: '雨センサが50%未満の雨を検出',
                                condition: { parameter: 'Vehicle.Exterior.Air.RainIntensity', operator: '<', value: 50 },
                                thenBody: {
                                    id: 'a7',
                                    type: 'ACTION',
                                    description: 'ワイパをINTで動作させる',
                                    reference: '/* Ref: OSDVI API Spec / VSS Core, p.55 */',
                                    action: { target: 'Vehicle.Body.Windshield.Wiper.Mode', value: 'INT' }
                                },
                                elseBody: {
                                    id: 's1-if3',
                                    type: 'IF',
                                    description: '雨センサが80%未満の雨を検出',
                                    condition: { parameter: 'Vehicle.Exterior.Air.RainIntensity', operator: '<', value: 80 },
                                    thenBody: {
                                        id: 'a8',
                                        type: 'ACTION',
                                        description: 'ワイパをLOで動作させる',
                                        action: { target: 'Vehicle.Body.Windshield.Wiper.Mode', value: 'LO' }
                                    },
                                    elseBody: {
                                        id: 'a9',
                                        type: 'ACTION',
                                        description: 'ワイパをHIで動作させる',
                                        action: { target: 'Vehicle.Body.Windshield.Wiper.Mode', value: 'HI' }
                                    }
                                }
                            }
                        ]
                    },
                    elseBody: {
                        id: 's1-else-block',
                        type: 'BLOCK',
                        description: '全てを雨が降る前の状態に戻す',
                        children: [
                            { id: 'a-res1', type: 'RESTORE', description: '全てを雨が降る前の状態に戻す', reference: '// (キャッシュしておいた状態へ復元)', targetPattern: 'Vehicle.Cabin.Door.*.Window.Position' },
                            { id: 'a-res2', type: 'RESTORE', description: '', targetPattern: 'Vehicle.Body.Windshield.Wiper.Mode' },
                            { id: 'a-res3', type: 'RESTORE', description: '', targetPattern: 'Vehicle.Cabin.HVAC.IsRearDefrosterActive' },
                            { id: 'a-res4', type: 'RESTORE', description: '', targetPattern: 'Vehicle.Cabin.HVAC.IsFrontDefrosterActive' }
                        ]
                    }
                }
            ]
        },
        {
            id: 'scenario-hazard',
            description: 'サンキューハザードシナリオ',
            type: 'BLOCK',
            children: [
                {
                    id: 's2-if1',
                    type: 'IF',
                    description: 'ユーザのウィンカ操作（右または左）を検出する',
                    reference: '/* Ref: OSDVI API Spec / VSS Core, p.62 */',
                    condition: {
                        operator: 'OR',
                        conditions: [
                            { parameter: 'Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling', operator: '==', value: true },
                            { parameter: 'Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling', operator: '==', value: true }
                        ]
                    },
                    thenBody: {
                        id: 's2-block1',
                        type: 'BLOCK',
                        description: '後方車の距離を測定する',
                        reference: '/* Ref: [PROPOSED EXTENSION] OSDVI未定義（ADAS拡張提案） */\n// (測定処理)',
                        children: [
                            {
                                id: 's2-if2',
                                type: 'IF',
                                description: '後方車の距離が 30m以下である',
                                condition: { parameter: 'Vehicle.ADAS.ObstacleDetection.Rear.Distance', operator: '<=', value: 30 },
                                thenBody: {
                                    id: 's2-block2',
                                    type: 'BLOCK',
                                    description: '',
                                    children: [
                                        { id: 'w1', type: 'WAIT', description: 'ウィンカを8秒間点滅するのを待つ', reference: '/* 周期0.5秒の点滅はシミュレータ側で処理 */', duration: 8000 },
                                        { id: 'a10', type: 'ACTION', description: 'ウインカを消し、ハザード（左右ウインカの同時点滅）を炊く', action: { target: 'Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling', value: false } },
                                        { id: 'a11', type: 'ACTION', description: '', action: { target: 'Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling', value: false } },
                                        { id: 'a12', type: 'ACTION', description: '', action: { target: 'Vehicle.Body.Lights.Hazard.IsSignaling', value: true } },
                                        { id: 'w2', type: 'WAIT', description: '3秒経過後、ハザードを消す', duration: 3000 },
                                        { id: 'a13', type: 'ACTION', description: '', action: { target: 'Vehicle.Body.Lights.Hazard.IsSignaling', value: false } }
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        }
    ],
    isScenarioRunning: false,
    lastUserInteract: {} as Record<keyof VehicleState, number>,

    // Scenario Actions
    addScenario: (scenario) => set((state) => {
        if (state.scenarios.some(s => 'id' in s && s.id === scenario['id'])) return state;
        return { scenarios: [...state.scenarios, scenario] };
    }),
    updateScenario: (id, newNode) => set((state) => ({
        scenarios: state.scenarios.map(s => ('id' in s && s.id === id) ? newNode : s)
    })),
    // ------------------------------------------------------------------------
    // 【シナリオの実行管理 (setScenarioRunning)】
    //   自動実行（RUN）が開始された瞬間に、現在の車載APIの各種状態を「PreRunStateCache」に保存します。
    //   これにより、シナリオ終了時（晴れた時など）に、RESTOREアクションで元の状態へ戻すことが可能になります。
    // ------------------------------------------------------------------------
    setScenarioRunning: (isRunning) => set((state) => {
        if (isRunning && !state.isScenarioRunning) {
            // 自動制御開始: 現在の各種アクチュエータの状態をスナップショットとしてキャッシュ
            return {
                isScenarioRunning: true,
                "Internal.PreRunStateCache": {
                    "Vehicle.Cabin.Door.Row1.Left.Window.Position": state["Vehicle.Cabin.Door.Row1.Left.Window.Position"],
                    "Vehicle.Cabin.Door.Row1.Right.Window.Position": state["Vehicle.Cabin.Door.Row1.Right.Window.Position"],
                    "Vehicle.Cabin.Door.Row2.Left.Window.Position": state["Vehicle.Cabin.Door.Row2.Left.Window.Position"],
                    "Vehicle.Cabin.Door.Row2.Right.Window.Position": state["Vehicle.Cabin.Door.Row2.Right.Window.Position"],
                    "Vehicle.Body.Windshield.Wiper.Mode": state["Vehicle.Body.Windshield.Wiper.Mode"],
                    "Vehicle.Cabin.HVAC.IsFrontDefrosterActive": state["Vehicle.Cabin.HVAC.IsFrontDefrosterActive"],
                    "Vehicle.Cabin.HVAC.IsRearDefrosterActive": state["Vehicle.Cabin.HVAC.IsRearDefrosterActive"],
                },
                "Internal.ManualOverrideFlags": {} // オーバーライド（手動介入記録）もリセット
            };
        } else if (!isRunning && state.isScenarioRunning) {
            // 自動制御停止: キャッシュや手動介入の記録をクリア
            return {
                isScenarioRunning: false,
                "Internal.PreRunStateCache": {},
                "Internal.ManualOverrideFlags": {}
            };
        }
        return { isScenarioRunning: isRunning };
    }),
    resetScenarios: (newScenarios: ScenarioNode[]) => set({ scenarios: newScenarios }),




    // Conflict Resolution
    recordUserInteraction: (key) => set((state) => ({
        lastUserInteract: { ...state.lastUserInteract, [key]: Date.now() }
    })),

    // ------------------------------------------------------------------------
    // 【Central VSS Updater (setVss)】
    //   あらゆるシステム内のVSS値の変更（ユーザー入力、シナリオ実行、物理シミュレーション）はここを通る。
    //   ここで、特定の値が変更されたときに連鎖的に起きる「副作用」をまとめてハンドリングする。
    // ------------------------------------------------------------------------
    setVss: (key, value) => {
        set((state) => {
            const updates: any = { [key]: value };

            // [ 制約処理 ]: イグニッションがSTOPになったら、シナリオやワイパー等の全アクチュエータを強制停止
            if (key === "Vehicle.IgnitionState" && value === 'STOP') {
                updates["Vehicle.Body.Windshield.Wiper.Mode"] = 'OFF';
                updates["Vehicle.Cabin.HVAC.IsFrontDefrosterActive"] = false;
                updates["Vehicle.Cabin.HVAC.IsRearDefrosterActive"] = false;
                updates["Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed"] = 'OFF';
                updates["Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling"] = false;
                updates["Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling"] = false;
                updates["Vehicle.Body.Lights.Hazard.IsSignaling"] = false;
                updates["Internal.ActiveScenarioTrigger"] = null; // ハザードシナリオ等の進行状況をリセット
                updates["Internal.LaneChangeStatus"] = 'NONE';
            }

            // [ エッジ検出 ]: 雨量(RainLevel)の連続的な変化を監視し、「雨が降り始めた瞬間」のみを捉えるためのフラグ管理
            if (key === "Vehicle.Exterior.Air.RainIntensity") {
                const prevRain = state["Vehicle.Exterior.Air.RainIntensity"] as number;
                const newRain = value as number;

                if (prevRain < 10 && newRain >= 10) {
                    updates["Internal.WasRainBelow10"] = true; // 10%未満から10%以上への立ち上がりエッジ
                } else if (prevRain >= 10 && newRain >= 10) {
                    updates["Internal.WasRainBelow10"] = false; // 降り続けている状態
                } else if (newRain < 10) {
                    updates["Internal.WasRainBelow10"] = true; // クローズ（リセット）。次に降った時に再度エッジ検出可能にする
                }
            }

            // When Ignition transitions to START, initialize UserMemoryState
            if (key === "Vehicle.IgnitionState" && value === 'START') {
                updates["Internal.UserMemoryState"] = {
                    "Vehicle.Cabin.Door.Row1.Left.Window.Position": state["Vehicle.Cabin.Door.Row1.Left.Window.Position"],
                    "Vehicle.Cabin.Door.Row1.Right.Window.Position": state["Vehicle.Cabin.Door.Row1.Right.Window.Position"],
                    "Vehicle.Cabin.Door.Row2.Left.Window.Position": state["Vehicle.Cabin.Door.Row2.Left.Window.Position"],
                    "Vehicle.Cabin.Door.Row2.Right.Window.Position": state["Vehicle.Cabin.Door.Row2.Right.Window.Position"],
                    "Vehicle.Body.Windshield.Wiper.Mode": 'OFF',
                    "Vehicle.Cabin.HVAC.IsFrontDefrosterActive": false,
                    "Vehicle.Cabin.HVAC.IsRearDefrosterActive": false,
                };
            }

            // [ マニュアル・オーバーライド (手動介入の記録) ]
            // 自動制御（スマートシーン）が稼働中であっても、「ドライバーの意志（手動操作）が最優先される」という仕様を実現するため、
            // ユーザーが何かしらのスイッチを操作した際には `ManualOverrideFlags` を true に記録し、自動制御からの要求をブロックする材料とする。
            if (state["Vehicle.IgnitionState"] === 'START' || (key === "Vehicle.IgnitionState" && value === 'START')) {
                // イグニッション自体の操作は除く（アクチュエータへの操作のみを記録する）
                if (key !== "Vehicle.IgnitionState") {
                    updates["Internal.ManualOverrideFlags"] = {
                        ...state["Internal.ManualOverrideFlags"],
                        [key]: true
                    };

                    // 同時に、手動操作によりユーザーが期待した最新の状態を UserMemoryState にバックアップ。
                    // （雨がやんでRESTOREする際に、自動制御が行われた「前」ではなく、手動操作後の「今」の状態へ戻すため）
                    const trackedKeys = [
                        "Vehicle.Cabin.Door.Row1.Left.Window.Position",
                        "Vehicle.Cabin.Door.Row1.Right.Window.Position",
                        "Vehicle.Cabin.Door.Row2.Left.Window.Position",
                        "Vehicle.Cabin.Door.Row2.Right.Window.Position",
                        "Vehicle.Body.Windshield.Wiper.Mode",
                        "Vehicle.Cabin.HVAC.IsFrontDefrosterActive",
                        "Vehicle.Cabin.HVAC.IsRearDefrosterActive"
                    ];

                    if (trackedKeys.includes(key as string)) {
                        const currentMemory = state["Internal.UserMemoryState"] || {};
                        updates["Internal.UserMemoryState"] = {
                            ...currentMemory,
                            [key]: value
                        };
                    }
                }
            }
            return updates;
        });
        get().recordUserInteraction(key);
    },

    // Batch Update
    updateState: (newState) => set((state) => {
        const updates = { ...newState } as any;
        return { ...state, ...updates };
    }),
}));
