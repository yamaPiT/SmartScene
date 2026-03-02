import { Simulator } from "@/components/vehicle/Simulator";
import { ScenarioEditor } from "@/components/scenario/ScenarioEditor";
import { ScenarioRunner } from "@/components/scenario/ScenarioRunner";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-gray-200 p-8 flex flex-col items-center">
      <header className="mb-8 text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          SmartScene Simulator
        </h1>
        <p className="text-gray-500 text-sm">VSS Compliant Vehicle Simulation & Scenario Engine</p>
      </header>

      {/* Main Grid Layout: Side-by-Side on XL screens */}
      <div className="w-full max-w-[1800px] grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <Simulator />
        <ScenarioEditor />
      </div>

      <ScenarioRunner />
    </main>
  );
}
