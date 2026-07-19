// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("desktop release configuration", () => {
  it("publishes updater-compatible artifacts to the public GitHub repository", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    const mainProcess = await readFile(new URL("../../electron/main.mjs", import.meta.url), "utf8");
    const installerInclude = await readFile(new URL("../../build/installer.nsh", import.meta.url), "utf8");

    expect(packageJson.dependencies["electron-updater"]).toBeTruthy();
    expect(packageJson.build.publish).toEqual([
      expect.objectContaining({
        provider: "github",
        owner: "xiaotushuoman-ship-it",
        repo: "novel-script-tool",
      }),
    ]);
    expect(packageJson.build.win.artifactName).toBe("Xiaotu-Assistant-Setup-${version}.${ext}");
    expect(packageJson.build.electronDist).toBeUndefined();
    expect(packageJson.build.files).toContain("electron/autoUpdate.mjs");
    expect(packageJson.build.nsis.include).toBe("build/installer.nsh");
    expect(installerInclude).toContain("customCheckAppRunning");
    expect(installerInclude).toContain("taskkill /F");
    expect(mainProcess).toContain('import electronUpdater from "electron-updater"');
    expect(mainProcess).toContain("cleanupBeforeQuit");
    expect(mainProcess).not.toContain('import { autoUpdater } from "electron-updater"');
    expect(mainProcess).not.toContain('mainWindow.on("focus"');
    expect(mainProcess).not.toContain("updateController?.checkNow()");
  });

  it("releases a tested Windows installer on every main branch synchronization", async () => {
    const workflow = await readFile(new URL("../../.github/workflows/release-desktop.yml", import.meta.url), "utf8");

    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("github.run_number");
    expect(workflow).toContain('git tag "v$env:APP_VERSION"');
    expect(workflow).toContain('git push origin "v$env:APP_VERSION"');
    expect(workflow).toContain("--publish never");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("release/latest.yml");
    expect(workflow).toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });
});
