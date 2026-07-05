// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { forwardLocalTimeAiRequest } from "../../vite.config.ts";

describe("Vite local TimeAI proxy", () => {
  it("flushes streaming responses before the upstream finishes", async () => {
    const originalFetch = globalThis.fetch;
    const encoder = new TextEncoder();
    globalThis.fetch = vi.fn(async () =>
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
      ),
    );

    const request = new EventEmitter();
    request.method = "POST";
    request.url = "/v1/chat/completions";
    request.headers = { "content-type": "application/json", authorization: "Bearer sk-test" };

    const writes = [];
    const response = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      flushHeaders: vi.fn(),
      flush: vi.fn(),
      write(chunk) {
        writes.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      },
      end: vi.fn(),
    };

    try {
      const result = forwardLocalTimeAiRequest(request, response);
      request.emit("data", Buffer.from("{}"));
      request.emit("end");
      await result;
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(response.headers.Connection).toBe("keep-alive");
    expect(response.flushHeaders).toHaveBeenCalled();
    expect(writes[0]).toBe(": stream-open\n\n");
    expect(writes.join("")).toContain("第一段");
    expect(writes.join("")).toContain("第二段");
    expect(response.flush).toHaveBeenCalled();
  });
});
