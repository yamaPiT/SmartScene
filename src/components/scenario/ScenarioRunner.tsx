"use client";

/**
 * @file ScenarioRunner.tsx
 * @description 【スマートシナリオエンジン本体】
 * Zustandストア上のシナリオ定義（AST形式のJSON）を100ms周期で評価し、条件成立時のアクション自動実行や
 * マニュアルオーバーライドの調停を行うバックグラウンドコンポーネント（UIは持たない）。
 * 
 * ■ ソフトウェア要求仕様書（SW105）とのトレーサビリティ:
 * - [REQ-F02] スマートシナリオによる自動制御
 * - [REQ-F03] 手動操作との調停（マニュアルオーバーライド）
 */
import { useEffect, useRef } from "react";
import { useVehicleStore, USER_OVERRIDE_DURATION } from "@/lib/store";
import { ScenarioNode, Condition, Action } from "@/lib/scenarioTypes";

/**
 * @component ScenarioRunner
 * @description 100ms周期のメインループにて現在有効なシナリオツリーを解析（ポーリング）するエンジン本体。
 * `evaluateCondition` にてエッジ検出を判定し、`executeNode` にて非同期実行（WAIT等）を含むツリートラバーサルを行う。
 * また、ドライバーからの手動操作記録（`ManualOverrideFlags`）を監視し、自動制御の介入を一時停止・無効化する責任も持つ。
 * @returns {null} UIを持たないためnullを返す
 */
export const ScenarioRunner = () => {
    const { scenarios } = useVehicleStore();
    const ignition = useVehicleStore(s => s["Vehicle.IgnitionState"]);

    // -------------------------------------------------------------
    // 【シナリオエンジンの内部状態】
    // runningSequences: WAIT（待機）を含む非同期ブロックが現在実行中かを判定するためのロック（多重実行防止）
    // prevConditionStates: IFノードの条件が「前回評価時にTrueだったか」を記録（エッジ検出用）
    // -------------------------------------------------------------
    const runningSequences = useRef<Set<string>>(new Set());
    const prevConditionStates = useRef<Record<string, boolean>>({});

    useEffect(() => {
        if (ignition === 'STOP') {
            runningSequences.current.clear();
            prevConditionStates.current = {};
            return;
        }

        const evaluateCondition = (state: any, cond: Condition): boolean => {
            if ('conditions' in cond) {
                if (cond.operator === 'OR') {
                    return cond.conditions.some(c => evaluateCondition(state, c));
                } else {
                    return cond.conditions.every(c => evaluateCondition(state, c));
                }
            }

            const val = state[cond.parameter]; // VSS direct access
            const target = cond.value;

            switch (cond.operator) {
                case '>': return val > target;
                case '<': return val < target;
                case '>=': return val >= target;
                case '<=': return val <= target;
                case '==': return val == target;
                case '!=': return val != target;
                default: return false;
            }
        };

        const executeNode = async (node: ScenarioNode) => {
            const state = useVehicleStore.getState();

            if (node.type === 'BLOCK') {
                for (const child of node.children) {
                    await executeNode(child);
                }
            }
            else if (node.type === 'IF') {
                const currentConditionTrue = evaluateCondition(state, node.condition);
                const prevConditionTrue = !!prevConditionStates.current[node.id];

                // -------------------------------------------------------------
                // 【ポジティブ・エッジ検出 (Positive Edge Detection)】
                // 条件が「False から True に切り替わった瞬間」のみをトリガーとして捉えます。
                // ずっと条件を満たし続けている場合（例：雨がずっと降っている）に、
                // 毎秒アクションが発動してユーザーの操作を妨害するのを防ぎます。
                // -------------------------------------------------------------
                if (currentConditionTrue && !prevConditionTrue) {
                    // Positive Edge Detected! Reset overrides and set trigger.
                    // 新たなシナリオが発火したため、過去の手動オーバーライド記録を一掃し、
                    // このシナリオの制御を最優先にします。
                    const updates: any = {};
                    updates["Internal.ActiveScenarioTrigger"] = node.id;
                    updates["Internal.ManualOverrideFlags"] = {};
                    state.updateState(updates);
                }

                prevConditionStates.current[node.id] = currentConditionTrue;

                if (currentConditionTrue) {
                    const blockId = node.thenBody.type === 'BLOCK' ? node.thenBody.id : node.id;

                    // Avoid re-entry for running sequences (simple lock)
                    // すでに実行中のブロック（WAITで待機中など）には再入しない
                    if (runningSequences.current.has(blockId)) return;

                    // Determine if we need to lock (if contains WAIT)
                    // ブロック内にWAIT（非同期待機）が含まれるか簡易チェックし、
                    // 含まれる場合はロック用の runningSequences にブロックIDを登録して実行
                    const containsWait = JSON.stringify(node.thenBody).includes('"type":"WAIT"');

                    if (containsWait) {
                        runningSequences.current.add(blockId);
                        try {
                            await executeNode(node.thenBody);
                        } finally {
                            // 実行が完全に終わったらロックを解除
                            runningSequences.current.delete(blockId);
                        }
                    } else {
                        executeNode(node.thenBody);
                    }
                } else if (node.elseBody) {
                    executeNode(node.elseBody);
                }
            }
            else if (node.type === 'RESTORE') {
                // 雨が降る直前の状態（PreRunStateCache）を直接参照して復元する。
                // 復元後、キャッシュの当該キーを削除することで毎サイクルの再ループを防止。
                const memory = { ...(state["Internal.PreRunStateCache"] || {}) } as any;
                const currentTargets = state["Internal.WindowTarget"] || {};
                const updates: Partial<any> = {};

                if (node.targetPattern === 'Vehicle.Cabin.Window.*.Position') {
                    // Extract only cached window positions to update WindowTarget
                    const windowTargets: Record<string, number> = {};
                    const targets = [
                        { key: 'FL', prop: 'Vehicle.Cabin.Window.$FrontLeft.Position' },
                        { key: 'FR', prop: 'Vehicle.Cabin.Window.$FrontRight.Position' },
                        { key: 'RL', prop: 'Vehicle.Cabin.Window.$RearLeft.Position' },
                        { key: 'RR', prop: 'Vehicle.Cabin.Window.$RearRight.Position' }
                    ];

                    targets.forEach(t => {
                        // User Override の有無に関わらず、必ず雨降り前の状態に戻す
                        if (memory[t.prop] !== undefined) {
                            windowTargets[t.key] = memory[t.prop];
                            delete memory[t.prop]; // 1回だけリストアするためにキャッシュから削除
                        }
                    });

                    // Only update WindowTarget if we actually have overrides to apply
                    if (Object.keys(windowTargets).length > 0) {
                        updates["Internal.WindowTarget"] = {
                            ...currentTargets,
                            ...windowTargets
                        };
                        updates["Internal.PreRunStateCache"] = memory;
                    }
                } else if (memory[node.targetPattern] !== undefined) {
                    updates[node.targetPattern] = memory[node.targetPattern];
                    delete memory[node.targetPattern];
                    updates["Internal.PreRunStateCache"] = memory;
                }

                if (Object.keys(updates).length > 0) {
                    state.updateState(updates);
                }
            }
            else if (node.type === 'ACTION') {
                const flags = state["Internal.ManualOverrideFlags"] || {};

                // -------------------------------------------------------------
                // 【マニュアルオーバーライド (手動優先) 判定】
                // ユーザーが手動で操作した部位(Flagsに記録あり)は、シナリオが勝手に変更しないようブロックします。
                // ただし、灯火類（ウインカーやハザード）はシナリオ主導で動かすことが多いため例外(Whitelist)とします。
                // -------------------------------------------------------------
                const isWhitelisted = node.action.target.includes("DirectionIndicator") || node.action.target.includes("Hazard");

                if (flags[node.action.target] && !isWhitelisted) {
                    // Skip action if there's a manual override flag explicitly logged for this variable
                    return;
                }

                // ** OVERRIDE CHECK **
                // Storeで定義された USER_OVERRIDE_DURATION (例:3秒) 以内にユーザー操作があった場合も
                // 一時的にシナリオの実行をブロックし、ユーザー操作とAIの「操作の取り合い(チャタリング)」を防ぎます。
                const lastInteract = state.lastUserInteract[node.action.target] || 0;
                if (Date.now() - lastInteract < USER_OVERRIDE_DURATION) {
                    return;
                }

                // もしアクションの対象が窓の開度（Position）なら、即座に値を設定するのではなく
                // Internal.WindowTarget を経由してSimulator.tsxの物理ループでスムーズにアニメーションさせる
                if (node.action.target.includes('.Window.') && node.action.target.includes('.Position')) {
                    // OSDVI 202603α準拠の $Instance パスからキーを抽出する
                    // 例: "Vehicle.Cabin.Window.$FrontLeft.Position" → "FL"
                    const instanceMap: Record<string, string> = {
                        '$FrontLeft': 'FL',
                        '$FrontRight': 'FR',
                        '$RearLeft': 'RL',
                        '$RearRight': 'RR',
                    };
                    const instanceMatch = node.action.target.match(/\.\$(\w+)\./);
                    const instanceKey = instanceMatch ? instanceMap[`$${instanceMatch[1]}`] : null;

                    if (instanceKey) {
                        const currentTargets = state["Internal.WindowTarget"] || {};
                        state.updateState({
                            "Internal.WindowTarget": {
                                ...currentTargets,
                                [instanceKey]: node.action.value as number
                            }
                        });
                    }
                } else {
                    // 窓以外のアクション: 即座に適用
                    state.updateState({ [node.action.target]: node.action.value });
                }
            }
            else if (node.type === 'WAIT') {
                // console.log(`[Scenario] WAIT ${node.duration}ms`);
                await new Promise(resolve => setTimeout(resolve, node.duration));
            }
        };

        // -------------------------------------------------------------
        // 【エンジンのメインループ】
        // 100ms周期で全てのシナリオツリーをルートから評価(executeNode)し続けます。
        // （VSSの状態が変更されたタイミングでのイベント駆動ではなく、
        //   ゲームエンジンのようにループの中で毎フレーム状態を監視する「ポーリング型」を採用しています）
        // -------------------------------------------------------------
        const interval = setInterval(() => {
            scenarios.forEach(scenario => {
                executeNode(scenario);
            });
        }, 100);

        return () => clearInterval(interval);
    }, [ignition, scenarios]);

    return null;
};
