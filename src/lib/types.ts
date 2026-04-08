import { ScenarioNode } from './scenarioTypes';

export type VehicleState = {
    // --- VSS (Vehicle Signal Specification) Mapped State ---

    "Vehicle.IgnitionState": 'STOP' | 'START';                // 車両の主電源状態

    // Infotainment & Environment
    "Vehicle.Speed": number;                                  // km/h
    "Vehicle.Exterior.Air.RainIntensity": number;             // 0-100%

    // Body & Lights [UPDATED]
    "Vehicle.Body.Lights.DirectionIndicator.Left.IsSignaling": boolean;
    "Vehicle.Body.Lights.DirectionIndicator.Right.IsSignaling": boolean;
    "Vehicle.Body.Lights.Hazard.IsSignaling": boolean;

    "Vehicle.Body.Windshield.Wiper.Mode": 'OFF' | 'INT' | 'LO' | 'HI' | 'AUTO';
    "Vehicle.Cabin.Window.$FrontLeft.Position": number;   // 0-100% (FL)
    "Vehicle.Cabin.Window.$FrontRight.Position": number;  // (FR)
    "Vehicle.Cabin.Window.$RearLeft.Position": number;   // (RL)
    "Vehicle.Cabin.Window.$RearRight.Position": number;  // (RR)

    // HVAC & Defogger
    "Vehicle.Cabin.HVAC.AmbientAirTemperature": number;
    "Vehicle.Cabin.HVAC.Station.Row1.Left.FanSpeed": 'OFF' | 'LO' | 'MED' | 'HI' | 'AUTO';
    "Vehicle.Exterior.Light.Defogger.IsActive": boolean;      // デフォッガ統合版

    // ADAS (New)
    "Vehicle.ADAS.ObstacleDetection.Rear.Distance": number;   // m

    // Motion
    "Vehicle.Motion.ResponseProfile": 'Standard' | 'Maximum' | 'Rapid' | 'Gentle';

    // App Specific (Internal State)
    "Internal.LaneChangeStatus": 'NONE' | 'CHANGING' | 'COMPLETED';
    "Internal.LaneChangeStartTime": number | null;
    "Internal.LaneChangeStartRearDistance": number | null; // Snapshot of distance at start of LC

    // マニュアル優先とRESTOREのための記憶領域
    "Internal.ActiveScenarioTrigger": string | null;       // 現在発動中のシナリオID
    "Internal.PreRunStateCache": Record<string, any>;      // RUN開始時の初期状態を記憶
    "Internal.UserMemoryState": Partial<VehicleState>;     // ユーザーの基本状態を永続的に記憶 (START時初期化＋手動更新)
    "Internal.ManualOverrideFlags": Record<string, boolean>; // RUN中に手動操作された変数を記録
    "Internal.WasRainBelow10": boolean;                    // 前回RainLevelが10%未満だったかどうか

    "Internal.WindowTarget": Record<string, number>;       // シナリオからのSET要求目標値 (3秒物理挙動用)
    "Internal.WindowPressing": Record<string, 'OPEN' | 'CLOSE' | null>; // 手動操作ボタンの押下状態
    "Internal.WindowPressStart": Record<string, number>;   // 窓操作ボタンの手動押下開始時刻 (2秒判定用)
    "Internal.BlinkerTick": boolean;                       // 500ms周期のウインカー点滅同期用Tick

    resetScenarios: (scenarios: ScenarioNode[]) => void;
};
