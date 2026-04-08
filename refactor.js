const fs = require('fs');

const replacements = [
  ['Vehicle.Cabin.Door.Row1.Left.Window.Position', 'Vehicle.Cabin.Window.$FrontLeft.Position'],
  ['Vehicle.Cabin.Door.Row1.Right.Window.Position', 'Vehicle.Cabin.Window.$FrontRight.Position'],
  ['Vehicle.Cabin.Door.Row2.Left.Window.Position', 'Vehicle.Cabin.Window.$RearLeft.Position'],
  ['Vehicle.Cabin.Door.Row2.Right.Window.Position', 'Vehicle.Cabin.Window.$RearRight.Position'],
  ['Vehicle.Cabin.HVAC.IsFrontDefrosterActive', 'Vehicle.Exterior.Light.Defogger.IsActive'],
  ['Vehicle.Cabin.HVAC.IsRearDefrosterActive', 'Vehicle.Exterior.Light.Defogger.IsActive'],
];

const filesToProcess = [
  'src/lib/types.ts',
  'src/lib/store.ts',
  'src/lib/store.test.ts',
  'src/lib/scenarioTypes.ts',
  'src/components/vehicle/CarModel3D.tsx',
  'src/components/vehicle/ControlPanel.tsx',
  'src/components/vehicle/Simulator.tsx',
  'src/components/scenario/ScenarioRunner.tsx',
];

for (const file of filesToProcess) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Exact replacements
    for (const [oldKey, newKey] of replacements) {
      // Split and join to replace all occurrences
      content = content.split(oldKey).join(newKey);
    }
    
    // RegEx replacements for patterns like Vehicle.Cabin.Door.*.Window.Position
    content = content.replace(/Vehicle\.Cabin\.Door\.\*\.Window\.Position/g, 'Vehicle.Cabin.Window.*.Position');

    fs.writeFileSync(file, content);
    console.log(`Refactored ${file}`);
  }
}
