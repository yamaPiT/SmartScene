"use client";

import { useEffect, useRef } from "react";
import { useVehicleStore, USER_OVERRIDE_DURATION } from "@/lib/store";
import { ScenarioNode, Condition, Action } from "@/lib/scenarioTypes";

export const ScenarioRunner = () => {
    const { scenarios } = useVehicleStore();
    const ignition = useVehicleStore(s => s["Vehicle.IgnitionState"]);
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

                if (currentConditionTrue && !prevConditionTrue) {
                    // Positive Edge Detected! Reset overrides and set trigger.
                    const updates: any = {};
                    updates["Internal.ActiveScenarioTrigger"] = node.id;
                    updates["Internal.ManualOverrideFlags"] = {};
                    state.updateState(updates);
                }

                prevConditionStates.current[node.id] = currentConditionTrue;

                if (currentConditionTrue) {
                    const blockId = node.thenBody.type === 'BLOCK' ? node.thenBody.id : node.id;

                    // Avoid re-entry for running sequences (simple lock)
                    if (runningSequences.current.has(blockId)) return;

                    // Determine if we need to lock (if contains WAIT)
                    // A deep check is better, but simple stringify check is robust enough for MVP
                    const containsWait = JSON.stringify(node.thenBody).includes('"type":"WAIT"');

                    if (containsWait) {
                        runningSequences.current.add(blockId);
                        try {
                            await executeNode(node.thenBody);
                        } finally {
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
                const memory = (state["Internal.UserMemoryState"] || {}) as any;
                const flags = state["Internal.ManualOverrideFlags"] || {};
                const currentTargets = state["Internal.WindowTarget"] || {};
                const updates: Partial<any> = {};

                if (node.targetPattern === 'Vehicle.Cabin.Door.*.Window.Position') {
                    // Extract only cached window positions to update WindowTarget
                    const windowTargets: Record<string, number> = {};
                    const targets = [
                        { key: 'FL', prop: 'Vehicle.Cabin.Door.Row1.Left.Window.Position' },
                        { key: 'FR', prop: 'Vehicle.Cabin.Door.Row1.Right.Window.Position' },
                        { key: 'RL', prop: 'Vehicle.Cabin.Door.Row2.Left.Window.Position' },
                        { key: 'RR', prop: 'Vehicle.Cabin.Door.Row2.Right.Window.Position' }
                    ];

                    targets.forEach(t => {
                        if (t.prop in memory && !flags[t.prop]) {
                            windowTargets[t.key] = memory[t.prop];
                        }
                    });

                    // Only update WindowTarget if we actually have overrides to apply to prevent unnecessarily triggering updates
                    if (Object.keys(windowTargets).length > 0) {
                        updates["Internal.WindowTarget"] = {
                            ...currentTargets,
                            ...windowTargets
                        };
                    }
                } else if (node.targetPattern in memory) {
                    if (!flags[node.targetPattern]) {
                        // Exact property match (e.g. Wiper Mode, Defrosters)
                        updates[node.targetPattern] = memory[node.targetPattern];
                    }
                }

                if (Object.keys(updates).length > 0) {
                    state.updateState(updates);
                }
            }
            else if (node.type === 'ACTION') {
                const flags = state["Internal.ManualOverrideFlags"] || {};

                // Whitelist: DirectionIndicator and Hazard are exempt from manual override blocks
                const isWhitelisted = node.action.target.includes("DirectionIndicator") || node.action.target.includes("Hazard");

                if (flags[node.action.target] && !isWhitelisted) {
                    // Skip action if there's a manual override flag explicitly logged for this variable
                    return;
                }

                // ** OVERRIDE CHECK **
                const lastInteract = state.lastUserInteract[node.action.target] || 0;
                if (Date.now() - lastInteract < USER_OVERRIDE_DURATION) {
                    return;
                }

                // If Action targets a Window Position, animate it by setting Target instead of direct teleport
                if (node.action.target.includes('.Window.Position')) {
                    const windowMatch = node.action.target.match(/Door\.(Row[12])\.(Left|Right)\.Window/);
                    if (windowMatch) {
                        const row = windowMatch[1];
                        const side = windowMatch[2];
                        const key = `${row === 'Row1' ? 'F' : 'R'}${side === 'Left' ? 'L' : 'R'}`; // e.g., 'FL'

                        const currentTargets = state["Internal.WindowTarget"] || {};
                        state.updateState({
                            "Internal.WindowTarget": {
                                ...currentTargets,
                                [key]: node.action.value as number
                            }
                        });
                    }
                } else {
                    // Normal Action: Execute immediately
                    state.updateState({ [node.action.target]: node.action.value });
                }
            }
            else if (node.type === 'WAIT') {
                // console.log(`[Scenario] WAIT ${node.duration}ms`);
                await new Promise(resolve => setTimeout(resolve, node.duration));
            }
        };

        const interval = setInterval(() => {
            scenarios.forEach(scenario => {
                executeNode(scenario);
            });
        }, 100);

        return () => clearInterval(interval);
    }, [ignition, scenarios]);

    return null;
};
