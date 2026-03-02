"use client";

import { ScenarioNode, Condition } from "@/lib/scenarioTypes";
import { Clock, GitBranch, Zap, Layers } from "lucide-react";

interface ScenarioBlockProps {
    node: ScenarioNode;
    depth?: number;
}

const renderCondition = (cond: Condition): string => {
    if ('conditions' in cond) {
        return cond.conditions.map(c => `(${renderCondition(c)})`).join(` ${cond.operator} `);
    }
    return `${cond.parameter} ${cond.operator} ${String(cond.value)}`;
};

export const ScenarioBlock = ({ node, depth = 0 }: ScenarioBlockProps) => {

    const renderHeader = (icon: React.ReactNode, title: string, desc: string, refText?: string) => (
        <div className="flex flex-col gap-1 mb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-200">
                {icon}
                <span>{title}</span>
                {desc && <span className="ml-2 font-normal text-gray-400">{desc}</span>}
            </div>
            {refText && (
                <div className="text-[11px] text-green-400 font-mono italic ml-6">
                    {refText}
                </div>
            )}
        </div>
    );

    if (node.type === 'BLOCK') {
        return (
            <div className="flex flex-col gap-2 p-3 border border-dashed border-gray-700 rounded bg-gray-900/50">
                {renderHeader(<Layers size={16} className="text-gray-400" />, `BLOCK`, node.description, node.reference)}

                <div className="pl-4 border-l border-gray-700 flex flex-col gap-3">
                    {node.children.map((child, i) => (
                        <ScenarioBlock key={child.id || i} node={child} depth={depth + 1} />
                    ))}
                </div>
            </div>
        );
    }

    if (node.type === 'IF') {
        return (
            <div className="flex flex-col gap-2 p-3 border border-blue-900/40 bg-blue-900/10 rounded">
                {renderHeader(<GitBranch size={16} className="text-blue-400" />, "IF", node.description, node.reference)}

                <div className="ml-6 bg-gray-950 p-2 rounded text-[11px] font-mono text-blue-300 border border-gray-800 break-all">
                    IF {renderCondition(node.condition)}
                </div>

                <div className="pl-4 border-l-2 border-blue-800 space-y-3 mt-2">
                    <div className="text-xs font-bold text-blue-400">THEN</div>
                    <ScenarioBlock node={node.thenBody} depth={depth + 1} />
                    {node.elseBody && (
                        <>
                            <div className="text-xs font-bold text-gray-400 mt-2">ELSE</div>
                            <ScenarioBlock node={node.elseBody} depth={depth + 1} />
                        </>
                    )}
                </div>
            </div>
        );
    }

    if (node.type === 'ACTION') {
        return (
            <div className="flex flex-col gap-2 p-3 bg-green-900/10 border border-green-900/30 rounded">
                {renderHeader(<Zap size={16} className="text-green-500" />, "ACTION", node.description, node.reference)}

                <div className="ml-6 bg-gray-950 p-2 rounded text-[11px] font-mono flex items-center gap-2 border border-gray-800 overflow-hidden">
                    <span className="text-green-400 shrink-0">SET</span>
                    <span className="text-green-200 break-all">{node.action.target}</span>
                    <span className="text-gray-500 shrink-0">=</span>
                    <span className="text-white shrink-0 font-bold">{String(node.action.value)}</span>
                </div>
            </div>
        );
    }

    if (node.type === 'WAIT') {
        return (
            <div className="flex flex-col gap-2 p-3 bg-amber-900/10 border border-amber-900/30 rounded">
                {renderHeader(<Clock size={16} className="text-amber-500" />, "WAIT", node.description, node.reference)}

                <div className="ml-6 bg-gray-950 p-2 rounded text-[11px] font-mono flex items-center gap-2 border border-gray-800">
                    <span className="text-amber-400">WAIT</span>
                    <span className="text-amber-200">{node.duration}ms</span>
                </div>
            </div>
        );
    }

    return null;
};
