import { describe, expect, it } from "vitest";
import {
  ADULT_FEMALE_BODY_STANDARD,
  ANCIENT_ADULT_MALE_BODY_STANDARD,
  ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS,
  EXCEPTION_BODY_STANDARD,
  MODERN_ADULT_MALE_BODY_STANDARD,
  NEUTRAL_BODY_STANDARD,
  extractAssetCharacterBodyStandard,
  removeAssetCharacterBodyStandard,
  resolveAssetCharacterBodyStandard,
} from "./assetCharacterBodyStandards";

describe("resolveAssetCharacterBodyStandard", () => {
  it("returns the complete adult female standard for an adult urban designer", () => {
    const result = resolveAssetCharacterBodyStandard("成年女性，都市设计师");

    expect(result).toBe(ADULT_FEMALE_BODY_STANDARD);
    expect(result).toContain("体态标准：");
    expect(result).toContain("饱满S曲线");
    expect(result).toContain("窄肩蜂腰");
    expect(result).toContain("圆润胯部");
    expect(result).toContain("前凸后翘");
    expect(result).toContain("修长笔直大长腿");
    expect(result).toContain("正面侧面背面比例一致");
  });

  it("returns the complete ancient adult male standard for a general in battle robes", () => {
    const result = resolveAssetCharacterBodyStandard("成年男性，古风将军，束腰战袍");

    expect(result).toBe(ANCIENT_ADULT_MALE_BODY_STANDARD);
    expect(result).toContain("标准宽肩窄腰");
    expect(result).toContain("直角肩");
    expect(result).toContain("修长躯干");
    expect(result).toContain("流畅不臃肿肌肉");
    expect(result).toContain("修长双腿");
  });

  it("returns the complete modern adult male standard for an urban man in a suit", () => {
    const result = resolveAssetCharacterBodyStandard("成年男性，现代都市，黑色西装");

    expect(result).toBe(MODERN_ADULT_MALE_BODY_STANDARD);
    expect(result).toContain("宽肩阔背");
    expect(result).toContain("紧致窄腰");
    expect(result).toContain("挺拔躯干");
    expect(result).toContain("自然不夸张肌肉");
    expect(result).toContain("长腿");
  });

  it.each(["儿童", "未成年", "老人", "病弱", "残障", "特殊身份"])(
    "keeps %s characters faithful to the source instead of applying adult standards",
    (exception) => {
      const result = resolveAssetCharacterBodyStandard(`${exception}，女性，现代都市设计师`);

      expect(result).toBe(EXCEPTION_BODY_STANDARD);
      expect(result).toContain("严格按原文年龄与身体状况塑造");
      expect(result).not.toBe(ADULT_FEMALE_BODY_STANDARD);
      expect(result).not.toBe(ANCIENT_ADULT_MALE_BODY_STANDARD);
      expect(result).not.toBe(MODERN_ADULT_MALE_BODY_STANDARD);
    },
  );

  it.each(["矮壮", "魁梧", "瘦小", "年长"])("prioritizes an explicit male %s body description", (bodyType) => {
    const result = resolveAssetCharacterBodyStandard(`男性，现代都市西装，${bodyType}`);

    expect(result).toBe(EXCEPTION_BODY_STANDARD);
    expect(result).toContain("原文体态优先");
    expect(result).not.toBe(MODERN_ADULT_MALE_BODY_STANDARD);
  });

  it("uses the neutral fallback when identity and era are unknown", () => {
    const result = resolveAssetCharacterBodyStandard("神秘来客，身份不明");

    expect(result).toBe(NEUTRAL_BODY_STANDARD);
    expect(result).toContain("服从原文");
    expect(result).toContain("正侧背一致");
  });

  it("uses existing body standard fields before all inferred routes", () => {
    expect(resolveAssetCharacterBodyStandard("成年女性；体态标准: 瘦高且轻微驼背；现代都市设计师")).toBe(
      "体态标准：瘦高且轻微驼背",
    );
  });

  it.each([
    "成年男性，古风仙侠剑客",
    "成年男性，玄幻权谋角色",
    "成年男性，武侠古代将军",
    "成年男性，长袍战袍锦衣",
  ])("recognizes ancient clues in %s", (description) => {
    expect(resolveAssetCharacterBodyStandard(description)).toBe(ANCIENT_ADULT_MALE_BODY_STANDARD);
  });

  it.each([
    "成年男性，现代都市职场",
    "成年男性，校园成年角色",
    "成年男性，西装通勤造型",
    "成年男性，街头工装设计师",
  ])("recognizes modern clues in %s", (description) => {
    expect(resolveAssetCharacterBodyStandard(description)).toBe(MODERN_ADULT_MALE_BODY_STANDARD);
  });
});

describe("body standard fields", () => {
  it.each([
    ["人物外貌：冷峻\n体态标准：瘦高，轻微驼背\n人物的身份：账房先生", "体态标准：瘦高，轻微驼背"],
    ["人物外貌：冷峻；体态标准: 瘦高，轻微驼背；人物的身份：账房先生", "体态标准：瘦高，轻微驼背"],
    ["人物外貌: 冷峻; body note；体态标准：瘦高; 人物的身份: 账房先生", "体态标准：瘦高"],
  ])("extracts and normalizes body standards from supported separators", (description, expected) => {
    expect(extractAssetCharacterBodyStandard(description)).toBe(expected);
  });

  it("removes only the body standard field and preserves other fields", () => {
    expect(removeAssetCharacterBodyStandard("人物外貌：冷峻；体态标准: 瘦高；人物的身份：账房先生")).toBe(
      "人物外貌：冷峻；人物的身份：账房先生",
    );
  });

  it("returns unmatched descriptions unchanged", () => {
    const description = "人物外貌：冷峻；人物的身份：账房先生";

    expect(extractAssetCharacterBodyStandard(description)).toBeNull();
    expect(removeAssetCharacterBodyStandard(description)).toBe(description);
  });
});

describe("ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS", () => {
  it("fully documents standards, exceptions, source priority, and style boundaries", () => {
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(ADULT_FEMALE_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(ANCIENT_ADULT_MALE_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(MODERN_ADULT_MALE_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(EXCEPTION_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("男性原文体态优先");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("画风仅控制材质");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("不得写“按统一标准”“身材好”或省略");
  });
});
