import { describe, expect, it } from "vitest";
import { buildTimeAiTargetUrl } from "../../api/timeai/[...path].js";

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
});
