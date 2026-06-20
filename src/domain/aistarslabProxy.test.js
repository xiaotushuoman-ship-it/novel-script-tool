import { describe, expect, it } from "vitest";
import { buildAistarsLabTargetUrl } from "../../api/aistarslab/[...path].js";

describe("AIStartLab proxy target url", () => {
  it("keeps catch-all path slashes for OpenAPI requests", () => {
    expect(buildAistarsLabTargetUrl("openapi/video/task/v2")).toBe(
      "https://api.video.aistarslab.com/openapi/video/task/v2",
    );
  });

  it("forwards query parameters such as taskId when polling video status", () => {
    expect(buildAistarsLabTargetUrl("openapi/video/task/status", { path: "openapi/video/task/status", taskId: "task_123" })).toBe(
      "https://api.video.aistarslab.com/openapi/video/task/status?taskId=task_123",
    );
  });
});
