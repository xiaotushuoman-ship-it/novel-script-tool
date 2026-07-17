// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { setupAutoUpdate } from "./autoUpdate.mjs";

function createUpdater() {
  const handlers = new Map();
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    emit(event, value) {
      return handlers.get(event)?.(value);
    },
  };
}

function createWindow() {
  return {
    getTitle: vi.fn(() => "小兔助手"),
    setProgressBar: vi.fn(),
    setTitle: vi.fn(),
  };
}

describe("desktop auto update", () => {
  it("skips update checks outside packaged builds", () => {
    const updater = createUpdater();
    const schedule = vi.fn();
    const repeat = vi.fn();

    const result = setupAutoUpdate({ isPackaged: false, updater, dialog: {}, schedule, repeat });

    expect(result.started).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
    expect(repeat).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("checks after startup, every 30 minutes, and when requested by a focused window", async () => {
    const updater = createUpdater();
    const startupCallbacks = [];
    const repeatCallbacks = [];
    const schedule = vi.fn((callback) => startupCallbacks.push(callback));
    const repeat = vi.fn((callback) => {
      repeatCallbacks.push(callback);
      return 42;
    });

    const result = setupAutoUpdate({ isPackaged: true, updater, dialog: {}, schedule, repeat });

    expect(result.started).toBe(true);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(repeat).toHaveBeenCalledWith(expect.any(Function), 30 * 60 * 1000);

    await startupCallbacks[0]();
    await repeatCallbacks[0]();
    await result.checkNow();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it("downloads an available update silently in the background", async () => {
    const updater = createUpdater();
    setupAutoUpdate({ isPackaged: true, updater, dialog: {}, schedule: () => undefined, repeat: () => undefined });

    await updater.emit("update-available", { version: "2026.7.12" });

    expect(updater.autoDownload).toBe(false);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows download progress on the window and taskbar", () => {
    const updater = createUpdater();
    const window = createWindow();
    setupAutoUpdate({
      isPackaged: true,
      updater,
      dialog: {},
      getWindow: () => window,
      schedule: () => undefined,
      repeat: () => undefined,
    });

    updater.emit("download-progress", { percent: 47.6 });

    expect(window.setProgressBar).toHaveBeenCalledWith(0.476);
    expect(window.setTitle).toHaveBeenCalledWith("小兔助手 - 更新下载 48%");
  });

  it("installs a downloaded update immediately after confirmation", async () => {
    const updater = createUpdater();
    const window = createWindow();
    const dialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    };

    setupAutoUpdate({
      isPackaged: true,
      updater,
      dialog,
      getWindow: () => window,
      schedule: () => undefined,
      repeat: () => undefined,
    });
    await updater.emit("update-downloaded", { version: "2026.7.12" });

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ buttons: ["立即更新", "退出时更新"], defaultId: 0, cancelId: 1 }),
    );
    expect(window.setProgressBar).toHaveBeenCalledWith(-1);
    expect(window.setTitle).toHaveBeenCalledWith("小兔助手");
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("installs a downloaded update when the app exits after postponing", async () => {
    const updater = createUpdater();
    const dialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
    };

    setupAutoUpdate({ isPackaged: true, updater, dialog, schedule: () => undefined, repeat: () => undefined });
    await updater.emit("update-downloaded", { version: "2026.7.12" });

    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("shows a clear failure dialog and resets download progress", async () => {
    const updater = createUpdater();
    const window = createWindow();
    const dialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    };

    setupAutoUpdate({
      isPackaged: true,
      updater,
      dialog,
      getWindow: () => window,
      schedule: () => undefined,
      repeat: () => undefined,
    });
    await updater.emit("error", new Error("网络连接被重置"));

    expect(window.setProgressBar).toHaveBeenCalledWith(-1);
    expect(window.setTitle).toHaveBeenCalledWith("小兔助手");
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "小兔助手更新失败",
        detail: expect.stringContaining("网络连接被重置"),
      }),
    );
  });
});
