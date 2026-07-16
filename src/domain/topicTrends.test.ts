import { describe, expect, it } from "vitest";
import {
  buildTopicTrendPrompt,
  getDefaultTopicStyle,
  getLocalTopicRecommendations,
  getTopicStyles,
  normalizeTopicRecommendations,
  TOPIC_GENRE_OPTIONS,
} from "./topicTrends";

describe("topic trends", () => {
  it("provides matching prose styles and at least four local recommendations for every genre", () => {
    expect(TOPIC_GENRE_OPTIONS).toHaveLength(14);

    for (const genre of TOPIC_GENRE_OPTIONS) {
      const styles = getTopicStyles(genre);
      const recommendations = getLocalTopicRecommendations(genre);
      expect(styles.length).toBeGreaterThanOrEqual(3);
      expect(getDefaultTopicStyle(genre)).toBe(styles[0]);
      expect(recommendations.length).toBeGreaterThanOrEqual(4);
      const invalid = recommendations.filter((item) => item.genre !== genre || !styles.includes(item.style));
      expect(invalid, `${genre} has mismatched fallback styles`).toEqual([]);
    }
  });

  it("builds a date-aware prompt constrained to the selected genre and styles", () => {
    const prompt = buildTopicTrendPrompt("古风权谋", new Date("2026-07-17T08:00:00+08:00"));

    expect(prompt).toContain("2026-07-17");
    expect(prompt).toContain("最近30至90天");
    expect(prompt).toContain("题材类型：古风权谋");
    expect(prompt).toContain("历史权谋");
    expect(prompt).toContain("title, summary, outline, tags, style, genre");
  });

  it("drops invalid items and normalizes missing styles to the selected genre default", () => {
    const items = normalizeTopicRecommendations("都市男频", [
      {
        title: "县城技能局",
        summary: "小城青年用技术解决现实难题。",
        outline: "主角回到县城，从一次设备抢修切入，逐步打破行业垄断。",
        tags: ["县城", "技能", "逆袭"],
        style: "都市爽文",
        genre: "都市男频",
      },
      {
        title: "错误文风",
        summary: "字段完整但文风跨类型。",
        outline: "这条结果必须被过滤。",
        tags: ["测试"],
        style: "古言甜宠",
        genre: "都市男频",
      },
      {
        title: "默认文风",
        summary: "没有文风时使用当前类型默认值。",
        outline: "主角靠职业能力守住自己的项目。",
        tags: ["职业", "成长"],
        genre: "都市男频",
      },
      {
        title: "错误题材",
        summary: "文风合法但题材与当前选择不一致。",
        outline: "这条结果必须被过滤。",
        tags: ["测试"],
        style: "都市爽文",
        genre: "古风权谋",
      },
      { title: "缺少大纲", summary: "无效", tags: ["测试"], style: "都市爽文" },
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title)).toEqual(["县城技能局", "默认文风"]);
    expect(items[1].style).toBe("都市爽文");
    expect(items.every((item) => item.genre === "都市男频")).toBe(true);
  });
});
