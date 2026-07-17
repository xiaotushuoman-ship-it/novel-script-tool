const DEFAULT_STARTUP_DELAY_MS = 5000;
const DEFAULT_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_FOCUS_THROTTLE_MS = 60 * 1000;

export function setupAutoUpdate({
  isPackaged,
  updater,
  dialog,
  getWindow = () => undefined,
  schedule = setTimeout,
  repeat = setInterval,
  logger = console,
  delayMs = DEFAULT_STARTUP_DELAY_MS,
  intervalMs = DEFAULT_CHECK_INTERVAL_MS,
  focusThrottleMs = DEFAULT_FOCUS_THROTTLE_MS,
  now = Date.now,
}) {
  if (!isPackaged) return { started: false, checkNow: async () => undefined };

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  let isChecking = false;
  let isDownloading = false;
  let updateReady = false;
  let errorDialogOpen = false;
  let lastCheckAt = 0;

  const resetWindowProgress = () => {
    const window = getWindow();
    if (!window || window.isDestroyed?.()) return;
    window.setProgressBar?.(-1);
    window.setTitle?.("小兔助手");
  };

  const showUpdateError = async (error) => {
    logger.warn("Desktop update failed", error);
    resetWindowProgress();
    if (errorDialogOpen) return;
    errorDialogOpen = true;
    try {
      await dialog.showMessageBox({
        type: "error",
        title: "小兔助手更新失败",
        message: "在线更新暂时没有完成。",
        detail: `${error instanceof Error ? error.message : String(error || "未知错误")}\n\n软件可以继续使用，稍后会自动重新检查。`,
        buttons: ["知道了"],
        defaultId: 0,
        noLink: true,
      });
    } finally {
      errorDialogOpen = false;
    }
  };

  const checkNow = async ({ force = true } = {}) => {
    const currentTime = now();
    if (!force && currentTime - lastCheckAt < focusThrottleMs) return;
    if (isChecking || isDownloading || updateReady) return;
    isChecking = true;
    lastCheckAt = currentTime;
    try {
      await updater.checkForUpdates();
    } catch (error) {
      await showUpdateError(error);
    } finally {
      isChecking = false;
    }
  };

  updater.on("update-available", async () => {
    if (isDownloading || updateReady) return;
    isDownloading = true;
    try {
      await updater.downloadUpdate();
    } catch (error) {
      isDownloading = false;
      await showUpdateError(error);
    }
  });

  updater.on("update-not-available", () => {
    isDownloading = false;
    resetWindowProgress();
  });

  updater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
    const window = getWindow();
    if (!window || window.isDestroyed?.()) return;
    window.setProgressBar?.(Number((percent / 100).toFixed(3)));
    window.setTitle?.(`小兔助手 - 更新下载 ${Math.round(percent)}%`);
  });

  updater.on("update-downloaded", async (info) => {
    isDownloading = false;
    updateReady = true;
    resetWindowProgress();
    const result = await dialog.showMessageBox({
      type: "info",
      title: "小兔助手更新已就绪",
      message: `新版本 ${info?.version || ""} 已下载完成。`,
      detail: "可以立即关闭软件并安装；也可以继续工作，退出小兔助手时自动安装。",
      buttons: ["立即更新", "退出时更新"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) {
      updater.quitAndInstall(false, true);
      return;
    }
    updater.autoInstallOnAppQuit = true;
  });

  updater.on("error", async (error) => {
    isChecking = false;
    isDownloading = false;
    await showUpdateError(error);
  });

  schedule(() => checkNow(), delayMs);
  repeat(() => checkNow(), intervalMs);

  return {
    started: true,
    checkNow: () => checkNow(),
    checkOnFocus: () => checkNow({ force: false }),
  };
}
