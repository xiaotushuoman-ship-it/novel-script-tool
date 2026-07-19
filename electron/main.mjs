import { app, BrowserWindow, dialog, shell } from "electron";
import electronUpdater from "electron-updater";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDesktopServer } from "./desktopServer.mjs";
import { setupAutoUpdate } from "./autoUpdate.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const { autoUpdater } = electronUpdater;
let desktopServer;
let mainWindow;
let updateController;
let cleanupStarted = false;
let cleanupFinished = false;

async function createMainWindow() {
  const distDir = app.isPackaged ? path.join(app.getAppPath(), "dist") : path.resolve(currentDir, "..", "dist");
  desktopServer = await startDesktopServer({ distDir });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7f8fc",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadURL(desktopServer.url);
  if (!updateController) {
    updateController = setupAutoUpdate({
      isPackaged: app.isPackaged,
      updater: autoUpdater,
      dialog,
      getWindow: () => mainWindow,
    });
  }
}

async function cleanupBeforeQuit() {
  await updateController?.dispose?.();
  updateController = undefined;
  await desktopServer?.close?.();
  desktopServer = undefined;
  mainWindow = undefined;
}

app.whenReady().then(async () => {
  await createMainWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (cleanupFinished) return;
  event.preventDefault();
  if (cleanupStarted) return;
  cleanupStarted = true;
  void cleanupBeforeQuit()
    .catch((error) => console.warn("Desktop app cleanup failed", error))
    .finally(() => {
      cleanupFinished = true;
      app.quit();
    });
});
