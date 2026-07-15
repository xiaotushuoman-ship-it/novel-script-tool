import { describe, expect, it, vi } from "vitest";
import { callAi, callAiStream, callImageGeneration } from "./aiClient";

describe("callAi", () => {
  it("calls an OpenAI-compatible endpoint and returns text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "生成结果" } }] }),
    });

    const result = await callAi(
      { endpoint: "https://api.example.com/v1/chat/completions", apiKey: "key", model: "model" },
      "完整提示词",
      fetchImpl,
    );

    expect(result).toBe("生成结果");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("appends chat completions path when endpoint is a v1 base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    await callAi(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt5.5" },
      "完整提示词",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the local proxy for TimeAI calls on deployed runtime while keeping the full endpoint in settings", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    await callAi(
      { endpoint: "https://timeai.chat/v1", apiKey: "server-proxy", model: "gpt-5.5" },
      "完整提示词",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends supported third-party text model ids unchanged", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const supportedModels = [
      "gpt-5.5",
      "gemini-3.1-pro-preview",
      "deepseek-v4-pro",
      "qwen3.7-plus",
      "claude-opus-4-8",
    ];

    for (const model of supportedModels) {
      await callAi({ endpoint: "https://timeai.chat/v1", apiKey: "key", model }, "完整提示词", fetchImpl);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(supportedModels.length);
    expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body as string).model)).toEqual(supportedModels);
  });

  it("uses the dedicated Gemini text key for gemini-3.5-flash requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "接地气对白" } }] }),
    });

    await callAi(
      {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-primary",
        apiKeySecondary: "sk-secondary",
        geminiTextApiKey: "sk-gemini-text",
        model: "gemini-3.5-flash",
        modelApiKeySources: { "gemini-3.5-flash": "secondary" },
      },
      "对白精修",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-gemini-text" }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: "gemini-3.5-flash",
    });
  });

  it("falls back to the primary key when the Gemini text key is blank", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    await callAi(
      {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-primary",
        apiKeySecondary: "sk-secondary",
        geminiTextApiKey: "",
        model: "gemini-3.1-pro-preview",
        modelApiKeySources: { "gemini-3.1-pro-preview": "secondary" },
      },
      "prompt",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-primary" }),
      }),
    );
  });

  it("always uses the primary key for GPT text models", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    await callAi(
      {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-primary",
        apiKeySecondary: "sk-secondary",
        model: "gpt-5.6-sol",
        modelApiKeySources: { "gpt-5.6-sol": "secondary" },
      },
      "prompt",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-primary" }),
      }),
    );
  });

  it("reads text from alternate third-party chat completion shapes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            text: "备用 text 字段结果",
          },
        ],
      }),
    });

    const result = await callAi(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
      "完整提示词",
      fetchImpl,
    );

    expect(result).toBe("备用 text 字段结果");
  });

  it("explains browser network failures instead of leaking failed to fetch", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      callAi(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
        "完整提示词",
        fetchImpl,
      ),
    ).rejects.toThrow("AI 调用失败：网络请求未完成");
    await expect(
      callAi(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
        "完整提示词",
        fetchImpl,
      ),
    ).rejects.toThrow("站内代理");
  });

  it("retries TimeAI text requests directly when the HTTPS proxy has a network failure", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "连接正常" } }] }),
      });

    try {
      const result = await callAi(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gemini-3.5-flash" },
        "请只回复：连接正常",
        fetchImpl,
      );

      expect(result).toBe("连接正常");
      expect(fetchImpl).toHaveBeenNthCalledWith(
        1,
        "/api/timeai/v1/chat/completions",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        "https://timeai.chat/v1/chat/completions",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("explains when both the deployed proxy and direct TimeAI fallback are unreachable", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    try {
      await expect(
        callAi(
          { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gemini-3.5-flash" },
          "请只回复：连接正常",
          fetchImpl,
        ),
      ).rejects.toThrow("站内代理和 TimeAI 直连均未返回结果");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not retry TimeAI text requests directly after an HTTP error", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    try {
      await expect(
        callAi(
          { endpoint: "https://timeai.chat/v1", apiKey: "bad-key", model: "gemini-3.5-flash" },
          "请只回复：连接正常",
          fetchImpl,
        ),
      ).rejects.toThrow("HTTP 401");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not bypass the local TimeAI proxy after a network failure", async () => {
    vi.stubGlobal("location", { protocol: "http:" });
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    try {
      await expect(
        callAi(
          { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gemini-3.5-flash" },
          "请只回复：连接正常",
          fetchImpl,
        ),
      ).rejects.toThrow("站内代理");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("callAiStream", () => {
  it("retries TimeAI streaming requests directly when the HTTPS proxy has a network failure", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    const encoder = new TextEncoder();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"实时结果"}}]}\n\n'));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
      });
    const seen: string[] = [];

    try {
      const result = await callAiStream(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gemini-3.5-flash" },
        "生成正文",
        (chunk) => seen.push(chunk),
        fetchImpl,
      );

      expect(result).toBe("实时结果");
      expect(seen).toEqual(["实时结果"]);
      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        "https://timeai.chat/v1/chat/completions",
        expect.objectContaining({ body: expect.stringContaining('"stream":true') }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("streams text chunks from an SSE response before returning the full text", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"第二段"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          let index = 0;
          return {
            read: async () => {
              if (index >= chunks.length) return { done: true, value: undefined };
              const value = new TextEncoder().encode(chunks[index++]);
              return { done: false, value };
            },
          };
        },
      },
    });
    const seen: string[] = [];

    const result = await callAiStream(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
      "分镜提示词",
      (chunk) => seen.push(chunk),
      fetchImpl,
    );

    expect(seen).toEqual(["第一段", "第二段"]);
    expect(result).toBe("第一段第二段");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"stream":true'),
      }),
    );
  });

  it("streams third-party chunk shapes used by long prompt models", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":[{"type":"text","text":"资产提示词"}]}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"隐藏推理"}}]}\n\n',
      'data: {"type":"response.output_text.delta","delta":"故事板提示词"}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          let index = 0;
          return {
            read: async () => {
              if (index >= chunks.length) return { done: true, value: undefined };
              const value = new TextEncoder().encode(chunks[index++]);
              return { done: false, value };
            },
          };
        },
      },
    });
    const seen: string[] = [];

    const result = await callAiStream(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "claude-opus-4-8" },
      "长提示词",
      (chunk) => seen.push(chunk),
      fetchImpl,
    );

    expect(seen).toEqual(["资产提示词", "故事板提示词"]);
    expect(result).toBe("资产提示词故事板提示词");
  });

  it("uses the dedicated Gemini text key for gemini-3.5-flash streaming requests", async () => {
    const chunks = ['data: {"choices":[{"delta":{"content":"自然对白"}}]}\n\n', "data: [DONE]\n\n"];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          let index = 0;
          return {
            read: async () => {
              if (index >= chunks.length) return { done: true, value: undefined };
              return { done: false, value: new TextEncoder().encode(chunks[index++]) };
            },
          };
        },
      },
    });

    await callAiStream(
      {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-primary",
        apiKeySecondary: "sk-secondary",
        geminiTextApiKey: "sk-gemini-text",
        model: "gemini-3.5-flash",
        modelApiKeySources: { "gemini-3.5-flash": "secondary" },
      },
      "对白精修",
      () => undefined,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-gemini-text" }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: "gemini-3.5-flash",
      stream: true,
    });
  });

  it("streams data lines even when the proxy or upstream does not send blank SSE frame separators", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"人物资产"}}]}\n',
      '{"choices":[{"delta":{"content":"场景资产"}}]}\n',
      'data: {"type":"response.output_text.delta","delta":"故事板"}\n',
    ];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          let index = 0;
          return {
            read: async () => {
              if (index >= chunks.length) return { done: true, value: undefined };
              const value = new TextEncoder().encode(chunks[index++]);
              return { done: false, value };
            },
          };
        },
      },
    });
    const seen: string[] = [];

    const result = await callAiStream(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
      "资产和故事板长提示词",
      (chunk) => seen.push(chunk),
      fetchImpl,
    );

    expect(seen).toEqual(["人物资产", "场景资产", "故事板"]);
    expect(result).toBe("人物资产场景资产故事板");
  });

  it("streams plain text chunks when a proxy forwards non-SSE text progressively", async () => {
    const chunks = ["【段落1】\n", "【基础设定】许燃站在门外。\n", "【画面内容】许燃看向宋叔亭。"];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          let index = 0;
          return {
            read: async () => {
              if (index >= chunks.length) return { done: true, value: undefined };
              const value = new TextEncoder().encode(chunks[index++]);
              return { done: false, value };
            },
          };
        },
      },
    });
    const seen: string[] = [];

    const result = await callAiStream(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "claude-opus-4-8" },
      "小兔skill长提示词",
      (chunk) => seen.push(chunk),
      fetchImpl,
    );

    expect(seen).toEqual(chunks.map((chunk) => chunk.trim()));
    expect(result).toBe(chunks.map((chunk) => chunk.trim()).join(""));
  });

  it("keeps long text streams open while the first chunk is slow", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let readCount = 0;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          return {
            read: async () => {
              readCount += 1;
              if (readCount > 1) return { done: true, value: undefined };
              await new Promise((resolve) => setTimeout(resolve, 31_000));
              return {
                done: false,
                value: encoder.encode('data: {"choices":[{"delta":{"content":"第1章实时返回"}}]}\n\n'),
              };
            },
          };
        },
      },
    });
    const seen: string[] = [];

    const resultPromise = callAiStream(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
      "长篇小说提示词",
      (chunk) => seen.push(chunk),
      fetchImpl,
    );

    await vi.advanceTimersByTimeAsync(31_000);
    await expect(resultPromise).resolves.toBe("第1章实时返回");
    expect(seen).toEqual(["第1章实时返回"]);
    vi.useRealTimers();
  });

  it("falls back to a normal chat completion when streaming is unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "普通生成结果" } }] }),
      });
    const seen: string[] = [];

    const result = await callAiStream(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "claude-opus-4-8" },
      "长分镜提示词",
      (chunk) => seen.push(chunk),
      fetchImpl,
    );

    expect(result).toBe("普通生成结果");
    expect(seen).toEqual(["普通生成结果"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: "claude-opus-4-8",
      stream: true,
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body as string)).toMatchObject({
      model: "claude-opus-4-8",
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body as string)).not.toHaveProperty("stream");
  });

  it("reports a clear timeout when streaming stalls without any chunks", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader() {
            return {
              read: async () => {
                throw new Error("AI 流式响应超时");
              },
            };
          },
        },
      });
    await expect(
      callAiStream(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
        "卡住回退测试",
        () => undefined,
        fetchImpl,
      ),
    ).rejects.toThrow("AI 流式响应超时");
  });
});

describe("callImageGeneration", () => {
  it("calls an OpenAI-compatible image generation endpoint and returns image references", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: "https://img.example.com/a.png" }] }),
    });

    const result = await callImageGeneration(
      { endpoint: "https://api.example.com/v1", apiKey: "key", model: "gpt-5.5" },
      "人物出图提示词",
      "gpt-image-2",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(result).toBe("https://img.example.com/a.png");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"model":"gpt-image-2"'),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      response_format: "url",
      size: "1536x1024",
    });
  });

  it("sends gpt-image-2-all image model unchanged to third-party gateways", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: "https://img.example.com/all.png" }] }),
    });

    await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
      "人物出图提示词",
      "gpt-image-2-all",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: "gpt-image-2-all",
    });
  });

  it("extracts nested image urls from all-in-one image gateway responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: "output_image",
                image_url: {
                  url: "https://oaidalleapiprodscus.blob.core.windows.net/private/generated?id=abc",
                },
              },
            ],
          },
        ],
      }),
    });

    const result = await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
      "人物出图提示词",
      "gpt-image-2-all",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(result).toBe("https://oaidalleapiprodscus.blob.core.windows.net/private/generated?id=abc");
  });

  it("extracts image urls from common third-party gateway image fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          image: "https://cdn.example.com/generated?id=abc&token=secure",
        },
      }),
    });

    const result = await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
      "人物出图提示词",
      "gpt-image-2-all",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(result).toBe("https://cdn.example.com/generated?id=abc&token=secure");
  });

  it("explains image rate limits with an actionable message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "rate limited" } }),
    });

    await expect(
      callImageGeneration(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
        "人物出图提示词",
        "gpt-image-2",
        "16:9",
        "1K",
        fetchImpl,
      ),
    ).rejects.toThrow("限流/额度限制");
  });

  it("explains oversized image requests with an actionable message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ error: { message: "payload too large" } }),
    });

    await expect(
      callImageGeneration(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
        "data:image/png;base64," + "a".repeat(2000),
        "gpt-image-2",
        "16:9",
        "4K",
        fetchImpl,
      ),
    ).rejects.toThrow("请求内容过大");
  });

  it("includes upstream image error details when the gateway returns 503", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "model gpt-image-2 is not available for this API group" } }),
    });

    await expect(
      callImageGeneration(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
        "asset prompt",
        "gpt-image-2",
        "16:9",
        "1K",
        fetchImpl,
      ),
    ).rejects.toThrow("model gpt-image-2 is not available for this API group");
  });

  it("explains Vercel image proxy timeouts with an actionable message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      text: async () => "An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT",
    });

    await expect(
      callImageGeneration(
        { endpoint: "https://timeai.chat/v1", apiKey: "key", model: "gpt-5.5" },
        "asset prompt",
        "gpt-image-2",
        "16:9",
        "1K",
        fetchImpl,
      ),
    ).rejects.toThrow("网页端代理等待图片生成超时");
  });

  it("sends 2K gpt-image requests when high resolution is selected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: "https://img.example.com/2k.png" }] }),
    });

    await callImageGeneration(
      { endpoint: "https://api.example.com/v1", apiKey: "key", model: "gpt-5.5" },
      "人物出图提示词",
      "gpt-image-1",
      "16:9",
      "2K",
      fetchImpl,
    );

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: "gpt-image-2",
      size: "2560x1440",
    });
  });

  it("sends 4K gpt-image requests when 4K is requested", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: "https://img.example.com/4k.png" }] }),
    });

    await callImageGeneration(
      { endpoint: "https://api.example.com/v1", apiKey: "key", model: "gpt-5.5" },
      "人物高清放大提示词",
      "gpt-image-2",
      "16:9",
      "4K",
      fetchImpl,
    );

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: "gpt-image-2",
      size: "3840x2160",
    });
  });

  it("uses the OpenAI-compatible image endpoint for third-party Gemini image models", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: "https://img.example.com/gemini.png" }] }),
    });

    await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "sk-third-party", model: "gpt-5.5" },
      "Third-party Gemini image prompt",
      "gemini-3.1-flash-preview",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-third-party",
        }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      model: "gemini-3.1-flash-preview",
      prompt: "Third-party Gemini image prompt",
      size: "1792x1024",
    });
  });

  it("keeps direct TimeAI image requests on HTTPS runtimes", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: "https://img.example.com/production.png" }] }),
    });

    try {
      await callImageGeneration(
        { endpoint: "https://timeai.chat/v1", apiKey: "sk-third-party", model: "gpt-5.5" },
        "Production image prompt",
        "gpt-image-2",
        "16:9",
        "1K",
        fetchImpl,
      );

      expect(fetchImpl).toHaveBeenCalledWith(
        "https://timeai.chat/v1/images/generations",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("routes the Gemini flash lite image model to the Gemini generateContent endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: "abc123" } }],
            },
          },
        ],
      }),
    });

    await callImageGeneration(
      { endpoint: "https://generativelanguage.googleapis.com/v1beta", apiKey: "sk-gemini", model: "gpt-5.5" },
      "Gemini lite image prompt",
      "gemini-3.1-flash-lite-image",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("falls back to chat completions for third-party Gemini image models when image generation is unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "model unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "已生成：![image](https://img.example.com/from-chat.png)",
              },
            },
          ],
        }),
      });

    const result = await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "sk-third-party", model: "gpt-5.5" },
      "Third-party Gemini image prompt",
      "gemini-3-pro-image-preview",
      "9:16",
      "1K",
      fetchImpl,
    );

    expect(result).toBe("https://img.example.com/from-chat.png");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/timeai/v1/images/generations",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-third-party",
        }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body as string)).toMatchObject({
      model: "gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: expect.stringContaining("Third-party Gemini image prompt"),
        },
      ],
    });
  });

  it("extracts extensionless and html image urls from third-party chat image responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "model unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '<img src="https://cdn.example.com/generated/image?id=abc123&token=secure"> {"url":"https://cdn.example.com/second?id=456"}',
              },
            },
          ],
        }),
      });

    const result = await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "sk-third-party", model: "gpt-5.5" },
      "Third-party Gemini image prompt",
      "gemini-3-pro-image-preview",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(result).toBe(
      ["https://cdn.example.com/generated/image?id=abc123&token=secure", "https://cdn.example.com/second?id=456"].join(
        "\n",
      ),
    );
  });

  it("falls back to a third-party Gemini v1beta generateContent endpoint when other image routes fail", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "image endpoint unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "chat endpoint unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: "third-party-base64",
                    },
                  },
                ],
              },
            },
          ],
        }),
      });

    const result = await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "sk-third-party", model: "gpt-5.5" },
      "Third-party Gemini v1beta image prompt",
      "gemini-3.1-flash-preview",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(result).toBe("data:image/png;base64,third-party-base64");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "/api/timeai/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-third-party",
        }),
      }),
    );
  });

  it("maps the Gemini flash lite image model for third-party v1beta generateContent fallback", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "image endpoint unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "chat endpoint unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: "flash-lite-third-party-base64",
                    },
                  },
                ],
              },
            },
          ],
        }),
      });

    const result = await callImageGeneration(
      { endpoint: "https://timeai.chat/v1", apiKey: "sk-third-party", model: "gpt-5.5" },
      "Third-party Gemini flash lite image prompt",
      "gemini-3.1-flash-lite-image",
      "16:9",
      "1K",
      fetchImpl,
    );

    expect(result).toBe("data:image/png;base64,flash-lite-third-party-base64");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "/api/timeai/v1beta/models/gemini-3.1-flash-lite-image-preview:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-third-party",
        }),
      }),
    );
  });

  it("calls the native Gemini image endpoint for Gemini image models", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: "base64-image",
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const result = await callImageGeneration(
      { endpoint: "https://generativelanguage.googleapis.com/v1", apiKey: "gemini-key", model: "gpt-5.5" },
      "Gemini native image prompt",
      "gemini-3-pro-image-preview",
      "21:9",
      "2K",
      fetchImpl,
    );

    expect(result).toBe("data:image/png;base64,base64-image");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1/models/gemini-3-pro-image:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "gemini-key",
        }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toMatchObject({
      contents: [{ parts: [{ text: expect.stringContaining("Gemini native image prompt") }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        responseFormat: {
          image: {
            aspectRatio: "21:9",
            imageSize: "2K",
          },
        },
      },
    });
  });

  it("uses the secondary api key when the current model is mapped to it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    await callAi(
      {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-primary",
        apiKeySecondary: "sk-secondary",
        apiKeySource: "secondary",
        modelApiKeySources: { "deepseek-v4-pro": "secondary" },
        model: "deepseek-v4-pro",
      },
      "瀹屾暣鎻愮ず璇?",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-secondary",
        }),
      }),
    );
  });

  it("uses the claude api key when the current model is mapped to it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    await callAi(
      {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-primary",
        claudeApiKey: "sk-claude",
        modelApiKeySources: { "claude-opus-4-8": "claude" },
        model: "claude-opus-4-8",
      },
      "测试内容",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/timeai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-claude",
        }),
      }),
    );
  });
});
