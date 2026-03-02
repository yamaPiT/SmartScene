import { VehicleState } from './types';

export type Operator = '>' | '<' | '>=' | '<=' | '==' | '!=';
export type ValueType = number | string | boolean;

export type Condition = {
    parameter: keyof VehicleState; // e.g. 'rainLevel'
    operator: Operator;
    value: ValueType;
} | {
    operator: 'OR' | 'AND';
    conditions: Condition[];
};

export type Action = {
    target: keyof VehicleState;    // e.g. 'wiperMode'
    value: ValueType;              // e.g. 'LO'
};

export type BaseNode = {
    id: string;
    description: string;
    reference?: string;
};

export type ScenarioNode = BaseNode & (
    | { type: 'BLOCK'; children: ScenarioNode[] }
    | { type: 'IF'; condition: Condition; thenBody: ScenarioNode; elseBody?: ScenarioNode }
    | { type: 'ACTION'; action: Action }
    | { type: 'RESTORE'; targetPattern: string } // e.g. 'Vehicle.Cabin.Door.*.Window.Position'
    | { type: 'WAIT'; duration: number } // ms
);
