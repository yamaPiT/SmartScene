import { describe, it, expect, beforeEach } from 'vitest';
import { useVehicleStore } from './store';

describe('useVehicleStore', () => {

    beforeEach(() => {
        // 各テスト実行前にストアの状態を初期化（新規状態を生成する効果）
        useVehicleStore.setState(useVehicleStore.getInitialState());
    });

    describe('1. Initial State (初期状態)', () => {
        it('IgnitionStateの初期値は STOP であること', () => {
            const state = useVehicleStore.getState();
            expect(state["Vehicle.IgnitionState"]).toBe('STOP');
        });

        it('デフォルトの2つのシナリオが登録されていること', () => {
            const state = useVehicleStore.getState();
            expect(state.scenarios).toHaveLength(2);
            expect(state.scenarios[0].id).toBe('scenario-rain');
            expect(state.scenarios[1].id).toBe('scenario-hazard');
        });

        it('各種アクチュエータおよび設定が初期状態であること', () => {
            const state = useVehicleStore.getState();
            expect(state["Vehicle.Speed"]).toBe(0);
            expect(state["Vehicle.Exterior.Air.RainIntensity"]).toBe(0);
            expect(state["Vehicle.Body.Windshield.Wiper.Mode"]).toBe('OFF');
            expect(state["Vehicle.Cabin.HVAC.AmbientAirTemperature"]).toBe(25.0);
            expect(state["Internal.LaneChangeStatus"]).toBe('NONE');
        });
    });

    describe('2. Scenario Management (シナリオ管理)', () => {
        it('addScenario: 新規シナリオを正しく追加できること', () => {
            const newScenario: any = { id: 'scenario-test', type: 'BLOCK', children: [] };
            useVehicleStore.getState().addScenario(newScenario);

            const state = useVehicleStore.getState();
            expect(state.scenarios).toHaveLength(3);
            expect(state.scenarios[2].id).toBe('scenario-test');
        });

        it('addScenario: 既存IDのシナリオは追加されないこと', () => {
            const duplicateScenario: any = { id: 'scenario-rain', type: 'BLOCK', children: [] };
            useVehicleStore.getState().addScenario(duplicateScenario);

            const state = useVehicleStore.getState();
            // 初期状態の2つのまま
            expect(state.scenarios).toHaveLength(2);
        });

        it('updateScenario: 指定したシナリオの内容を更新できること', () => {
            const updatedScenario: any = { id: 'scenario-rain', description: 'Updated Rain Scenario', type: 'BLOCK', children: [] };
            useVehicleStore.getState().updateScenario('scenario-rain', updatedScenario);

            const state = useVehicleStore.getState();
            expect(state.scenarios[0].description).toBe('Updated Rain Scenario');
        });

        it('setScenarioRunning: true の際、フラグとキャッシュが初期化されること', () => {
            // 前もって窓を少し開けておく
            useVehicleStore.getState().setVss("Vehicle.Cabin.Door.Row1.Left.Window.Position", 50);

            useVehicleStore.getState().setScenarioRunning(true);
            const state = useVehicleStore.getState();

            expect(state.isScenarioRunning).toBe(true);
            expect(state["Internal.PreRunStateCache"]["Vehicle.Cabin.Door.Row1.Left.Window.Position"]).toBe(50);
            expect(state["Internal.ManualOverrideFlags"]).toEqual({});
        });

        it('setScenarioRunning: false の際、フラグとキャッシュがクリアされること', () => {
            useVehicleStore.getState().setScenarioRunning(true); // 一度開始
            useVehicleStore.getState().setScenarioRunning(false); // その後停止

            const state = useVehicleStore.getState();
            expect(state.isScenarioRunning).toBe(false);
            expect(state["Internal.PreRunStateCache"]).toEqual({});
            expect(state["Internal.ManualOverrideFlags"]).toEqual({});
        });
    });

    describe('3. setVss: State Update Logic (依存ロジック)', () => {

        it('一般的な値の更新ができること', () => {
            useVehicleStore.getState().setVss('Vehicle.Speed', 60);
            expect(useVehicleStore.getState()["Vehicle.Speed"]).toBe(60);
        });

        it('イグニッションが STOP になった際、各アクチュエータが一斉リセットされること', () => {
            const store = useVehicleStore.getState();
            // 仮にいろいろONにする
            store.setVss("Vehicle.Body.Windshield.Wiper.Mode", 'HI');
            store.setVss("Vehicle.Cabin.HVAC.IsFrontDefrosterActive", true);
            store.setVss("Vehicle.Body.Lights.Hazard.IsSignaling", true);

            // STOPに遷移
            store.setVss("Vehicle.IgnitionState", "STOP");

            const updatedState = useVehicleStore.getState();
            expect(updatedState["Vehicle.Body.Windshield.Wiper.Mode"]).toBe('OFF');
            expect(updatedState["Vehicle.Cabin.HVAC.IsFrontDefrosterActive"]).toBe(false);
            expect(updatedState["Vehicle.Body.Lights.Hazard.IsSignaling"]).toBe(false);
            expect(updatedState["Internal.ActiveScenarioTrigger"]).toBeNull();
        });

        it('雨量 (RainIntensity) の境界判定により WasRainBelow10 フラグが変化すること', () => {
            const store = useVehicleStore.getState();
            
            // 0 -> 15 (10以上への遷移)
            store.setVss("Vehicle.Exterior.Air.RainIntensity", 15);
            expect(useVehicleStore.getState()["Internal.WasRainBelow10"]).toBe(true);

            // 15 -> 20 (引き続き10以上)
            store.setVss("Vehicle.Exterior.Air.RainIntensity", 20);
            expect(useVehicleStore.getState()["Internal.WasRainBelow10"]).toBe(false);

            // 20 -> 5 (10未満へ戻る)
            store.setVss("Vehicle.Exterior.Air.RainIntensity", 5);
            expect(useVehicleStore.getState()["Internal.WasRainBelow10"]).toBe(true);
        });

        it('イグニッションが START 時に UserMemoryState が初期化されること', () => {
            const store = useVehicleStore.getState();
            store.setVss("Vehicle.Cabin.Door.Row1.Left.Window.Position", 30);
            
            store.setVss("Vehicle.IgnitionState", "START");
            
            const state = useVehicleStore.getState();
            expect(state["Internal.UserMemoryState"]["Vehicle.Cabin.Door.Row1.Left.Window.Position"]).toBe(30);
            // ワイパーなどはOFFで初期化される指定
            expect(state["Internal.UserMemoryState"]["Vehicle.Body.Windshield.Wiper.Mode"]).toBe('OFF');
        });

        it('イグニッション START 中に手動操作された際、ManualOverrideFlag と UserMemoryState が更新されること', () => {
            const store = useVehicleStore.getState();
            
            // イグニッションONの状態にする
            store.setVss("Vehicle.IgnitionState", "START");

            // その後ワイパーを手動でHIにする
            store.setVss("Vehicle.Body.Windshield.Wiper.Mode", "HI");

            const state = useVehicleStore.getState();
            expect(state["Internal.ManualOverrideFlags"]["Vehicle.Body.Windshield.Wiper.Mode"]).toBe(true);
            expect(state["Internal.UserMemoryState"]["Vehicle.Body.Windshield.Wiper.Mode"]).toBe("HI");
        });
    });

    describe('4. recordUserInteraction', () => {
        it('プロパティを変更した際、lastUserInteract が更新されること', () => {
            const store = useVehicleStore.getState();
            
            // まだ記録がない
            expect(store.lastUserInteract["Vehicle.Speed"]).toBeUndefined();

            store.setVss("Vehicle.Speed", 40);

            const updatedState = useVehicleStore.getState();
            expect(updatedState.lastUserInteract["Vehicle.Speed"]).toBeGreaterThan(0); // 現在時刻がミリ秒で記録されるはず
        });
    });

});
