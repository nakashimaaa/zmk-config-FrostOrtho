import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCommand, syncExport } from "../src/core/git-sync.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const gitPath = process.platform === "win32"
  ? path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "cmd", "git.exe")
  : "git";

test("creates, commits, and pushes an isolated DYA sync branch", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frostortho-dya-sync-test-"));
  const remotePath = path.join(tempRoot, "remote.git");
  const seedPath = path.join(tempRoot, "seed");

  try {
    await fs.mkdir(seedPath, { recursive: true });
    await runCommand(gitPath, ["init", "--bare", "--initial-branch=main", remotePath]);
    await runCommand(gitPath, ["init", "--initial-branch=main", seedPath]);
    await runCommand(gitPath, ["-C", seedPath, "config", "user.name", "DYA Sync Test"]);
    await runCommand(gitPath, ["-C", seedPath, "config", "user.email", "dya-sync@example.invalid"]);

    await fs.mkdir(path.join(seedPath, "config"), { recursive: true });
    await fs.mkdir(path.join(seedPath, "dya"), { recursive: true });
    await fs.copyFile(
      path.join(repoRoot, "config", "FrostOrtho.keymap"),
      path.join(seedPath, "config", "FrostOrtho.keymap"),
    );
    await fs.copyFile(path.join(repoRoot, "dya", "README.md"), path.join(seedPath, "dya", "README.md"));
    await runCommand(gitPath, ["-C", seedPath, "add", "."]);
    await runCommand(gitPath, ["-C", seedPath, "commit", "-m", "Initial fixture"]);
    await runCommand(gitPath, ["-C", seedPath, "remote", "add", "origin", remotePath]);
    await runCommand(gitPath, ["-C", seedPath, "push", "-u", "origin", "main"]);

    const fixtureRoot = path.join(repoRoot, "dya", "exports", "2026-09-12-runtime-v2");
    const result = await syncExport({
      repoPath: seedPath,
      jsonText: await fs.readFile(path.join(fixtureRoot, "frostortho.keyboard-hub.json"), "utf8"),
      keymapText: await fs.readFile(path.join(fixtureRoot, "frostortho.keymap"), "utf8"),
      jsonName: "frostortho.keyboard-hub.json",
      keymapName: "frostortho.keymap",
      gitPath,
      now: new Date(2026, 8, 26, 12, 34, 56),
    });

    assert.match(result.branch, /^dya-sync\/2026-09-26-123456-[a-f0-9]{4}$/u);
    assert.equal(result.stagedPaths.length, 3);
    assert.equal(result.stats.keys, 328);

    const branches = await runCommand(gitPath, ["--git-dir", remotePath, "branch", "--list", result.branch]);
    assert.match(branches.stdout, /dya-sync/u);

    const archived = await runCommand(gitPath, [
      "--git-dir", remotePath,
      "show", `${result.branch}:${result.exportDirectory}/frostortho.keyboard-hub.json`,
    ]);
    assert.match(archived.stdout, /"keyboard": "frostortho"/u);

    const firmware = await runCommand(gitPath, [
      "--git-dir", remotePath,
      "show", `${result.branch}:config/FrostOrtho.keymap`,
    ]);
    assert.match(firmware.stdout, /bindings = <&kp LG\(TAB\)>;/u);
    assert.match(firmware.stdout, /sensor-bindings/iu);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

