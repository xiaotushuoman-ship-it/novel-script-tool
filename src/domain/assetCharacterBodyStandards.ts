export const ADULT_FEMALE_BODY_STANDARD =
  "体态标准：成年女性采用饱满S曲线、窄肩蜂腰、圆润胯部、前凸后翘、修长笔直大长腿，站姿自然挺拔，正面侧面背面比例一致。";

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
  /儿童|未成年|少年|少女|男孩|女孩|小孩|幼儿|婴儿|老人|老者|老妪|老年|年迈|病弱|病人|重病|残障|残疾|特殊身份|孕妇|怀孕|截肢|轮椅|失明|盲人|聋哑|瘸腿|驼背|畸形/;
const CHINESE_MINOR_AGE_PATTERN = /(?<![一二三四五六七八九十])(?:[一二三四五六七八九]岁|十岁|十[一二三四五六七]岁)/;
const CHINESE_ADULT_AGE_PATTERN = /十[八九]岁|[二三四五]十(?:多|[一二三四五六七八九])?岁/;
const CHINESE_SENIOR_AGE_PATTERN = /[六七八九]十(?:多|[一二三四五六七八九])?岁|[六七八九]旬/;
const FEMALE_PATTERN = /性别[ \t]*[:：][ \t]*女|女性|女人|女子|成年女/;
const MALE_PATTERN = /性别[ \t]*[:：][ \t]*男|男性|男人|男子|成年男/;
const EXPLICIT_MALE_BODY_TERMS = ["矮壮", "魁梧", "瘦小", "年长"] as const;
const ANCIENT_PATTERN = /古风|仙侠|玄幻|权谋|武侠|古代|将军|长袍|战袍|锦衣/;
const MODERN_PATTERN = /现代|都市|职场|校园成年|西装|通勤|街头|工装|设计师/;

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

function hasExplicitMinorAge(description: string): boolean {
  if (CHINESE_MINOR_AGE_PATTERN.test(description)) return true;
  return Array.from(description.matchAll(/(\d{1,3})[ \t]*岁/g)).some((match) => Number(match[1]) < 18);
}

function hasExplicitSeniorAge(description: string): boolean {
  if (CHINESE_SENIOR_AGE_PATTERN.test(description)) return true;
  return Array.from(description.matchAll(/(\d{1,3})[ \t]*岁/g)).some((match) => Number(match[1]) >= 60);
}

function hasExplicitAdultAge(description: string): boolean {
  if (/成年/.test(description) || CHINESE_ADULT_AGE_PATTERN.test(description)) return true;
  return Array.from(description.matchAll(/(\d{1,3})[ \t]*岁/g)).some((match) => {
    const age = Number(match[1]);
    return age >= 18 && age < 60;
  });
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

  if (EXCEPTION_PATTERN.test(description) || hasExplicitMinorAge(description) || hasExplicitSeniorAge(description)) {
    return EXCEPTION_BODY_STANDARD;
  }

  const isMale = MALE_PATTERN.test(description);
  const explicitMaleBodyTerms = isMale ? extractExplicitMaleBodyTerms(description) : [];
  if (explicitMaleBodyTerms.length > 0) return buildExplicitMaleBodyStandard(explicitMaleBodyTerms);

  if (!hasExplicitAdultAge(description)) return NEUTRAL_BODY_STANDARD;
  if (FEMALE_PATTERN.test(description)) return ADULT_FEMALE_BODY_STANDARD;
  if (isMale && ANCIENT_PATTERN.test(description)) return ANCIENT_ADULT_MALE_BODY_STANDARD;
  if (isMale && MODERN_PATTERN.test(description)) return MODERN_ADULT_MALE_BODY_STANDARD;
  return NEUTRAL_BODY_STANDARD;
}

export const ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS = `人物资产必须独立输出“体态标准：”字段，并按以下优先级执行：已有字段 > 例外角色 > 明确成年女性 > 明确成年男性加古今线索 > 中性兜底。
- 成年女性：${ADULT_FEMALE_BODY_STANDARD}
- 古风成年男性：${ANCIENT_ADULT_MALE_BODY_STANDARD}
- 现代成年男性：${MODERN_ADULT_MALE_BODY_STANDARD}
- 儿童、未成年、老人、病弱、残障或特殊身份：${EXCEPTION_BODY_STANDARD}
- 男性原文体态优先：男性被明确写成矮壮、魁梧、瘦小或年长时，提取原文体态词，写成“严格保持原文明确体态，正侧背比例一致”，不强制统一男性比例。
- 身份、性别或时代不明：${NEUTRAL_BODY_STANDARD}
- 古风线索包括古风、仙侠、玄幻、权谋、武侠、古代、将军、长袍、战袍、锦衣；现代线索包括现代、都市、职场、校园成年、西装、通勤、街头、工装、设计师。
- 年龄识别：儿童、未成年、少年、少女和未满18岁的明确年龄优先按例外处理；老人、老者、老妪、60岁及以上、六十多岁以及六旬、七旬、八旬、九旬等明确高龄表达也按例外处理；只有18至59岁可作为普通成年候选。
- 风格适配总则：体态控制轮廓比例，画风控制材质；画风仅控制材质、皮肤、建模、线条、色彩和光影，两者分工明确，不能串材质，也不能让画风覆盖体态标准。
- 3D国漫使用国漫次世代人体和材质语言表达同一体态轮廓。
- 3D仿真使用高精度仿真人体与皮肤材质语言表达同一体态轮廓。
- 现代甜酷3D乙游使用乙游角色比例转换与时尚材质语言表达同一体态目标。
- 皮克斯将同一体态目标转换为动画比例和对应材质，不混入3D仿真皮肤材质。
- 低多边形将同一体态目标转换为几何轮廓和低多边形材质，不混入仿真材质。
- 非3D画风仍保留体态字段，以当前画风的线条和造型语言表达轮廓比例，不串用其他画风材质。
- 字段必须写完整、可直接生图的具体体态，不得写“按统一标准”“身材好”或省略。`;
