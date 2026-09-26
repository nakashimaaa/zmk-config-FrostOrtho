import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspectExport, requireValidExport } from "../src/core/validation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const fixtureRoot = path.join(repoRoot, "dya", "exports", "2026-09-12-runtime-v2");

async function fixture() {
  return {
    jsonText: await fs.readFile(path.join(fixtureRoot, "frostortho.keyboard-hub.json"), "utf8"),
    keymapText: await fs.readFile(path.join(fixtureRoot, "frostortho.keymap"), "utf8"),
    jsonName: "frostortho.keyboard-hub.json",
    keymapName: "frostortho.keymap",
  };
}

test("accepts the confirmed FrostOrtho runtime export", async () => {
  const result = inspectExport(await fixture());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.layers, 8);
  assert.equal(result.summary.keys, 328);
  assert.equal(result.summary.combos, 9);
  assert.equal(result.summary.macros, 1);
  assert.match(result.warnings.join("\n"), /WindowsTab/u);
  assert.match(result.warnings.join("\n"), /AML/u);
});

test("rejects an export for another keyboard", async () => {
  const input = await fixture();
  const document = JSON.parse(input.jsonText);
  document.keymap.keyboard = "another-keyboard";

  const result = inspectExport({ ...input, jsonText: JSON.stringify(document) });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /FrostOrtho/u);
});

test("rejects an unknown firmware-local binding", async () => {
  const input = await fixture();
  const document = JSON.parse(input.jsonText);
  document.keymap.combos[8].binding.zmk = "local-id:999 123 0";

  assert.throws(
    () => requireValidExport({ ...input, jsonText: JSON.stringify(document) }),
    /未知のlocal-id/u,
  );
});

test("rejects a mismatched generated keymap", async () => {
  const input = await fixture();
  const result = inspectExport({ ...input, keymapText: "not a keymap" });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /Keyboard Abyss/u);
});

