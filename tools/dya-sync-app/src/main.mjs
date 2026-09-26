import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { previewSync, syncExport } from "./core/git-sync.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_EXPORT_SIZE = 5 * 1024 * 1024;
let mainWindow;
let syncInProgress = false;

function serializableError(error) {
  return {
    message: error?.message ?? String(error),
    errors: Array.isArray(error?.errors) ? error.errors : [],
    warnings: Array.isArray(error?.warnings) ? error.warnings : [],
  };
}

async function readExportFile(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_EXPORT_SIZE) {
    throw new Error(`ファイルが大きすぎます（上限: ${MAX_EXPORT_SIZE / 1024 / 1024} MB）。`);
  }
  return {
    name: path.basename(filePath),
    text: await fs.readFile(filePath, "utf8"),
    size: stat.size,
  };
}

async function isFrostOrthoRepo(candidate) {
  try {
    await fs.access(path.join(candidate, "config", "FrostOrtho.keymap"));
    await fs.access(path.join(candidate, "dya", "README.md"));
    return true;
  } catch {
    return false;
  }
}

async function defaultRepository() {
  const candidates = [
    process.env.FROSTORTHO_REPO,
    path.join(os.homedir(), "zmk-config-FrostOrtho"),
    path.resolve(app.getAppPath(), "../.."),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await isFrostOrthoRepo(candidate)) {
      return path.resolve(candidate);
    }
  }
  return "";
}

function registerIpc() {
  ipcMain.handle("app:info", async () => ({
    version: app.getVersion(),
    defaultRepo: await defaultRepository(),
  }));

  ipcMain.handle("file:choose", async (_event, kind) => {
    const filter = kind === "json"
      ? { name: "KeyboardHub JSON", extensions: ["json"] }
      : { name: "ZMK keymap", extensions: ["keymap"] };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: kind === "json" ? "KeyboardHub JSONを選択" : "ZMK keymapを選択",
      properties: ["openFile"],
      filters: [filter, { name: "すべてのファイル", extensions: ["*"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return readExportFile(result.filePaths[0]);
  });

  ipcMain.handle("repo:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "FrostOrthoリポジトリを選択",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("sync:preview", async (_event, payload) => {
    try {
      return { ok: true, result: await previewSync(payload) };
    } catch (error) {
      return { ok: false, error: serializableError(error) };
    }
  });

  ipcMain.handle("sync:run", async (event, payload) => {
    if (syncInProgress) {
      return { ok: false, error: { message: "同期処理は既に実行中です。", errors: [], warnings: [] } };
    }

    syncInProgress = true;
    try {
      const result = await syncExport({
        ...payload,
        onLog(level, message) {
          event.sender.send("sync:log", { level, message, at: new Date().toISOString() });
        },
      });
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: serializableError(error) };
    } finally {
      syncInProgress = false;
    }
  });

  ipcMain.handle("link:open", async (_event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
      throw new Error("GitHub以外のURLは開けません。");
    }
    await shell.openExternal(parsed.toString());
    return true;
  });
}

function createWindow() {
  nativeTheme.themeSource = "dark";
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: "#151617",
    show: false,
    title: "FrostOrtho DYA Sync",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(here, "index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

