export const ADULT_FEMALE_BODY_STANDARD =
  "体态标准：成年女性采用饱满S曲线、窄肩蜂腰、圆润胯部、前凸后翘、修长笔直大长腿；服装设计目标保持精美华丽，必须包含收腰、开高衩/高开衩、薄纱、刺绣、鎏金材质等设计语言；角色长相必须完全区分，站姿自然挺拔，正面侧面背面比例一致。";

export const ANCIENT_ADULT_MALE_BODY_STANDARD =
  "体态标准：古风成年男性采用标准宽肩窄腰、挺拔直角肩线、躯干修长匀称、线条利落干净、肌肉轮廓流畅不臃肿、身姿端正俊朗、笔直修长双腿，正面侧面背面比例一致。";

export const MODERN_ADULT_MALE_BODY_STANDARD =
  "体态标准：现代成年男性采用宽肩阔背、紧致窄腰、躯干挺拔匀称、体态干净利落、肌肉线条紧致自然、不夸张不臃肿、比例协调、修长笔直大长腿，正面侧面背面比例一致。";

export const EXCEPTION_BODY_STANDARD =
  "体态标准：严格按原文年龄与身体状况塑造，原文体态优先，不强制套用成年男女统一比例，正面侧面背面保持原文设定一致。";

export const NEUTRAL_BODY_STANDARD =
  "体态标准：体态严格服从原文年龄、身份和剧情，正侧背比例一致；身份不明时保持中性，不猜测成年男女比例。";

const BODY_STANDARD_FIELD_PATTERN = /(^|\r?\n|[；;])([ \t]*)(体态标准[ \t]*[:：][^\r\n；;]*)/;
const EXCEPTION_PATTERN =
  /儿童|未成年|少年|少女|男孩|女孩|小孩|幼儿|婴儿|老人|老者|老太|老年|年迈|病弱|病人|重病|残障|残疾|特殊身份|孕妇|怀孕|截肢|轮椅|失明|盲人|聋哑|瘸腿|驼背|畸形/;
const EXPLICIT_MALE_BODY_TERMS = ["矮壮", "魁梧", "瘦小", "年长"] as const;
const EXPLICIT_MINOR_PATTERN = /(?:未满|不满|未到)(?:18|十八)(?:周岁|岁)|(?:18|十八)(?:周岁|岁)以下/;
const CHINESE_NUMBER_PATTERN = /[零〇一二两三四五六七八九十百]+/g;
const STRONG_ANCIENT_PATTERN = /古代|古风|仙侠|玄幻|权谋|武侠/;
const STRONG_MODERN_PATTERN = /现代|当代|现今|如今|都市|职场|校园|西装/;
const WEAK_ANCIENT_PATTERN = /将军|长袍|战袍|锦衣/;
const WEAK_MODERN_PATTERN = /通勤|街头|工装|设计师/;

type AgeGroup = "minor" | "adult" | "senior" | "unknown";
type Gender = "female" | "male" | "unknown";
type Era = "ancient" | "modern" | "unknown";

type Demographics = {
  ageGroup: AgeGroup;
  gender: Gender;
  era: Era;
};

type BodyStandardFieldMatch = {
  field: string;
  index: number;
  length: number;
  startsDescription: boolean;
};

function findBodyStandardField(description: string): BodyStandardFieldMatch | null {
  const match = BODY_STANDARD_FIELD_PATTERN.exec(description);
  if (!match || match.index === undefined) return null;

  const field = match[3];
  const colonIndex = field.search(/[:：]/);
  if (colonIndex < 0 || !field.slice(colonIndex + 1).trim()) return null;

  return {
    field,
    index: match.index,
    length: match[0].length,
    startsDescription: match[1] === "",
  };
}

function parseChineseNumber(value: string): number | null {
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (!value) return null;
  if (!/[十百]/.test(value)) {
    const digit = digits[value];
    return digit === undefined ? null : digit;
  }

  let total = 0;
  let remainder = value;
  const hundredIndex = remainder.indexOf("百");
  if (hundredIndex >= 0) {
    const hundredText = remainder.slice(0, hundredIndex);
    const hundreds = hundredText ? digits[hundredText] : 1;
    if (hundreds === undefined) return null;
    total += hundreds * 100;
    remainder = remainder.slice(hundredIndex + 1).replace(/^零/, "");
  }

  const tenIndex = remainder.indexOf("十");
  if (tenIndex >= 0) {
    const tenText = remainder.slice(0, tenIndex);
    const tens = tenText ? digits[tenText] : 1;
    if (tens === undefined) return null;
    total += tens * 10;
    remainder = remainder.slice(tenIndex + 1);
  }

  if (remainder) {
    const ones = digits[remainder];
    if (ones === undefined) return null;
    total += ones;
  }
  return total;
}

function extractAges(description: string): number[] {
  const compact = description.replace(/\s+/g, "");
  const ages = Array.from(compact.matchAll(/(\d{1,3})(?:多)?(?:周岁|岁)/g), (match) => Number(match[1]));

  for (const match of compact.matchAll(new RegExp(`(${CHINESE_NUMBER_PATTERN.source})(?:多)?(?:周岁|岁)`, "g"))) {
    const age = parseChineseNumber(match[1]);
    if (age !== null) ages.push(age);
  }
  for (const match of compact.matchAll(/([六七八九])旬/g)) {
    const decade = parseChineseNumber(match[1]);
    if (decade !== null) ages.push(decade * 10);
  }
  return ages;
}

function parseAgeGroup(description: string): AgeGroup {
  const compact = description.replace(/\s+/g, "");
  if (EXCEPTION_PATTERN.test(description) || EXPLICIT_MINOR_PATTERN.test(compact)) return "minor";

  const ages = extractAges(description);
  if (ages.some((age) => age < 18)) return "minor";
  if (ages.some((age) => age >= 60)) return "senior";
  if (ages.some((age) => age >= 18 && age < 60) || /成年/.test(description)) return "adult";
  return "unknown";
}

function parseGender(description: string): Gender {
  const field = /性别\s*[:：]\s*(男|女)(?=$|[\s,，；;。])/.exec(description)?.[1];
  if (field === "女") return "female";
  if (field === "男") return "male";

  const femalePatterns = [
    /女性角色/,
    /(?:女性|女人|女子|女生)(?=$|[\s,，；;。])/,
    /成年女性/,
    /(?:^|[\s,，；;。])女(?=$|[\s,，；;。])/,
    /(?:\d{1,3}|[零〇一二两三四五六七八九十百]+)(?:多)?(?:周岁|岁)的?女性角色/,
    /\d{1,3}(?:多)?(?:周岁|岁)女(?=$|[\s,，；;。])/,
  ];
  if (femalePatterns.some((pattern) => pattern.test(description))) return "female";

  const malePatterns = [
    /男性角色/,
    /(?:男性|男人|男子)(?=$|[\s,，；;。])/,
    /成年男性/,
    /(?:^|[\s,，；;。])男(?=$|[\s,，；;。])/,
    /(?:\d{1,3}|[零〇一二两三四五六七八九十百]+)(?:周岁|岁)的?男性角色/,
    /\d{1,3}(?:周岁|岁)男(?=$|[\s,，；;。])/,
  ];
  return malePatterns.some((pattern) => pattern.test(description)) ? "male" : "unknown";
}

function parseEra(description: string): Era {
  const explicitEra = /时代\s*[:：]\s*([^\r\n；;,，。]+)/.exec(description)?.[1] ?? "";
  if (STRONG_ANCIENT_PATTERN.test(explicitEra)) return "ancient";
  if (STRONG_MODERN_PATTERN.test(explicitEra)) return "modern";

  if (STRONG_ANCIENT_PATTERN.test(description)) return "ancient";
  if (STRONG_MODERN_PATTERN.test(description)) return "modern";
  if (WEAK_ANCIENT_PATTERN.test(description)) return "ancient";
  if (WEAK_MODERN_PATTERN.test(description)) return "modern";
  return "unknown";
}

function parseDemographics(description: string): Demographics {
  return {
    ageGroup: parseAgeGroup(description),
    gender: parseGender(description),
    era: parseEra(description),
  };
}

function extractExplicitMaleBodyTerms(description: string): string[] {
  return EXPLICIT_MALE_BODY_TERMS.filter((term) => description.includes(term));
}

function buildExplicitMaleBodyStandard(terms: string[]): string {
  return `体态标准：${terms.join("、")}，严格保持原文明确体态，正侧背比例一致。`;
}

export function extractAssetCharacterBodyStandard(description: string): string | null {
  return findBodyStandardField(description)?.field ?? null;
}

export function removeAssetCharacterBodyStandard(description: string): string {
  const match = findBodyStandardField(description);
  if (!match) return description;

  const before = description.slice(0, match.index);
  let after = description.slice(match.index + match.length);
  if (match.startsDescription) after = after.replace(/^(?:\r?\n|[；;])[ \t]*/, "");
  return `${before}${after}`;
}

export function resolveAssetCharacterBodyStandard(description: string): string {
  const existing = extractAssetCharacterBodyStandard(description);
  if (existing) return existing;

  const demographics = parseDemographics(description);
  if (demographics.ageGroup === "minor" || demographics.ageGroup === "senior") {
    return EXCEPTION_BODY_STANDARD;
  }

  const explicitMaleBodyTerms = demographics.gender === "male" ? extractExplicitMaleBodyTerms(description) : [];
  if (explicitMaleBodyTerms.length > 0) return buildExplicitMaleBodyStandard(explicitMaleBodyTerms);

  if (demographics.ageGroup !== "adult") return NEUTRAL_BODY_STANDARD;
  if (demographics.gender === "female") return ADULT_FEMALE_BODY_STANDARD;
  if (demographics.gender === "male" && demographics.era === "ancient") return ANCIENT_ADULT_MALE_BODY_STANDARD;
  if (demographics.gender === "male" && demographics.era === "modern") return MODERN_ADULT_MALE_BODY_STANDARD;
  return NEUTRAL_BODY_STANDARD;
}

export const ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS = `人物资产必须独立输出“体态标准：”字段，并按以下优先级执行：已有字段 > 例外角色 > 明确成年女性 > 明确成年男性加古今线索 > 中性兜底。
- 成年女性：${ADULT_FEMALE_BODY_STANDARD}
- 古风成年男性：${ANCIENT_ADULT_MALE_BODY_STANDARD}
- 现代成年男性：${MODERN_ADULT_MALE_BODY_STANDARD}
- 儿童、未成年、老人、病弱、残障或特殊身份：${EXCEPTION_BODY_STANDARD}
- 男性原文体态优先：男性被明确写成矮壮、魁梧、瘦小或年长时，提取原文体态词，写成“严格保持原文明确体态，正侧背比例一致”，不强制统一男性比例。
- 身份、性别或时代不明：${NEUTRAL_BODY_STANDARD}
- 古风线索包括古风、仙侠、玄幻、权谋、武侠、古代、将军、长袍、战袍、锦衣；现代线索包括现代、当代、现今、如今、都市、职场、校园、成年、西装、通勤、街头、工装、设计师。
- 年龄识别：儿童、未成年、少年、未满或不满十八岁、18岁以下、未到18岁和明确小于18岁的年龄优先按例外处理；老人、老者、老太、60岁及以上、六十多岁、一百岁以及六旬、七旬、八旬、九旬等明确高龄表达也按例外处理；只有18至59岁可作为普通成年候选。
- 风格适配总则：体态控制轮廓比例，画风控制材质；画风仅控制材质、皮肤、建模、线条、色彩和光影，两者分工明确，不能串材质，也不能让画风覆盖体态标准。
- 3D国漫使用国漫次世代人体和材质语言表达同一体态轮廓。
- 3D仿真使用高精度仿真人体与皮肤材质语言表达同一体态轮廓。
- 现代甜酷3D乙游使用乙游角色比例转换与时尚材质语言表达同一体态目标。
- 皮克斯将同一体态目标转换为动画比例和对应材质，不混入3D仿真皮肤材质。
- 低多边形将同一体态目标转换为几何轮廓和低多边形材质，不混入仿真材质。
- 非3D画风仍保留体态字段，以当前画风的线条和造型语言表达轮廓比例，不串用其他画风材质。
- 字段必须写完整、可直接生图的具体体态，不得写“按统一标准”“身材好”或省略。`;
