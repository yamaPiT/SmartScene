"use client";

/**
 * @file ScenarioEditor.tsx
 * @description 【APIビューア (シミュレータUI部)】
 * Zustandストアからシナリオ（AST）を読み込み、自然言語の要件と対応するOSDVI API（202603α）の
 * コード表現をRead-Onlyで表示するUIコンポーネント。
 * 
 * ■ ソフトウェア要求仕様書（SW105）とのトレーサビリティ:
 * - 5.1 外部インタフェース要求 (APIビューア)
 */

import { useVehicleStore } from "@/lib/store";
import { ScenarioBlock } from "./ScenarioBlock";
import { Code } from "lucide-react";

/**
 * @component ScenarioEditor
 * @description シナリオの自然言語表現と内部API（OSDVI）コードを併記表示するビューアコンポーネント。
 * @returns {JSX.Element} シナリオリストを描画したUI
 */
export const ScenarioEditor = () => {
    const { scenarios } = useVehicleStore();

    return (
        <div className="w-full bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl xl:h-[1040px] flex flex-col">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950 shrink-0">
                <div className="flex items-center gap-2 text-white font-bold">
                    <Code size={20} className="text-purple-500" />
                    SCENARIO VIEWER (自然言語 & API併記)
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 gap-6 overflow-y-auto flex-1">
                {scenarios.map((scenario, idx) => (
                    <div key={scenario.id || idx} className="relative group">
                        <div className="absolute top-2 right-2 text-xs text-gray-600 font-mono">ID: {scenario.id}</div>
                        <ScenarioBlock node={scenario} />
                    </div>
                ))}
            </div>

            <div className="p-4 bg-gray-950 border-t border-gray-800 text-xs text-gray-500 shrink-0">
                * Read-Only. 自然言語の要求仕様とOSDVI標準APIのコード表現の対応関係を確認できます。
            </div>
        </div>
    );
};
