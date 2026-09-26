import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { transformFirmwareKeymap } from "./keymap-transform.mjs";
import { requireValidExport } from "./validation.mjs";

function pad(value) {
  return String(value).padStart(2, "0");
}

export function timestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function defaultGitPath() {
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    return path.join(programFiles, "Git", "cmd", "git.exe");
  }
  return "git";
}

export function runCommand(command, args, { cwd, env = {}, onLog = () => {}, allowExitCodes = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      text.trimEnd().split(/\r?\n/u).filter(Boolean).forEach((line) => onLog("info", line));
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      text.trimEnd().split(/\r?\n/u).filter(Boolean).forEach((line) => onLog("detail", line));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (!allowExitCodes.includes(code)) {
        const error = new Error(stderr.trim() || stdout.trim() || `${command}が終了コード${code}で失敗しました。`);
        error.exitCode = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function parseGitHubRemote(remote) {
  const https = remote.match(/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/u);
  const ssh = remote.match(/^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/u);
  const match = https ?? ssh;
  return match ? { owner: match.groups.owner, repo: match.groups.repo } : null;
}

async function ensureRepository(repoPath, gitPath, onLog) {
  const result = await runCommand(gitPath, ["-C", repoPath, "rev-parse", "--show-toplevel"], { onLog });
  const actual = path.resolve(result.stdout);
  if (actual.toLowerCase() !== path.resolve(repoPath).toLowerCase()) {
    throw new Error(`選択したフォルダーはリポジトリ直下ではありません: ${actual}`);
  }

  for (const relativePath of ["config/FrostOrtho.keymap", "dya/README.md"]) {
    try {
      await fs.access(path.join(repoPath, relativePath));
    } catch {
      throw new Error(`FrostOrthoリポジトリとして必要なファイルがありません: ${relativePath}`);
    }
  }
}

async function removeWorktree({ gitPath, repoPath, worktreePath, onLog }) {
  const root = path.resolve(os.tmpdir(), "frostortho-dya-sync");
  const target = path.resolve(worktreePath);
  if (!target.toLowerCase().startsWith(`${root.toLowerCase()}${path.sep}`)) {
    throw new Error(`安全でない一時worktreeパスです: ${target}`);
  }
  await runCommand(gitPath, ["-C", repoPath, "worktree", "remove", "--force", target], { onLog });
}

export async function previewSync({ repoPath, jsonText, keymapText, jsonName, keymapName }) {
  const validation = requireValidExport({ jsonText, keymapText, jsonName, keymapName });
  const sourcePath = path.join(repoPath, "config", "FrostOrtho.keymap");
  const source = await fs.readFile(sourcePath, "utf8");
  const transformed = transformFirmwareKeymap(source, validation.document);
  return {
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      summary: validation.summary,
    },
    changed: transformed.source !== source,
    stats: transformed.stats,
  };
}

export async function syncExport({
  repoPath,
  jsonText,
  keymapText,
  jsonName,
  keymapName,
  gitPath = defaultGitPath(),
  now = new Date(),
  onLog = () => {},
}) {
  const validation = requireValidExport({ jsonText, keymapText, jsonName, keymapName });
  await ensureRepository(repoPath, gitPath, onLog);

  const stamp = timestamp(now);
  const nonce = crypto.randomBytes(2).toString("hex");
  const branch = `dya-sync/${stamp}-${nonce}`;
  const exportDirectory = `dya/exports/${stamp}`;
  const worktreeRoot = path.resolve(os.tmpdir(), "frostortho-dya-sync");
  const worktreePath = path.join(worktreeRoot, `${stamp}-${nonce}`);
  let worktreeCreated = false;
  let commit = "";

  await fs.mkdir(worktreeRoot, { recursive: true });
  onLog("step", "origin/mainを更新しています");
  await runCommand(gitPath, ["-C", repoPath, "fetch", "origin", "main"], { onLog });

  try {
    onLog("step", `作業ブランチ ${branch} を作成しています`);
    await runCommand(gitPath, ["-C", repoPath, "worktree", "add", "-b", branch, worktreePath, "origin/main"], { onLog });
    worktreeCreated = true;

    const firmwarePath = path.join(worktreePath, "config", "FrostOrtho.keymap");
    const currentSource = await fs.readFile(firmwarePath, "utf8");
    const transformed = transformFirmwareKeymap(currentSource, validation.document);

    const archivePath = path.join(worktreePath, ...exportDirectory.split("/"));
    await fs.mkdir(archivePath, { recursive: true });
    await fs.writeFile(path.join(archivePath, "frostortho.keyboard-hub.json"), jsonText, "utf8");
    await fs.writeFile(path.join(archivePath, "frostortho.keymap"), keymapText, "utf8");
    await fs.writeFile(firmwarePath, transformed.source, "utf8");

    onLog("step", "変更内容を検査しています");
    const managedPaths = [
      "config/FrostOrtho.keymap",
      `${exportDirectory}/frostortho.keyboard-hub.json`,
      `${exportDirectory}/frostortho.keymap`,
    ];
    await runCommand(gitPath, ["-C", worktreePath, "add", "--", ...managedPaths], { onLog });
    await runCommand(gitPath, ["-C", worktreePath, "diff", "--cached", "--check"], { onLog });

    const staged = await runCommand(gitPath, ["-C", worktreePath, "diff", "--cached", "--name-only"], { onLog });
    const stagedPaths = staged.stdout.split(/\r?\n/u).filter(Boolean);
    const unexpected = stagedPaths.filter((item) => !managedPaths.includes(item.replace(/\\/gu, "/")));
    if (unexpected.length > 0) {
      throw new Error(`管理対象外のファイルが含まれています: ${unexpected.join(", ")}`);
    }

    onLog("step", "コミットを作成しています");
    await runCommand(gitPath, [
      "-C", worktreePath,
      "-c", "commit.gpgsign=false",
      "commit",
      "-m", `Sync DYA Studio settings ${stamp.slice(0, 10)}`,
    ], { onLog });
    commit = (await runCommand(gitPath, ["-C", worktreePath, "rev-parse", "HEAD"], { onLog })).stdout;

    onLog("step", "GitHubへプッシュしています");
    await runCommand(gitPath, ["-C", worktreePath, "push", "--set-upstream", "origin", branch], { onLog });

    const remote = (await runCommand(gitPath, ["-C", repoPath, "remote", "get-url", "origin"], { onLog })).stdout;
    const github = parseGitHubRemote(remote);
    const baseUrl = github ? `https://github.com/${github.owner}/${github.repo}` : "";

    return {
      branch,
      commit,
      exportDirectory,
      stagedPaths,
      stats: transformed.stats,
      branchUrl: baseUrl ? `${baseUrl}/tree/${encodeURIComponent(branch)}` : "",
      compareUrl: baseUrl ? `${baseUrl}/compare/main...${encodeURIComponent(branch)}?expand=1` : "",
      actionsUrl: baseUrl ? `${baseUrl}/actions?query=branch%3A${encodeURIComponent(branch)}` : "",
    };
  } finally {
    if (worktreeCreated) {
      try {
        await removeWorktree({ gitPath, repoPath, worktreePath, onLog });
      } catch (error) {
        onLog("warning", `一時worktreeを削除できませんでした: ${error.message}`);
      }
    }
  }
}
