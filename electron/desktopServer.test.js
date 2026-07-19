// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAistarsLabTargetUrl,
  buildTimeAiTargetUrl,
  buildZzdhTargetUrl,
  DEFAULT_DESKTOP_PORT,
  startDesktopServer,
} from "./desktopServer.mjs";

const cleanupTasks = [];

afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map((cleanup) => cleanup()));
});

describe("desktop server routes", () => {
  it("uses a stable default origin so browser storage survives app restarts", () => {
    expect(DEFAULT_DESKTOP_PORT).toBe(47831);
  });

  it("maps local API paths to their upstream services", () => {
    expect(buildTimeAiTargetUrl("/api/timeai/v1/chat/completions?stream=true")).toBe(
      "https://timeai.chat/v1/chat/completions?stream=true",
    );
    expect(buildAistarsLabTargetUrl("/api/aistarslab/openapi/video/task/status?id=42")).toBe(
      "https://api.video.aistarslab.com/openapi/video/task/status?id=42",
    );
    expect(buildZzdhTargetUrl("/api/zzdh/v1/tools/call")).toBe("http://127.0.0.1:8766/v1/tools/call");
  });

  it("unrefs the local server and closes it idempotently for installer upgrades", async () => {
    const distDir = await mkdtemp(path.join(tmpdir(), "xiaotu-desktop-"));
    await writeFile(path.join(distDir, "index.html"), "desktop", "utf8");
    cleanupTasks.push(() => rm(distDir, { recursive: true, force: true }));

    const desktop = await startDesktopServer({ distDir, port: 0 });

    await desktop.close();
    await desktop.close();

    const response = await fetch(desktop.url).catch((error) => error);
    expect(response).toBeInstanceOf(Error);
  });

  it("drops the server-proxy placeholder before forwarding TimeAI requests", async () => {
    const distDir = await mkdtemp(path.join(tmpdir(), "xiaotu-desktop-"));
    await writeFile(path.join(distDir, "index.html"), "desktop", "utf8");
    cleanupTasks.push(() => rm(distDir, { recursive: true, force: true }));
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));

    const desktop = await startDesktopServer({ distDir, fetchImpl, port: 0 });
    cleanupTasks.push(() => desktop.close());

    await fetch(`${desktop.url}/api/timeai/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: "Bearer server-proxy", "Content-Type": "application/json" },
      body: "{}",
    });

    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty("authorization");
  });

  it("serves the built app and falls back to index.html for client routes", async () => {
    const distDir = await mkdtemp(path.join(tmpdir(), "xiaotu-desktop-"));
    await writeFile(path.join(distDir, "index.html"), "<main>xiaotu desktop</main>", "utf8");
    cleanupTasks.push(() => rm(distDir, { recursive: true, force: true }));

    const desktop = await startDesktopServer({ distDir, port: 0 });
    cleanupTasks.push(() => desktop.close());

    const response = await fetch(`${desktop.url}/project/example`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("xiaotu desktop");
  });

  it("streams TimeAI responses through the desktop origin", async () => {
    const distDir = await mkdtemp(path.join(tmpdir(), "xiaotu-desktop-"));
    await writeFile(path.join(distDir, "index.html"), "desktop", "utf8");
    cleanupTasks.push(() => rm(distDir, { recursive: true, force: true }));
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"delta":"first"}\n\n'));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );

    const desktop = await startDesktopServer({ distDir, fetchImpl, port: 0 });
    cleanupTasks.push(() => desktop.close());

    const response = await fetch(`${desktop.url}/api/timeai/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: "Bearer sk-test", "Content-Type": "application/json" },
      body: "{}",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://timeai.chat/v1/chat/completions",
      expect.objectContaining({ method: "POST", body: expect.any(Buffer) }),
    );
    expect(fetchImpl.mock.calls[0][1].body.toString("utf8")).toBe("{}");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain('data: {"delta":"first"}');
  });
});
