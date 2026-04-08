import { create } from 'zustand';
import { VehicleState } from './types';
import { ScenarioNode } from './scenarioTypes';

/*
  =============================================================================
  【グローバル状態管理 (Store)】
  このファイルは、本教育用シミュレータの中枢となる状態管理（Zustand）を定義しています。
  
  ■ 主な役割・要求仕様（SW105）とのマッピング:
  1. OSDVI / VSS に準拠した車載API状態の管理 ([REQ-002] アクチュエータ制御)
  2. シナリオツリーの保持と実行管理 ([REQ-004] 雨天シナリオ、[REQ-005] サンキューハザード)
  3. 自動制御と手動操作の衝突時の優先権（マニュアルオーバーライド）([REQ-006])
  4. イグニッション管理と制御初期化・復旧キャッシュ管理（PreRunStateCache）([REQ-001])
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

    // Service Mock API
    startMoveWindow: (instance: string, position: number, priority?: number) => void;
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
    "Vehicle.Cabin.Window.$FrontLeft.Position": 0,
    "Vehicle.Cabin.Window.$FrontRight.Position": 0,
    "Vehicle.Cabin.Window.$RearLeft.Position": 0,
    "Vehicle.Cabin.Window.$RearRight.Position": 0,
    "Vehicle.Cabin.HVAC.AmbientAirTemperature": 25.0,
    "Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed": 'OFF',
    "Vehicle.Exterior.Light.Defogger.IsActive": false,
    "Vehicle.Motion.ResponseProfile": 'Standard',
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
            description: '[REQ-004] 雨天時のスマートシーンシナリオ (雨量連動制御とRESTORE)',
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
                                        { id: 'a1', type: 'ACTION', description: '全ての窓を閉める（※事前に現在の窓の開度を記憶すること）', reference: '/* Ref: OSDVI API Spec / VSS Core, p.85 */\n// (内部的に窓の状態をキャッシュし、0%へ向けて駆動開始)', action: { target: 'Vehicle.Cabin.Window.$FrontLeft.Position', value: 0 } },
                                        { id: 'a2', type: 'ACTION', description: '', action: { target: 'Vehicle.Cabin.Window.$FrontRight.Position', value: 0 } },
                                        { id: 'a3', type: 'ACTION', description: '', action: { target: 'Vehicle.Cabin.Window.$RearLeft.Position', value: 0 } },
                                        { id: 'a4', type: 'ACTION', description: '', action: { target: 'Vehicle.Cabin.Window.$RearRight.Position', value: 0 } },
                                        { id: 'a5', type: 'ACTION', description: 'かつ デフォッガをONにする', reference: '/* Ref: OSDVI API Spec / VSS Core, p.91 "HVAC Defogger" */', action: { target: 'Vehicle.Exterior.Light.Defogger.IsActive', value: true } }
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
                            { id: 'a-res1', type: 'RESTORE', description: '全てを雨が降る前の状態に戻す', reference: '// (キャッシュしておいた状態へ復元)', targetPattern: 'Vehicle.Cabin.Window.*.Position' },
                            { id: 'a-res2', type: 'RESTORE', description: '', targetPattern: 'Vehicle.Body.Windshield.Wiper.Mode' },
                            { id: 'a-res3', type: 'RESTORE', description: '', targetPattern: 'Vehicle.Exterior.Light.Defogger.IsActive' }
                        ]
                    }
                }
            ]
        },
        {
            id: 'scenario-hazard',
            description: '[REQ-005] サンキューハザードシナリオ (後方障害物距離連動とWAITアクション)',
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
    /**
     * @function addScenario
     * @description 新しいシナリオノードをストアのシナリオリストに追加します。
     * 同一IDのシナリオが既に存在する場合は追加をスキップします。
     * @param {ScenarioNode} scenario - 追加するシナリオノードオブジェクト。
     */
    addScenario: (scenario) => set((state) => {
        if (state.scenarios.some(s => 'id' in s && s.id === scenario['id'])) return state;
        return { scenarios: [...state.scenarios, scenario] };
    }),
    /**
     * @function updateScenario
     * @description 既存のシナリオノードを新しい内容で更新（置換）します。
     * IDが一致するシナリオを検索し、一致したものをnewNodeに置き換えます。
     * @param {string} id - 更新対象のシナリオID。
     * @param {ScenarioNode} newNode - 更新後の新しいシナリオノード。
     */
    updateScenario: (id, newNode) => set((state) => ({
        scenarios: state.scenarios.map(s => ('id' in s && s.id === id) ? newNode : s)
    })),
    // ------------------------------------------------------------------------
    /**
     * @function setScenarioRunning
     * @description シナリオの自動実行状態（RUN / STOP）を切り替えます。
     * 実行開始時（RUN）には、現在の車載APIの各種状態（窓、ワイパー、デフロスタ等）を「PreRunStateCache」に保存し、バックアップを取得します。
     * これにより、シナリオ終了時（例：雨が止んだ時）に「RESTORE」アクションを通じて確実に元の状態へ復元することが可能になります。
     * @param {boolean} isRunning - trueでシナリオ実行開始、falseで停止。
     */
    setScenarioRunning: (isRunning) => set((state) => {
        if (isRunning && !state.isScenarioRunning) {
            // 自動制御開始: 現在の各種アクチュエータの状態をスナップショットとしてキャッシュ
            return {
                isScenarioRunning: true,
                "Internal.PreRunStateCache": {
                    "Vehicle.Cabin.Window.$FrontLeft.Position": state["Vehicle.Cabin.Window.$FrontLeft.Position"],
                    "Vehicle.Cabin.Window.$FrontRight.Position": state["Vehicle.Cabin.Window.$FrontRight.Position"],
                    "Vehicle.Cabin.Window.$RearLeft.Position": state["Vehicle.Cabin.Window.$RearLeft.Position"],
                    "Vehicle.Cabin.Window.$RearRight.Position": state["Vehicle.Cabin.Window.$RearRight.Position"],
                    "Vehicle.Body.Windshield.Wiper.Mode": state["Vehicle.Body.Windshield.Wiper.Mode"],
                    "Vehicle.Exterior.Light.Defogger.IsActive": state["Vehicle.Exterior.Light.Defogger.IsActive"],
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
    /**
     * @function resetScenarios
     * @description ストアに保持されている全シナリオリストを、指定された新しいリストで上書きリセットします。
     * 初期化や外部JSONからのロード時等に使用されます。
     * @param {ScenarioNode[]} newScenarios - リセット後に設定する新しいシナリオノードの配列。
     */
    resetScenarios: (newScenarios: ScenarioNode[]) => set({ scenarios: newScenarios }),




    // Conflict Resolution
    /**
     * @function recordUserInteraction
     * @description ユーザーによる手動のUI操作（スイッチ切り替え等）の発生時刻を記録します。
     * この記録は、シナリオによる自動制御命令とユーザー手動操作が競合した際に、手動操作を優先（オーバーライド）させるための調停（Conflict Resolution）に使用されます。
     * @param {keyof VehicleState} key - 操作対象となったVSSパラメータキー。
     */
    recordUserInteraction: (key) => set((state) => ({
        lastUserInteract: { ...state.lastUserInteract, [key]: Date.now() }
    })),

    // ------------------------------------------------------------------------
    /**
     * @function setVss
     * @description システム内のあらゆるVSS（Vehicle Signal Specification）値の更新を行う中央処理関数。
     * ユーザーによるマニュアル入力、シナリオ実行、物理シミュレーションによる状態更新のすべてがここを通過します。
     * 
     * 特定の値が変更された際、イグニッション状態による全体リセット、センサーデータの立ち上がりエッジ検出、
     * およびドライバーの手動介入（オーバーライド）フラグの記録といった「副作用」を一元的にハンドリング・調停します。
     * 
     * @param {K} key - 更新対象のVSSパラメータキー（例：'Vehicle.Speed'）。
     * @param {VehicleState[K]} value - 更新する新しい値。
     */
    setVss: (key, value) => {
        set((state) => {
            const updates: any = { [key]: value };

            // [REQ-001] [ 制約処理 ]: イグニッションがSTOPになったら、シナリオやワイパー等の全アクチュエータを強制停止
            if (key === "Vehicle.IgnitionState" && value === 'STOP') {
                updates["Vehicle.Body.Windshield.Wiper.Mode"] = 'OFF';
                updates["Vehicle.Exterior.Light.Defogger.IsActive"] = false;
                updates["Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed"] = 'OFF';
                updates["Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling"] = false;
                updates["Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling"] = false;
                updates["Vehicle.Body.Lights.Hazard.IsSignaling"] = false;
                updates["Internal.ActiveScenarioTrigger"] = null; // ハザードシナリオ等の進行状況をリセット
                updates["Internal.LaneChangeStatus"] = 'NONE';
            }

            // [REQ-004] [ エッジ検出 ]: 雨量(RainLevel)の連続的な変化を監視し、「雨が降り始めた瞬間」のみを捉えるためのフラグ管理
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
                    "Vehicle.Cabin.Window.$FrontLeft.Position": state["Vehicle.Cabin.Window.$FrontLeft.Position"],
                    "Vehicle.Cabin.Window.$FrontRight.Position": state["Vehicle.Cabin.Window.$FrontRight.Position"],
                    "Vehicle.Cabin.Window.$RearLeft.Position": state["Vehicle.Cabin.Window.$RearLeft.Position"],
                    "Vehicle.Cabin.Window.$RearRight.Position": state["Vehicle.Cabin.Window.$RearRight.Position"],
                    "Vehicle.Body.Windshield.Wiper.Mode": 'OFF',
                    "Vehicle.Exterior.Light.Defogger.IsActive": false,
                };
            }

            // [REQ-006] [ マニュアル・オーバーライド (手動介入の記録) ]
            // 「ドライバー・イン・ザ・ループの原則」に基づき、スマートシナリオにより自動制御（スマートシーン）が稼働中であっても、
            // 「ドライバーの意志（手動操作）が最優先される」という仕様を実現するため、
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
                        "Vehicle.Cabin.Window.$FrontLeft.Position",
                        "Vehicle.Cabin.Window.$FrontRight.Position",
                        "Vehicle.Cabin.Window.$RearLeft.Position",
                        "Vehicle.Cabin.Window.$RearRight.Position",
                        "Vehicle.Body.Windshield.Wiper.Mode",
                        "Vehicle.Exterior.Light.Defogger.IsActive"
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
    /**
     * @function updateState
     * @description 複数のVSS状態を1回のフレーム（サイクル）で一括更新します。
     * 物理エンジンによるスムーズなアニメーション描画や、シナリオの複雑なアクション（複数同時操作）を遅延なく反映するために使用します。
     * @param {Partial<VehicleState>} newState - 一括更新する状態のキーと値のペア。
     */
    updateState: (newState) => set((state) => {
        const updates = { ...newState } as any;
        return { ...state, ...updates };
    }),

    /**
     * @function startMoveWindow
     * @description OSDVI 202603α で新設された startMove メソッドのモック実装。
     */
    startMoveWindow: (instance: string, position: number, priority?: number) => {
        const key = `Vehicle.Cabin.Window.${instance}.Position` as keyof VehicleState;
        get().setVss(key, position as any);
    },
}));
