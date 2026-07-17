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

describe("body standard constants", () => {
  it("defines the complete adult female standard", () => {
    expect(ADULT_FEMALE_BODY_STANDARD).toBe(
      "体态标准：成年女性采用饱满S曲线、窄肩蜂腰、圆润胯部、前凸后翘、修长笔直大长腿，站姿自然挺拔，正面侧面背面比例一致。",
    );
  });

  it("defines every ancient adult male requirement", () => {
    expect(ANCIENT_ADULT_MALE_BODY_STANDARD).toBe(
      "体态标准：古风成年男性采用标准宽肩窄腰、挺拔直角肩线、躯干修长匀称、线条利落干净、肌肉轮廓流畅不臃肿、身姿端正俊朗、笔直修长双腿，正面侧面背面比例一致。",
    );
  });

  it("defines every modern adult male requirement", () => {
    expect(MODERN_ADULT_MALE_BODY_STANDARD).toBe(
      "体态标准：现代成年男性采用宽肩阔背、紧致窄腰、躯干挺拔匀称、体态干净利落、肌肉线条紧致自然、不夸张不臃肿、比例协调、修长笔直大长腿，正面侧面背面比例一致。",
    );
  });

  it("defines the complete exception standard", () => {
    expect(EXCEPTION_BODY_STANDARD).toBe(
      "体态标准：严格按原文年龄与身体状况塑造，原文体态优先，不强制套用成年男女统一比例，正面侧面背面保持原文设定一致。",
    );
  });

  it("defines the complete neutral source-first standard", () => {
    expect(NEUTRAL_BODY_STANDARD).toBe(
      "体态标准：体态严格服从原文年龄、身份和剧情，正侧背比例一致；身份不明时保持中性，不猜测成年男女比例。",
    );
  });
});

describe("resolveAssetCharacterBodyStandard", () => {
  it.each([
    "成年女性，都市设计师",
    "性别：女；年龄：28岁；时代：现代",
    "女性，二十多岁，都市设计师",
  ])("routes %s to the adult female standard", (description) => {
    expect(resolveAssetCharacterBodyStandard(description)).toBe(ADULT_FEMALE_BODY_STANDARD);
  });

  it.each([
    "成年男性，古风将军，束腰战袍",
    "性别：男；年龄：32岁；时代：古代；身份：将军",
    "男性，二十多岁，古代将军",
  ])("routes %s to the ancient adult male standard", (description) => {
    expect(resolveAssetCharacterBodyStandard(description)).toBe(ANCIENT_ADULT_MALE_BODY_STANDARD);
  });

  it.each([
    "成年男性，现代都市，黑色西装",
    "性别：男；年龄：27岁；都市设计师",
    "男性，三十岁，职场通勤",
    "性别：男；年龄：59岁；现代职场",
    "28岁男，当代职场",
    "男，二十多岁，现今通勤",
    "性别：男；年龄：35岁；如今都市",
  ])("routes %s to the modern adult male standard", (description) => {
    expect(resolveAssetCharacterBodyStandard(description)).toBe(MODERN_ADULT_MALE_BODY_STANDARD);
  });

  it.each([
    "28岁女",
    "女，三十岁",
    "性别：女；年龄：28岁；时代：当代",
  ])("recognizes bounded female wording in %s", (description) => {
    expect(resolveAssetCharacterBodyStandard(description)).toBe(ADULT_FEMALE_BODY_STANDARD);
  });

  it.each([
    "男女比例未注明，28岁，现代都市",
    "女装设计师，28岁，现代都市",
    "男装设计师，28岁，现代都市",
    "女性化设计，28岁，现代都市",
    "男性化剪裁，28岁，现代都市",
  ])("does not infer gender from a word-internal marker in %s", (description) => {
    expect(resolveAssetCharacterBodyStandard(description)).toBe(NEUTRAL_BODY_STANDARD);
  });

  it.each([
    "性别：女；年龄：80岁；时代：现代",
    "九十岁古代男性",
    "七旬老者",
    "六十多岁女性",
    "性别：女；年龄：60岁；时代：现代",
    "八十岁现代男性",
    "六旬女性",
    "年龄：60周岁；性别：女；时代：现代",
    "六十岁女性",
    "七十八岁古代男性",
    "九十多岁女性",
    "一百岁女性",
    "百岁老人",
  ])("routes senior age wording in %s to the exception standard", (description) => {
    const result = resolveAssetCharacterBodyStandard(description);

    expect(result).toBe(EXCEPTION_BODY_STANDARD);
    expect(result).not.toContain("饱满S曲线");
    expect(result).not.toContain("标准宽肩窄腰");
    expect(result).not.toContain("宽肩阔背");
  });

  it.each([
    "儿童，性别：女；年龄：8岁；时代：现代",
    "未成年男性，17岁，古代将军之子",
    "少年，18岁，现代都市",
    "少女，19岁，现代都市",
    "女性，十岁，都市设计师",
    "未满十八岁女性，现代都市",
    "不满十八岁男性，古代将军",
    "未满18岁女性，现代都市",
    "不满18岁男性，古代将军",
    "18岁以下女性，现代都市",
    "未到18岁男性，古代将军",
    "未成年女性，18岁，现代都市",
  ])("keeps explicit child or minor wording exceptional in %s", (description) => {
    const result = resolveAssetCharacterBodyStandard(description);

    expect(result).toBe(EXCEPTION_BODY_STANDARD);
    expect(result).not.toBe(ADULT_FEMALE_BODY_STANDARD);
    expect(result).not.toBe(ANCIENT_ADULT_MALE_BODY_STANDARD);
    expect(result).not.toBe(MODERN_ADULT_MALE_BODY_STANDARD);
  });

  it.each(["老人", "病弱", "残障", "特殊身份"])("keeps %s characters exceptional", (exception) => {
    expect(resolveAssetCharacterBodyStandard(`${exception}，女性，28岁，现代都市设计师`)).toBe(
      EXCEPTION_BODY_STANDARD,
    );
  });

  it.each([
    ["成年男性，古风护卫，身材矮壮", "矮壮"],
    ["成年男性，古代将军，体格魁梧", "魁梧"],
    ["男性，二十多岁，现代职场，身形瘦小", "瘦小"],
    ["成年男性，现代西装，面相年长", "年长"],
  ])("preserves the explicit male body type from %s", (description, bodyType) => {
    const result = resolveAssetCharacterBodyStandard(description);

    expect(result).toContain(bodyType);
    expect(result).toContain("严格保持原文明确体态，正侧背比例一致");
    expect(result).not.toBe(ANCIENT_ADULT_MALE_BODY_STANDARD);
    expect(result).not.toBe(MODERN_ADULT_MALE_BODY_STANDARD);
  });

  it("uses existing fields before inferred routes and preserves them verbatim", () => {
    expect(resolveAssetCharacterBodyStandard("成年女性；体态标准:  瘦高且轻微驼背  ；现代都市设计师")).toBe(
      "体态标准:  瘦高且轻微驼背  ",
    );
  });

  it("uses the neutral fallback when identity and era are unknown", () => {
    expect(resolveAssetCharacterBodyStandard("神秘来客，身份不明")).toBe(NEUTRAL_BODY_STANDARD);
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
    ["人物外貌：冷峻\n体态标准： 瘦高，轻微驼背 \n人物的身份：账房先生", "体态标准： 瘦高，轻微驼背 "],
    ["人物外貌：冷峻；体态标准:  瘦高，轻微驼背  ；人物的身份：账房先生", "体态标准:  瘦高，轻微驼背  "],
    ["人物外貌: 冷峻; body note；体态标准：瘦高; 人物的身份: 账房先生", "体态标准：瘦高"],
  ])("extracts body standards verbatim from supported separators", (description, expected) => {
    expect(extractAssetCharacterBodyStandard(description)).toBe(expected);
  });

  it.each([
    ["体态标准:  瘦高且轻微驼背  ", "体态标准:  瘦高且轻微驼背  "],
    ["体态标准： 瘦高且轻微驼背 ", "体态标准： 瘦高且轻微驼背 "],
  ])("preserves English and Chinese colon field forms in %s", (description, expected) => {
    expect(extractAssetCharacterBodyStandard(description)).toBe(expected);
    expect(resolveAssetCharacterBodyStandard(description)).toBe(expected);
  });

  it.each([
    ["人物外貌：冷峻；体态标准:  瘦高  ；人物的身份：账房先生", "人物外貌：冷峻；人物的身份：账房先生"],
    ["人物外貌：冷峻\n体态标准： 瘦高 \n人物的身份：账房先生", "人物外貌：冷峻\n人物的身份：账房先生"],
    ["体态标准： 瘦高 ；人物的身份：账房先生", "人物的身份：账房先生"],
  ])("removes only the body standard field from %s", (description, expected) => {
    expect(removeAssetCharacterBodyStandard(description)).toBe(expected);
  });

  it("returns unmatched descriptions unchanged", () => {
    const description = "人物外貌：冷峻；人物的身份：账房先生";

    expect(extractAssetCharacterBodyStandard(description)).toBeNull();
    expect(removeAssetCharacterBodyStandard(description)).toBe(description);
  });
});

describe("ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS", () => {
  it("documents the complete standards and source priority", () => {
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(ADULT_FEMALE_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(ANCIENT_ADULT_MALE_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(MODERN_ADULT_MALE_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(EXCEPTION_BODY_STANDARD);
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("男性原文体态优先");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("不得写“按统一标准”“身材好”或省略");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("18至59岁");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("60岁及以上");
  });

  it.each(["3D国漫", "3D仿真", "现代甜酷3D乙游", "皮克斯", "低多边形", "非3D"])(
    "documents %s style adaptation",
    (style) => {
      expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain(style);
    },
  );

  it("separates body silhouette rules from style materials without mixing materials", () => {
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("体态控制轮廓比例");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("画风控制材质");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("画风仅控制材质");
    expect(ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS).toContain("不能串材质");
  });
});
