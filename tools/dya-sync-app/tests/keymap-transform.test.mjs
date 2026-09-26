import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { transformFirmwareKeymap } from "../src/core/keymap-transform.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

test("updates DYA-managed defaults while preserving FrostOrtho hardware behavior", async () => {
  const source = await fs.readFile(path.join(repoRoot, "config", "FrostOrtho.keymap"), "utf8");
  const document = JSON.parse(await fs.readFile(
    path.join(repoRoot, "dya", "exports", "2026-09-12-runtime-v2", "frostortho.keyboard-hub.json"),
    "utf8",
  ));

  const transformed = transformFirmwareKeymap(source, document);

  assert.deepEqual(transformed.stats, { layers: 8, keys: 328, combos: 9, macros: 1 });
  assert.equal((transformed.source.match(/sensor-bindings/gu) ?? []).length, 8);
  assert.match(transformed.source, /&mkp_input_listener \{ input-processors = <&zip_temp_layer 1 10000>; \};/u);
  assert.match(transformed.source, /compatible = "zmk,behavior-runtime-sensor-rotate";/u);
  assert.match(transformed.source, /bindings = <&kp LG\(TAB\)>;/u);
  assert.match(transformed.source, /macro-name = "Screenshot";/u);
  assert.match(transformed.source, /&rmacro 0/u);
  assert.doesNotMatch(transformed.source, /&runtime_macro 0/u);

  const secondPass = transformFirmwareKeymap(transformed.source, document);
  assert.equal(secondPass.source, transformed.source, "conversion must be idempotent");
});

