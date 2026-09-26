const KEYBOARD_SCHEMA = "https://abyss.keyboard-hub.com/schemas/keyboard/v1.json";
const KEYMAP_SCHEMA = "https://abyss.keyboard-hub.com/schemas/keymap/v1.json";
const EXPECTED_LAYER_COUNT = 8;
const EXPECTED_BINDING_COUNT = 41;
const MAX_RUNTIME_COMBOS = 16;
const MAX_RUNTIME_MACROS = 16;

const SUPPORTED_BINDING_TYPES = new Set([
  "bluetooth",
  "bootloader",
  "key",
  "lt",
  "mo",
  "mouse_button",
  "mt",
  "raw",
  "to",
  "trans",
]);

export class ExportValidationError extends Error {
  constructor(errors, warnings = []) {
    super(errors.join("\n"));
    this.name = "ExportValidationError";
    this.errors = errors;
    this.warnings = warnings;
  }
}

function walk(value, location, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${location}[${index}]`, visitor));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  visitor(value, location);
  for (const [key, child] of Object.entries(value)) {
    walk(child, `${location}.${key}`, visitor);
  }
}

function validateRawBinding(binding, location, errors, warnings) {
  if (typeof binding.zmk !== "string" || binding.zmk.trim() === "") {
    errors.push(`${location}: raw bindingにZMK表現がありません。`);
    return;
  }

  const zmk = binding.zmk.trim();
  if (zmk.startsWith("local-id:")) {
    if (zmk === "local-id:50397 134676523 0") {
      warnings.push(`${location}: WindowsTabを既知のZMK表現へ変換します。`);
      return;
    }
    errors.push(`${location}: 未知のlocal-idは安全に変換できません (${zmk})。`);
    return;
  }

  if (!zmk.startsWith("&") || /[<>{};\r\n]/u.test(zmk)) {
    errors.push(`${location}: 安全でないraw bindingです (${JSON.stringify(zmk)})。`);
  }
}

export function inspectExport({ jsonText, keymapText, jsonName = "", keymapName = "" }) {
  const errors = [];
  const warnings = [];
  let document;

  try {
    document = JSON.parse(jsonText);
  } catch (error) {
    return {
      valid: false,
      errors: [`KeyboardHub JSONを読み取れません: ${error.message}`],
      warnings,
      document: null,
      summary: null,
    };
  }

  if (jsonName && !/\.keyboard-hub(?: \(\d+\))?\.json$/iu.test(jsonName)) {
    warnings.push("JSONファイル名が通常のKeyboardHub形式と異なります。");
  }
  if (keymapName && !/\.keymap$/iu.test(keymapName)) {
    errors.push("2つ目のファイルは.keymap形式ではありません。");
  }

  if (document.$schema !== KEYBOARD_SCHEMA) {
    errors.push(`未対応のKeyboardHubスキーマです: ${document.$schema ?? "なし"}`);
  }

  const keymap = document.keymap;
  if (!keymap || typeof keymap !== "object") {
    errors.push("keymapオブジェクトがありません。");
  } else if (keymap.$schema !== KEYMAP_SCHEMA) {
    errors.push(`未対応のkeymapスキーマです: ${keymap.$schema ?? "なし"}`);
  }

  if (String(keymap?.keyboard ?? "").toLowerCase() !== "frostortho") {
    errors.push(`FrostOrtho用のエクスポートではありません: ${keymap?.keyboard ?? "識別子なし"}`);
  }

  const positions = Array.isArray(document.layout?.positions) ? document.layout.positions : [];
  if (positions.length !== EXPECTED_BINDING_COUNT) {
    errors.push(`物理レイアウトが${positions.length}キーです（必要: ${EXPECTED_BINDING_COUNT}キー）。`);
  }

  const layers = Array.isArray(keymap?.layers) ? keymap.layers : [];
  const combos = Array.isArray(keymap?.combos) ? keymap.combos : [];
  const macros = Array.isArray(keymap?.macros) ? keymap.macros : [];
  const modules = Array.isArray(keymap?.modules) ? keymap.modules : [];

  if (layers.length !== EXPECTED_LAYER_COUNT) {
    errors.push(`レイヤー数が${layers.length}です（必要: ${EXPECTED_LAYER_COUNT}）。`);
  }

  layers.forEach((layer, index) => {
    const bindings = Array.isArray(layer?.bindings) ? layer.bindings : [];
    if (bindings.length !== EXPECTED_BINDING_COUNT) {
      errors.push(`レイヤー${index + 1}が${bindings.length}キーです（必要: ${EXPECTED_BINDING_COUNT}キー）。`);
    }
  });

  if (combos.length > MAX_RUNTIME_COMBOS) {
    errors.push(`コンボが${combos.length}件あります（上限: ${MAX_RUNTIME_COMBOS}件）。`);
  }
  if (macros.length > MAX_RUNTIME_MACROS) {
    errors.push(`マクロが${macros.length}件あります（上限: ${MAX_RUNTIME_MACROS}件）。`);
  }

  combos.forEach((combo, index) => {
    const positionsForCombo = Array.isArray(combo?.positions) ? combo.positions : [];
    if (positionsForCombo.length < 2) {
      errors.push(`コンボ${index + 1}のキー数が不足しています。`);
    }
    if (positionsForCombo.some((position) => !Number.isInteger(position) || position < 0 || position >= EXPECTED_BINDING_COUNT)) {
      errors.push(`コンボ${index + 1}に範囲外のキー位置があります。`);
    }
    if (!combo?.binding) {
      errors.push(`コンボ${index + 1}に出力キーがありません。`);
    }
  });

  macros.forEach((macro, index) => {
    if (!Array.isArray(macro?.bindings) || macro.bindings.length === 0) {
      errors.push(`マクロ${index + 1}に操作がありません。`);
    }
  });

  const typeCounts = {};
  let rawBindingCount = 0;
  walk(keymap, "keymap", (value, location) => {
    if (typeof value.type !== "string") {
      return;
    }

    typeCounts[value.type] = (typeCounts[value.type] ?? 0) + 1;
    if (value.type === "raw") {
      rawBindingCount += 1;
      validateRawBinding(value, location, errors, warnings);
    } else if (value.type !== "rotary_encoder" && !SUPPORTED_BINDING_TYPES.has(value.type)) {
      errors.push(`${location}: 未対応のbinding種別です (${value.type})。`);
    }
  });

  if (!/Generated by Keyboard Abyss/iu.test(keymapText) || !/compatible\s*=\s*"zmk,keymap"/u.test(keymapText)) {
    errors.push(".keymapファイルがKeyboard AbyssのZMKエクスポートとして認識できません。");
  }

  const exportedLayerCount = keymapText.match(/\bbindings\s*=\s*</gu)?.length ?? 0;
  if (exportedLayerCount !== EXPECTED_LAYER_COUNT) {
    errors.push(`.keymapファイル内のレイヤー数が${exportedLayerCount}です（必要: ${EXPECTED_LAYER_COUNT}）。`);
  }

  if (!modules.some((module) => module?.type === "rotary_encoder")) {
    warnings.push("ロータリーエンコーダー情報がありません。既存のセンサー設定は保持されます。");
  }
  warnings.push("AML・トラックボール設定はエクスポートに含まれないため、既存設定を保持します。");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    document,
    summary: {
      keyboard: keymap?.keyboard ?? "",
      name: keymap?.name ?? "",
      layers: layers.length,
      keys: layers.reduce((total, layer) => total + (layer?.bindings?.length ?? 0), 0),
      combos: combos.length,
      macros: macros.length,
      modules: modules.length,
      rawBindings: rawBindingCount,
      typeCounts,
    },
  };
}

export function requireValidExport(input) {
  const result = inspectExport(input);
  if (!result.valid) {
    throw new ExportValidationError(result.errors, result.warnings);
  }
  return result;
}

