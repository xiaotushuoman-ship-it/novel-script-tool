import { describe, expect, it } from "vitest";
import { checkSeedanceSafety } from "./seedanceSafety";

describe("checkSeedanceSafety", () => {
  it("reports Seedance video prompt risks with rewrite suggestions", () => {
    const report = checkSeedanceSafety("镜头里出现血腥伤口，角色掏枪开枪，并带有水印logo。");

    expect(report.hasIssues).toBe(true);
    expect(report.issues.map((issue) => issue.category)).toEqual(["暴力血腥", "危险违法", "平台与版权"]);
    expect(report.issues[0].matches).toContain("血腥");
    expect(report.issues[0].suggestion).toContain("受伤反馈");
    expect(report.summary).toContain("发现 3 类 SEEDAN2.0 视频生成风险");
  });

  it("returns a clean report for safe cinematic prompts", () => {
    const report = checkSeedanceSafety("夜市摊前，男主低头端起热面，镜头从侧后方跟拍，人群安静围观。");

    expect(report.hasIssues).toBe(false);
    expect(report.issues).toHaveLength(0);
    expect(report.summary).toBe("未发现明显 SEEDAN2.0 视频生成违禁词风险。");
  });
});
