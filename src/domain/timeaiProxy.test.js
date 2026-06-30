import { describe, expect, it, vi } from "vitest";
import { config as timeAiRootConfig } from "../../api/timeai.js";
import { buildTimeAiTargetUrl, config as timeAiPathConfig, forwardTimeAiRequest } from "../../api/timeai/[...path].js";

describe("TimeAI proxy target url", () => {
  it("keeps catch-all path slashes for chat completions", () => {
    expect(buildTimeAiTargetUrl("v1/chat/completions")).toBe("https://timeai.chat/v1/chat/completions");
  });

  it("keeps Vercel path arrays as normal API paths", () => {
    expect(buildTimeAiTargetUrl(["v1", "images", "generations"])).toBe("https://timeai.chat/v1/images/generations");
  });

  it("keeps Gemini generateContent colon while encoding unsafe characters", () => {
    expect(buildTimeAiTargetUrl("v1beta/models/gemini-3.1-flash-image-preview:generateContent")).toBe(
      "https://timeai.chat/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
    );
  });

  it("configures TimeAI proxy functions for long image requests", () => {
    expect(timeAiRootConfig.maxDuration).toBe(300);
    expect(timeAiPathConfig.maxDuration).toBe(300);
  });

  it("flushes streaming TimeAI responses before the upstream finishes", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.TIMEAI_API_KEY;
    process.env.TIMEAI_API_KEY = "sk-test";
    const encoder = new TextEncoder();
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"第二段"}}]}\n\n'));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    const writes = [];
    const response = {
      statusCode: 0,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      flushHeaders: vi.fn(),
      flush: vi.fn(),
      write(chunk) {
        writes.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      },
      end: vi.fn(),
      json: vi.fn(),
    };

    try {
      await forwardTimeAiRequest(
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer sk-test" },
          body: { stream: true },
          query: { path: "v1/chat/completions" },
        },
        response,
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) delete process.env.TIMEAI_API_KEY;
      else process.env.TIMEAI_API_KEY = originalApiKey;
    }

    expect(response.flushHeaders).toHaveBeenCalled();
    expect(writes[0]).toBe(": stream-open\n\n");
    expect(writes.join("")).toContain("第一段");
    expect(writes.join("")).toContain("第二段");
    expect(response.flush).toHaveBeenCalled();
  });
});
