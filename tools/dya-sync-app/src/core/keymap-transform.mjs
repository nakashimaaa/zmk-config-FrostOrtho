const KNOWN_LOCAL_BINDINGS = new Map([
  ["local-id:50397 134676523 0", "&kp LG(TAB)"],
]);

const KEYBOARD_USAGES = new Map([
  ...Array.from({ length: 26 }, (_, index) => [0x04 + index, String.fromCharCode(65 + index)]),
  [0x1e, "N1"], [0x1f, "N2"], [0x20, "N3"], [0x21, "N4"], [0x22, "N5"],
  [0x23, "N6"], [0x24, "N7"], [0x25, "N8"], [0x26, "N9"], [0x27, "N0"],
  [0x28, "ENTER"], [0x29, "ESCAPE"], [0x2a, "BACKSPACE"], [0x2b, "TAB"],
  [0x2c, "SPACE"], [0x2d, "MINUS"], [0x2e, "EQUAL"], [0x2f, "LEFT_BRACKET"],
  [0x30, "RIGHT_BRACKET"], [0x31, "BACKSLASH"], [0x32, "NON_US_HASH"],
  [0x33, "SEMICOLON"], [0x34, "SQT"], [0x35, "GRAVE"], [0x36, "COMMA"],
  [0x37, "PERIOD"], [0x38, "SLASH"], [0x39, "CAPSLOCK"],
  ...Array.from({ length: 12 }, (_, index) => [0x3a + index, `F${index + 1}`]),
  [0x46, "PRINTSCREEN"], [0x47, "SCROLLLOCK"], [0x48, "PAUSE_BREAK"],
  [0x49, "INSERT"], [0x4a, "HOME"], [0x4b, "PAGE_UP"], [0x4c, "DELETE"],
  [0x4d, "END"], [0x4e, "PAGE_DOWN"], [0x4f, "RIGHT_ARROW"], [0x50, "LEFT_ARROW"],
  [0x51, "DOWN_ARROW"], [0x52, "UP_ARROW"], [0x53, "KP_NUMLOCK"],
  [0x54, "KP_DIVIDE"], [0x55, "KP_MULTIPLY"], [0x56, "KP_MINUS"], [0x57, "KP_PLUS"],
  [0x58, "KP_ENTER"], [0x59, "KP_N1"], [0x5a, "KP_N2"], [0x5b, "KP_N3"],
  [0x5c, "KP_N4"], [0x5d, "KP_N5"], [0x5e, "KP_N6"], [0x5f, "KP_N7"],
  [0x60, "KP_N8"], [0x61, "KP_N9"], [0x62, "KP_N0"], [0x63, "KP_DOT"],
  [0x64, "NON_US_BACKSLASH"], [0x65, "K_APPLICATION"], [0x66, "K_POWER"],
  [0x67, "KP_EQUAL"], [0xe0, "LEFT_CONTROL"], [0xe1, "LEFT_SHIFT"],
  [0xe2, "LEFT_ALT"], [0xe3, "LEFT_GUI"], [0xe4, "RIGHT_CONTROL"],
  [0xe5, "RIGHT_SHIFT"], [0xe6, "RIGHT_ALT"], [0xe7, "RIGHT_GUI"],
]);

const MODIFIERS = new Map([
  ["LCTRL", "LEFT_CONTROL"], ["LCONTROL", "LEFT_CONTROL"],
  ["LSHIFT", "LEFT_SHIFT"], ["LALT", "LEFT_ALT"],
  ["LGUI", "LEFT_GUI"], ["LWIN", "LEFT_GUI"],
  ["RCTRL", "RIGHT_CONTROL"], ["RCONTROL", "RIGHT_CONTROL"],
  ["RSHIFT", "RIGHT_SHIFT"], ["RALT", "RIGHT_ALT"],
  ["RGUI", "RIGHT_GUI"], ["RWIN", "RIGHT_GUI"],
]);

function usagePageNumber(page) {
  if (typeof page === "number") {
    return page;
  }
  if (page === "keyboard") {
    return 0x07;
  }
  if (page === "consumer") {
    return 0x0c;
  }
  throw new Error(`未対応のHID usage pageです: ${page}`);
}

function keyCode(binding) {
  const usage = Number(binding?.usage);
  if (!Number.isInteger(usage) || usage < 0 || usage > 0xffff) {
    throw new Error(`不正なHID usageです: ${binding?.usage}`);
  }

  const page = usagePageNumber(binding?.usagePage);
  if (page === 0x07 && KEYBOARD_USAGES.has(usage)) {
    return KEYBOARD_USAGES.get(usage);
  }
  return String(((page & 0xff) << 16) | usage);
}

function safeRaw(zmk) {
  const value = String(zmk ?? "").trim();
  if (KNOWN_LOCAL_BINDINGS.has(value)) {
    return KNOWN_LOCAL_BINDINGS.get(value);
  }
  if (value.startsWith("local-id:")) {
    throw new Error(`未知のlocal-idは変換できません: ${value}`);
  }
  if (!value.startsWith("&") || /[<>{};\r\n]/u.test(value)) {
    throw new Error(`安全でないraw bindingです: ${JSON.stringify(value)}`);
  }
  return value.replace(/^&runtime_macro\b/u, "&rmacro");
}

export function bindingToZmk(binding) {
  if (!binding || typeof binding !== "object") {
    throw new Error("bindingがありません。");
  }

  switch (binding.type) {
    case "key":
      return `&kp ${keyCode(binding)}`;
    case "trans":
      return "&trans";
    case "mo":
      return `&mo ${Number(binding.layer)}`;
    case "to":
      return `&to ${Number(binding.layer)}`;
    case "lt":
      return `&lt ${Number(binding.layer)} ${keyCode(binding)}`;
    case "mt": {
      const modifier = MODIFIERS.get(String(binding.mod ?? "").toUpperCase());
      if (!modifier) {
        throw new Error(`未対応のmodifierです: ${binding.mod}`);
      }
      return `&mt ${modifier} ${keyCode(binding)}`;
    }
    case "mouse_button":
      return `&mkp MB${Number(binding.button)}`;
    case "bootloader":
      return "&bootloader";
    case "bluetooth":
      if (binding.action === "select") {
        return `&bt BT_SEL ${Number(binding.profile)}`;
      }
      if (binding.action === "clear") {
        return "&bt BT_CLR";
      }
      if (binding.action === "clear_all") {
        return "&bt BT_CLR_ALL";
      }
      throw new Error(`未対応のBluetooth操作です: ${binding.action}`);
    case "raw":
      return safeRaw(binding.zmk);
    default:
      throw new Error(`未対応のbinding種別です: ${binding.type}`);
  }
}

function maskSource(source) {
  const chars = [...source];
  let state = "normal";
  let escaped = false;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1];

    if (state === "normal") {
      if (char === "/" && next === "/") {
        chars[index] = chars[index + 1] = " ";
        state = "line-comment";
        index += 1;
      } else if (char === "/" && next === "*") {
        chars[index] = chars[index + 1] = " ";
        state = "block-comment";
        index += 1;
      } else if (char === '"') {
        chars[index] = " ";
        state = "string";
        escaped = false;
      }
    } else if (state === "line-comment") {
      if (char === "\n") {
        state = "normal";
      } else if (char !== "\r") {
        chars[index] = " ";
      }
    } else if (state === "block-comment") {
      if (char === "*" && next === "/") {
        chars[index] = chars[index + 1] = " ";
        state = "normal";
        index += 1;
      } else if (char !== "\r" && char !== "\n") {
        chars[index] = " ";
      }
    } else if (state === "string") {
      if (char !== "\r" && char !== "\n") {
        chars[index] = " ";
      }
      if (!escaped && char === '"') {
        state = "normal";
      }
      escaped = !escaped && char === "\\";
      if (char !== "\\") {
        escaped = false;
      }
    }
  }

  return chars.join("");
}

function findMatching(masked, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    if (masked[index] === openChar) {
      depth += 1;
    } else if (masked[index] === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error(`${openChar}${closeChar}の対応が壊れています。`);
}

function findNode(source, name) {
  const masked = maskSource(source);
  const expression = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*\\{`, "gu");
  const match = expression.exec(masked);
  if (!match) {
    throw new Error(`${name}ノードが見つかりません。`);
  }
  const open = masked.indexOf("{", match.index);
  return { open, close: findMatching(masked, open, "{", "}"), masked };
}

function directChildNodes(source, parent) {
  const masked = parent.masked ?? maskSource(source);
  const children = [];
  let index = parent.open + 1;

  while (index < parent.close) {
    if (masked[index] !== "{") {
      index += 1;
      continue;
    }

    const close = findMatching(masked, index, "{", "}");
    let headerStart = index - 1;
    while (headerStart > parent.open && !";}".includes(masked[headerStart])) {
      headerStart -= 1;
    }
    const header = masked.slice(headerStart + 1, index).trim();
    const headerMatch = header.match(/(?:(?<label>[A-Za-z_][\w-]*)\s*:\s*)?(?<name>[A-Za-z_][\w-]*)\s*$/u);
    if (headerMatch) {
      children.push({
        label: headerMatch.groups?.label ?? "",
        name: headerMatch.groups?.name ?? "",
        open: index,
        close,
        masked,
      });
    }
    index = close + 1;
  }

  return children;
}

function findBindingsRange(source, node) {
  const segment = node.masked.slice(node.open + 1, node.close);
  const match = /\bbindings\s*=\s*</u.exec(segment);
  if (!match) {
    throw new Error(`${node.name}にbindingsがありません。`);
  }
  const open = node.open + 1 + match.index + match[0].lastIndexOf("<");
  const close = findMatching(node.masked, open, "<", ">");
  return { start: open + 1, end: close };
}

function replaceRanges(source, replacements) {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce((text, replacement) => (
      text.slice(0, replacement.start) + replacement.value + text.slice(replacement.end)
    ), source);
}

function layerBindingsText(bindings, eol) {
  const rows = [10, 10, 10, 11];
  const converted = bindings.map(bindingToZmk);
  const lines = [];
  let offset = 0;
  for (const length of rows) {
    lines.push(`                ${converted.slice(offset, offset + length).join("    ")}`);
    offset += length;
  }
  return `${eol}${lines.join(eol)}${eol}            `;
}

function parseExistingComboNames(source) {
  const node = findNode(source, "runtime_combo_defaults");
  const result = new Map();
  for (const child of directChildNodes(source, node)) {
    const body = source.slice(child.open + 1, child.close);
    const slot = body.match(/\bslot\s*=\s*<\s*(\d+)\s*>/u);
    const display = body.match(/\bdisplay-name\s*=\s*"([^"]*)"/u);
    if (slot) {
      result.set(Number(slot[1]), {
        nodeName: child.name,
        displayName: display?.[1] ?? child.name,
      });
    }
  }
  return result;
}

function identifier(value, fallback) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]+/gu, "_")
    .replace(/^([^A-Za-z_])/u, "_$1")
    .replace(/_+/gu, "_")
    .replace(/^_|_$/gu, "");
  return normalized || fallback;
}

function escapeDtsString(value) {
  return String(value).replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
}

function renderComboNode(combo, slot, existing, eol) {
  const nodeName = identifier(existing?.nodeName, `combo_${slot + 1}`);
  const displayName = escapeDtsString(existing?.displayName ?? `Combo ${slot + 1}`);
  const positions = combo.positions.join(" ");
  const binding = bindingToZmk(combo.binding);
  return [
    `        ${nodeName} {`,
    `            slot = <${slot}>;`,
    `            bindings = <${binding}>;`,
    `            key-positions = <${positions}>;`,
    `            display-name = "${displayName}";`,
    "        };",
  ].join(eol);
}

function macroSequence(bindings) {
  const result = [];
  let index = 0;

  while (index < bindings.length) {
    const item = bindings[index];
    if (item.action === "tap") {
      result.push(bindingToZmk(item.binding));
      index += 1;
      continue;
    }

    if (item.action !== "down" && item.action !== "up") {
      throw new Error(`未対応のマクロ操作です: ${item.action}`);
    }

    const action = item.action;
    const group = [];
    while (index < bindings.length && bindings[index].action === action) {
      if (bindings[index].binding?.type !== "key") {
        throw new Error(`${action}操作ではキー以外を使用できません。`);
      }
      group.push(bindingToZmk(bindings[index].binding));
      index += 1;
    }
    result.push(action === "down" ? "&macro_press" : "&macro_release");
    result.push(group.join(" "));
  }

  return result;
}

function parseExistingMacroNames(source) {
  const node = findNode(source, "runtime_macro_defaults");
  return directChildNodes(source, node).map((child) => child.name);
}

function renderMacroNode(macro, slot, existingNodeName, eol) {
  const nodeName = identifier(existingNodeName, `macro_${slot + 1}_default`);
  const macroName = escapeDtsString(macro.name ?? `Macro ${slot + 1}`);
  const sequence = macroSequence(macro.bindings);
  const renderedBindings = sequence.map((binding, index) => (
    `                <${binding}>${index === sequence.length - 1 ? ";" : ","}`
  ));
  return [
    `        ${nodeName} {`,
    '            compatible = "cormoran,runtime-macro-default";',
    `            macro-name = "${macroName}";`,
    "            bindings =",
    ...renderedBindings,
    "        };",
  ].join(eol);
}

function replaceNodeBody(source, nodeName, body) {
  const node = findNode(source, nodeName);
  return source.slice(0, node.open + 1) + body + source.slice(node.close);
}

export function transformFirmwareKeymap(source, document) {
  const layers = document?.keymap?.layers ?? [];
  const combos = document?.keymap?.combos ?? [];
  const macros = document?.keymap?.macros ?? [];
  const eol = source.includes("\r\n") ? "\r\n" : "\n";

  const keymapNode = findNode(source, "keymap");
  const layerNodes = directChildNodes(source, keymapNode);
  if (layerNodes.length !== layers.length) {
    throw new Error(`ソース側のレイヤー数が${layerNodes.length}です（エクスポート: ${layers.length}）。`);
  }

  const layerReplacements = layerNodes.map((node, index) => {
    const range = findBindingsRange(source, node);
    return {
      ...range,
      value: layerBindingsText(layers[index].bindings, eol),
    };
  });
  let result = replaceRanges(source, layerReplacements);

  const existingCombos = parseExistingComboNames(result);
  const comboNodes = combos.map((combo, slot) => renderComboNode(combo, slot, existingCombos.get(slot), eol));
  const comboBody = [
    "",
    '        compatible = "cormoran,runtime-combo-defaults";',
    ...(comboNodes.length ? ["", comboNodes.join(`${eol}${eol}`)] : []),
    "    ",
  ].join(eol);
  result = replaceNodeBody(result, "runtime_combo_defaults", comboBody);

  const existingMacros = parseExistingMacroNames(result);
  const macroNodes = macros.map((macro, slot) => renderMacroNode(macro, slot, existingMacros[slot], eol));
  const macroBody = [
    "",
    ...(macroNodes.length ? [macroNodes.join(`${eol}${eol}`)] : []),
    "    ",
  ].join(eol);
  result = replaceNodeBody(result, "runtime_macro_defaults", macroBody);

  return {
    source: result,
    stats: {
      layers: layers.length,
      keys: layers.reduce((total, layer) => total + layer.bindings.length, 0),
      combos: combos.length,
      macros: macros.length,
    },
  };
}

