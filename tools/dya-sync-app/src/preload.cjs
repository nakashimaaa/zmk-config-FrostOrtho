const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dyaSync", {
  appInfo: () => ipcRenderer.invoke("app:info"),
  chooseFile: (kind) => ipcRenderer.invoke("file:choose", kind),
  chooseRepository: () => ipcRenderer.invoke("repo:choose"),
  preview: (payload) => ipcRenderer.invoke("sync:preview", payload),
  sync: (payload) => ipcRenderer.invoke("sync:run", payload),
  openLink: (url) => ipcRenderer.invoke("link:open", url),
  onLog: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("sync:log", listener);
    return () => ipcRenderer.removeListener("sync:log", listener);
  },
});

