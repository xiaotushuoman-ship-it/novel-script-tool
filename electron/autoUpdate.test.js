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
    off: vi.fn((event, handler) => {
      if (handlers.get(event) === handler) handlers.delete(event);
    }),
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

function createTimerHarness() {
  const scheduled = [];
  const schedule = vi.fn((callback, delay) => {
    const handle = { unref: vi.fn() };
    scheduled.push({ callback, delay, handle });
    return handle;
  });
  const clearSchedule = vi.fn();

  return { schedule, clearSchedule, scheduled };
}

describe("desktop auto update", () => {
  it("skips update checks outside packaged builds", () => {
    const updater = createUpdater();
    const timers = createTimerHarness();

    const result = setupAutoUpdate({ isPackaged: false, updater, dialog: {}, ...timers });

    expect(result.started).toBe(false);
    expect(timers.schedule).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("checks for updates once after packaged app startup", async () => {
    const updater = createUpdater();
    const timers = createTimerHarness();

    const result = setupAutoUpdate({
      isPackaged: true,
      updater,
      dialog: {},
      ...timers,
      delayMs: 1234,
    });

    expect(result.started).toBe(true);
    expect(timers.schedule).toHaveBeenCalledWith(expect.any(Function), 1234);
    expect(timers.scheduled[0].handle.unref).toHaveBeenCalledTimes(1);

    await timers.scheduled[0].callback();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("checks only when explicitly requested", async () => {
    const updater = createUpdater();
    const timers = createTimerHarness();

    const result = setupAutoUpdate({ isPackaged: true, updater, dialog: {}, ...timers });

    await result.checkNow();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("downloads an available update silently in the background", async () => {
    const updater = createUpdater();
    setupAutoUpdate({ isPackaged: true, updater, dialog: {}, ...createTimerHarness() });

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
      ...createTimerHarness(),
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
      ...createTimerHarness(),
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

    setupAutoUpdate({ isPackaged: true, updater, dialog, ...createTimerHarness() });
    await updater.emit("update-downloaded", { version: "2026.7.12" });

    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("disposes startup timer and prevents future scheduled checks", async () => {
    const updater = createUpdater();
    const timers = createTimerHarness();
    const result = setupAutoUpdate({ isPackaged: true, updater, dialog: {}, ...timers });

    await result.dispose();

    expect(timers.clearSchedule).toHaveBeenCalledWith(timers.scheduled[0].handle);

    await timers.scheduled[0].callback();

    expect(updater.checkForUpdates).not.toHaveBeenCalled();
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
      ...createTimerHarness(),
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
