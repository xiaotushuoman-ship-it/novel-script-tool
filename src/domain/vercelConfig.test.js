import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel deployment config", () => {
  it("lets the TimeAI proxy wait up to the common Vercel plan limit", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));

    expect(config.functions?.["api/timeai.js"]).toMatchObject({
      maxDuration: 300,
    });
    expect(config.functions?.["api/timeai/[...path].js"]).toMatchObject({
      maxDuration: 300,
    });
  });
});
