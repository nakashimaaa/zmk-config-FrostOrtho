const state = {
  repoPath: "",
  json: null,
  keymap: null,
  analysis: null,
  result: null,
  busy: false,
  logCount: 0,
};

const elements = Object.fromEntries([
  "version-label", "header-status", "header-status-text", "repo-path", "choose-repo",
  "drop-zone", "choose-json", "choose-keymap", "json-file-name", "keymap-file-name",
  "analyze-button", "analysis-empty", "analysis-content", "metric-layers", "metric-keys",
  "metric-combos", "metric-macros", "result-banner", "result-title", "result-message",
  "message-list", "sync-button", "sync-result", "success-detail", "open-actions",
  "open-compare", "log-panel", "log-output", "log-count", "confirm-dialog",
  "confirm-layers", "confirm-combos", "confirm-macros",
].map((id) => [id, document.getElementById(id)]));

function icons() {
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
}

function setStatus(stateName, text) {
  elements["header-status"].dataset.state = stateName;
  elements["header-status-text"].textContent = text;
}

function setBusy(busy) {
  state.busy = busy;
  elements["choose-repo"].disabled = busy;
  elements["choose-json"].disabled = busy;
  elements["choose-keymap"].disabled = busy;
  updateButtons();
}

function updateButtons() {
  const readyForAnalysis = Boolean(state.repoPath && state.json && state.keymap && !state.busy);
  elements["analyze-button"].disabled = !readyForAnalysis;
  elements["sync-button"].disabled = !(state.analysis?.validation?.valid && !state.busy);
}

function invalidateAnalysis() {
  state.analysis = null;
  state.result = null;
  elements["analysis-empty"].classList.remove("hidden");
  elements["analysis-content"].classList.add("hidden");
  elements["sync-result"].classList.add("hidden");
  setStatus(state.json && state.keymap && state.repoPath ? "ready" : "idle", state.json && state.keymap && state.repoPath ? "検証できます" : "準備待ち");
  updateButtons();
}

function setRepository(repoPath) {
  if (!repoPath) return;
  state.repoPath = repoPath;
  localStorage.setItem("frostorthoRepo", repoPath);
  elements["repo-path"].textContent = repoPath;
  elements["repo-path"].title = repoPath;
  invalidateAnalysis();
}

function setFile(kind, file) {
  if (!file) return;
  state[kind] = file;
  elements[kind === "json" ? "json-file-name" : "keymap-file-name"].textContent = file.name;
  invalidateAnalysis();
}

function appendLog(level, message) {
  state.logCount += 1;
  const line = document.createElement("div");
  line.className = "log-line";
  line.dataset.level = level;
  line.textContent = message;
  elements["log-output"].append(line);
  elements["log-count"].textContent = String(state.logCount);
  elements["log-output"].scrollTop = elements["log-output"].scrollHeight;
}

function clearLog() {
  state.logCount = 0;
  elements["log-output"].replaceChildren();
  elements["log-count"].textContent = "0";
}

function payload() {
  return {
    repoPath: state.repoPath,
    jsonText: state.json.text,
    keymapText: state.keymap.text,
    jsonName: state.json.name,
    keymapName: state.keymap.name,
  };
}

function messageItem(type, text) {
  const item = document.createElement("div");
  item.className = `message-item ${type}`;
  const icon = document.createElement("i");
  icon.dataset.lucide = type === "error" ? "circle-x" : "triangle-alert";
  const copy = document.createElement("span");
  copy.textContent = text;
  item.append(icon, copy);
  return item;
}

function renderAnalysis(response) {
  elements["analysis-empty"].classList.add("hidden");
  elements["analysis-content"].classList.remove("hidden");
  elements["message-list"].replaceChildren();

  if (!response.ok) {
    const error = response.error;
    state.analysis = { validation: { valid: false } };
    elements["metric-layers"].textContent = "-";
    elements["metric-keys"].textContent = "-";
    elements["metric-combos"].textContent = "-";
    elements["metric-macros"].textContent = "-";
    elements["result-banner"].dataset.state = "error";
    elements["result-title"].textContent = "検証できません";
    elements["result-message"].textContent = error.message;
    (error.errors.length ? error.errors : [error.message]).forEach((text) => {
      elements["message-list"].append(messageItem("error", text));
    });
    setStatus("error", "要確認");
    icons();
    updateButtons();
    return;
  }

  state.analysis = response.result;
  const summary = response.result.validation.summary;
  elements["metric-layers"].textContent = String(summary.layers);
  elements["metric-keys"].textContent = String(summary.keys);
  elements["metric-combos"].textContent = String(summary.combos);
  elements["metric-macros"].textContent = String(summary.macros);
  elements["result-banner"].dataset.state = "success";
  elements["result-title"].textContent = "検証完了";
  elements["result-message"].textContent = response.result.changed ? "ファームウェア初期値に変更があります" : "初期値の内容は一致しています";
  response.result.validation.warnings.forEach((text) => {
    elements["message-list"].append(messageItem("warning", text));
  });
  setStatus("success", "同期できます");
  icons();
  updateButtons();
}

async function analyze() {
  setBusy(true);
  setStatus("busy", "検証中");
  try {
    const response = await window.dyaSync.preview(payload());
    renderAnalysis(response);
  } catch (error) {
    renderAnalysis({ ok: false, error: { message: error.message, errors: [], warnings: [] } });
  } finally {
    setBusy(false);
  }
}

async function runSync() {
  clearLog();
  elements["log-panel"].open = true;
  elements["sync-result"].classList.add("hidden");
  setBusy(true);
  setStatus("busy", "GitHubへ反映中");
  appendLog("step", "同期処理を開始しました");

  try {
    const response = await window.dyaSync.sync(payload());
    if (!response.ok) {
      throw new Error(response.error.message);
    }
    state.result = response.result;
    elements["success-detail"].textContent = `${response.result.branch} / ${response.result.commit.slice(0, 8)}`;
    elements["sync-result"].classList.remove("hidden");
    appendLog("step", "コミットとプッシュが完了しました");
    setStatus("success", "プッシュ完了");
  } catch (error) {
    appendLog("error", error.message);
    setStatus("error", "同期失敗");
  } finally {
    setBusy(false);
  }
}

async function pickFile(kind) {
  const file = await window.dyaSync.chooseFile(kind);
  setFile(kind, file);
}

async function filesFromDrop(fileList) {
  for (const file of fileList) {
    if (file.size > 5 * 1024 * 1024) {
      appendLog("error", `${file.name}: ファイルサイズが上限を超えています`);
      continue;
    }
    const entry = { name: file.name, text: await file.text(), size: file.size };
    if (/\.keymap$/iu.test(file.name)) {
      setFile("keymap", entry);
    } else if (/\.json$/iu.test(file.name)) {
      setFile("json", entry);
    }
  }
}

elements["choose-repo"].addEventListener("click", async () => {
  setRepository(await window.dyaSync.chooseRepository());
});
elements["choose-json"].addEventListener("click", () => pickFile("json"));
elements["choose-keymap"].addEventListener("click", () => pickFile("keymap"));
elements["analyze-button"].addEventListener("click", analyze);

elements["drop-zone"].addEventListener("click", () => pickFile(state.json ? "keymap" : "json"));
elements["drop-zone"].addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements["drop-zone"].click();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  elements["drop-zone"].addEventListener(eventName, (event) => {
    event.preventDefault();
    elements["drop-zone"].classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements["drop-zone"].addEventListener(eventName, (event) => {
    event.preventDefault();
    elements["drop-zone"].classList.remove("dragging");
  });
}
elements["drop-zone"].addEventListener("drop", (event) => filesFromDrop(event.dataTransfer.files));

elements["sync-button"].addEventListener("click", () => {
  const summary = state.analysis.validation.summary;
  elements["confirm-layers"].textContent = String(summary.layers);
  elements["confirm-combos"].textContent = String(summary.combos);
  elements["confirm-macros"].textContent = String(summary.macros);
  elements["confirm-dialog"].showModal();
});
elements["confirm-dialog"].addEventListener("close", () => {
  if (elements["confirm-dialog"].returnValue === "confirm") {
    runSync();
  }
});

elements["open-actions"].addEventListener("click", () => {
  if (state.result?.actionsUrl) window.dyaSync.openLink(state.result.actionsUrl);
});
elements["open-compare"].addEventListener("click", () => {
  if (state.result?.compareUrl) window.dyaSync.openLink(state.result.compareUrl);
});

window.dyaSync.onLog(({ level, message }) => appendLog(level, message));

async function initialize() {
  icons();
  const info = await window.dyaSync.appInfo();
  elements["version-label"].textContent = `DYA Studio export manager  v${info.version}`;
  const savedRepo = localStorage.getItem("frostorthoRepo");
  setRepository(savedRepo || info.defaultRepo);
  updateButtons();
}

initialize();

