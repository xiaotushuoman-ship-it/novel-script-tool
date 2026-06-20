import { describe, expect, it, vi } from "vitest";
import {
  createAistarsLabVideoTask,
  fetchAistarsLabVideoTask,
  getSeedanceModelsForChannel,
  normalizeSeedanceVideoCount,
  normalizeAistarsLabEndpoint,
  resolveSeedanceModelSelection,
  type AistarsLabVideoConfig,
} from "./aistarslabVideo";

describe("aistarsLabVideo", () => {
  it("normalizes the public OpenAPI endpoint to the local proxy", () => {
    expect(normalizeAistarsLabEndpoint("https://api.video.aistarslab.com/openapi")).toBe("/api/aistarslab/openapi");
  });

  it("creates and polls video tasks through the proxy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ code: 0, msg: "success", data: { taskId: "test_123", status: 1, costCredits: 0 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            code: 0,
            msg: "success",
            data: { taskId: "test_123", status: 3, progress: 100, outputUrl: "https://example.com/video.mp4" },
          }),
      });

    const settings = { endpoint: "https://api.video.aistarslab.com/openapi", apiKey: "sk-test" };
    const created = await createAistarsLabVideoTask(
      settings,
      {
        channel: "test",
        model: "test-video",
        prompt: "测试视频",
        seconds: 5,
        size: "16:9",
        modeType: "text2video",
      },
      fetchMock as unknown as typeof fetch,
    );
    const task = await fetchAistarsLabVideoTask(settings, created.taskId, fetchMock as unknown as typeof fetch);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/aistarslab/openapi/video/task/v2");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/aistarslab/openapi/video/task/status?taskId=test_123");
    expect(task.outputUrl).toBe("https://example.com/video.mp4");
  });

  it("filters models by the selected channel and resolves invalid model selections", () => {
    const config: AistarsLabVideoConfig = {
      channels: [
        {
          channel: "12",
          title: "视频-Seedance2.0-720P线路1",
          secondsMin: 4,
          secondsMax: 15,
          aspectRatios: ["9:16"],
          supportedModeTypes: ["image2video"],
          models: [
            { model: "seedance-2.0-720p-fast", label: "seedance2.0-720P-FAST VIP", resolutions: ["720p"] },
            { model: "seedance-2.0-720p", label: "seedance2.0-720P-VIP", resolutions: ["720p"] },
          ],
        },
        {
          channel: "13",
          title: "视频-Seedance2.0-480P线路1",
          secondsMin: 4,
          secondsMax: 15,
          aspectRatios: ["9:16"],
          supportedModeTypes: ["image2video"],
          models: [
            { model: "seedance-2.0-480p-fast", label: "seedance2.0-480P-FAST VIP", resolutions: ["480p"] },
            { model: "seedance-2.0-480p", label: "seedance2.0-480P-VIP", resolutions: ["480p"] },
          ],
        },
      ],
    };

    expect(getSeedanceModelsForChannel(config, "13").map((model) => model.label)).toEqual([
      "seedance2.0-480P-FAST VIP",
      "seedance2.0-480P-VIP",
    ]);
    expect(resolveSeedanceModelSelection(config, "13", "seedance-2.0-720p")).toMatchObject({
      channel: "13",
      model: "seedance-2.0-480p-fast",
      resolution: "480p",
    });
  });

  it("normalizes video batch count to a safe range", () => {
    expect(normalizeSeedanceVideoCount("3")).toBe(3);
    expect(normalizeSeedanceVideoCount("0")).toBe(1);
    expect(normalizeSeedanceVideoCount("20")).toBe(6);
    expect(normalizeSeedanceVideoCount("abc")).toBe(1);
  });
});
