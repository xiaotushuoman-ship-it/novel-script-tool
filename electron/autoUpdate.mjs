export function setupAutoUpdate({
  isPackaged,
  updater,
  dialog,
  schedule = setTimeout,
  logger = console,
  delayMs = 5000,
}) {
  if (!isPackaged) return { started: false };

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;

  updater.on("update-available", () => {
    void updater.downloadUpdate().catch((error) => logger.warn("Desktop update download failed", error));
  });
  updater.on("update-downloaded", async (info) => {
    const result = await dialog.showMessageBox({
      type: "info",
      title: "小兔助手更新已就绪",
      message: `新版本 ${info?.version || ""} 已下载完成。`,
      detail: "立即更新会关闭小兔助手、安装新版并自动重新打开。",
      buttons: ["立即更新", "稍后"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) updater.quitAndInstall(false, true);
  });
  updater.on("error", (error) => logger.warn("Desktop update check failed", error));

  schedule(() => {
    void updater.checkForUpdates().catch((error) => logger.warn("Desktop update check failed", error));
  }, delayMs);
  return { started: true };
}
