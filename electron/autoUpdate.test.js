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

describe("desktop auto update", () => {
  it("skips update checks outside packaged builds", () => {
    const updater = createUpdater();
    const schedule = vi.fn();

    const result = setupAutoUpdate({ isPackaged: false, updater, dialog: {}, schedule });

    expect(result.started).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("checks after startup and downloads an available update", async () => {
    const updater = createUpdater();
    const schedule = vi.fn((callback) => callback());

    const result = setupAutoUpdate({ isPackaged: true, updater, dialog: {}, schedule });
    await Promise.resolve();
    updater.emit("update-available", { version: "2026.7.12" });

    expect(result.started).toBe(true);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("installs a downloaded update only after the user confirms", async () => {
    const updater = createUpdater();
    const dialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    };

    setupAutoUpdate({ isPackaged: true, updater, dialog, schedule: () => undefined });
    await updater.emit("update-downloaded", { version: "2026.7.12" });

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ buttons: ["立即更新", "稍后"], defaultId: 0, cancelId: 1 }),
    );
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("keeps the current version running when the user postpones", async () => {
    const updater = createUpdater();
    const dialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
    };

    setupAutoUpdate({ isPackaged: true, updater, dialog, schedule: () => undefined });
    await updater.emit("update-downloaded", { version: "2026.7.12" });

    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
