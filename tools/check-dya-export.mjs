import fs from "node:fs";
import path from "node:path";

const exportPath = process.argv[2];

if (!exportPath) {
  console.error("Usage: node tools/check-dya-export.mjs <keyboard-hub.json>");
  process.exit(2);
}

let document;

try {
  document = JSON.parse(fs.readFileSync(exportPath, "utf8"));
} catch (error) {
  console.error(`Cannot read ${exportPath}: ${error.message}`);
  process.exit(2);
}

const keymap = document.keymap;
const errors = [];
const warnings = [];
let rawBindingCount = 0;

if (!keymap || !Array.isArray(keymap.layers)) {
  errors.push("Missing keymap.layers array.");
}

const layers = keymap?.layers ?? [];
const combos = Array.isArray(keymap?.combos) ? keymap.combos : [];
const macros = Array.isArray(keymap?.macros) ? keymap.macros : [];
const modules = Array.isArray(keymap?.modules) ? keymap.modules : [];

if (layers.length !== 8) {
  errors.push(`Expected 8 layers, found ${layers.length}.`);
}

for (const [index, layer] of layers.entries()) {
  const bindingCount = Array.isArray(layer.bindings) ? layer.bindings.length : 0;
  if (bindingCount !== 41) {
    errors.push(`Layer ${index} has ${bindingCount} bindings; expected 41.`);
  }
}

function visit(value, location) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${location}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (value.type === "raw") {
    rawBindingCount += 1;
    if (typeof value.zmk === "string" && value.zmk.startsWith("local-id:")) {
      warnings.push(`${location}: firmware-specific binding ${JSON.stringify(value.zmk)}`);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    visit(child, `${location}.${key}`);
  }
}

visit(combos, "keymap.combos");
visit(macros, "keymap.macros");
visit(layers, "keymap.layers");

const moduleNames = modules.map((module) => module.name ?? "(unnamed)");
const macroNames = macros.map((macro) => macro.name ?? "(unnamed)");

console.log(`DYA export: ${path.basename(exportPath)}`);
console.log(`Layers: ${layers.length} (${layers.map((layer) => layer.bindings?.length ?? 0).join(", ")} bindings)`);
console.log(`Combos: ${combos.length}`);
console.log(`Macros: ${macros.length}${macroNames.length ? ` (${macroNames.join(", ")})` : ""}`);
console.log(`Modules: ${modules.length}${moduleNames.length ? ` (${moduleNames.join(", ")})` : ""}`);
console.log(`Raw bindings: ${rawBindingCount}`);

if (!moduleNames.some((name) => /input|pointer|trackball|mouse/i.test(name))) {
  warnings.push("No runtime pointing-device module is present; preserve and review the overlay defaults separately.");
}

for (const warning of warnings) {
  console.warn(`WARNING: ${warning}`);
}

for (const error of errors) {
  console.error(`ERROR: ${error}`);
}

if (errors.length > 0) {
  process.exit(1);
}

console.log(`Validation passed with ${warnings.length} warning(s).`);
