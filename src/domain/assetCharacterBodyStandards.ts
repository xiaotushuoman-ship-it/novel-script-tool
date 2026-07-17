export const ADULT_FEMALE_BODY_STANDARD =
  "体态标准：成年女性采用饱满S曲线、窄肩蜂腰、圆润胯部、前凸后翘、修长笔直大长腿，站姿自然挺拔，正面侧面背面比例一致。";

export const ANCIENT_ADULT_MALE_BODY_STANDARD =
  "体态标准：古风成年男性采用标准宽肩窄腰、挺拔直角肩、修长躯干、利落身形、流畅不臃肿肌肉、修长双腿，身姿端正，正面、侧面、背面比例一致。";

export const MODERN_ADULT_MALE_BODY_STANDARD =
  "体态标准：现代成年男性采用宽肩阔背、紧致窄腰、挺拔躯干、干净利落体态、自然不夸张肌肉、修长笔直长腿，比例协调，正面、侧面、背面比例一致。";

export const EXCEPTION_BODY_STANDARD =
  "体态标准：严格按原文年龄与身体状况塑造，原文体态优先，不强制套用成年男女统一比例，正面、侧面、背面保持原文设定一致。";

export const NEUTRAL_BODY_STANDARD =
  "体态标准：体态服从原文年龄、身份、身体状况和剧情，身份不明时保持中性，不猜测成年男女比例，正侧背一致。";

const BODY_STANDARD_FIELD_PATTERN = /(?:^|\r?\n|[；;])\s*体态标准\s*[:：]\s*([^\r\n；;]*)/;

const EXCEPTION_PATTERN =
  /儿童|未成年|少年|少女|男孩|女孩|小孩|幼儿|婴儿|老人|老年|年迈|病弱|病人|重病|残障|残疾|特殊身份|孕妇|怀孕|截肢|轮椅|失明|盲人|聋哑|瘸腿|驼背|畸形/;
const ADULT_FEMALE_PATTERN = /成年(?:女性|女人|女子)|(?:女性|女人|女子)[^\r\n；;]{0,8}成年/;
const ADULT_MALE_PATTERN = /成年(?:男性|男人|男子)|(?:男性|男人|男子)[^\r\n；;]{0,8}成年/;
const MALE_PATTERN = /男性|男人|男子/;
const EXPLICIT_MALE_BODY_PATTERN = /矮壮|魁梧|瘦小|年长/;
const ANCIENT_PATTERN = /古风|仙侠|玄幻|权谋|武侠|古代|将军|长袍|战袍|锦衣/;
const MODERN_PATTERN = /现代|都市|职场|校园成年|西装|通勤|街头|工装|设计师/;

export function extractAssetCharacterBodyStandard(description: string): string | null {
  const match = BODY_STANDARD_FIELD_PATTERN.exec(description);
  const value = match?.[1].trim();
  return value ? `体态标准：${value}` : null;
}

export function removeAssetCharacterBodyStandard(description: string): string {
  const match = BODY_STANDARD_FIELD_PATTERN.exec(description);
  if (!match || match.index === undefined) return description;

  const before = description.slice(0, match.index);
  let after = description.slice(match.index + match[0].length);
  if (match.index === 0) after = after.replace(/^(?:\r?\n|[；;])\s*/, "");
  return `${before}${after}`;
}

export function resolveAssetCharacterBodyStandard(description: string): string {
  const existing = extractAssetCharacterBodyStandard(description);
  if (existing) return existing;

  if (EXCEPTION_PATTERN.test(description)) return EXCEPTION_BODY_STANDARD;
  if (MALE_PATTERN.test(description) && EXPLICIT_MALE_BODY_PATTERN.test(description)) {
    return EXCEPTION_BODY_STANDARD;
  }
  if (ADULT_FEMALE_PATTERN.test(description)) return ADULT_FEMALE_BODY_STANDARD;
  if (ADULT_MALE_PATTERN.test(description) && ANCIENT_PATTERN.test(description)) {
    return ANCIENT_ADULT_MALE_BODY_STANDARD;
  }
  if (ADULT_MALE_PATTERN.test(description) && MODERN_PATTERN.test(description)) {
    return MODERN_ADULT_MALE_BODY_STANDARD;
  }
  return NEUTRAL_BODY_STANDARD;
}

export const ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS = `人物资产必须独立输出“体态标准：”字段，并按以下优先级执行：已有字段 > 例外角色 > 明确成年女性 > 明确成年男性加古今线索 > 中性兜底。
- 成年女性：${ADULT_FEMALE_BODY_STANDARD}
- 古风成年男性：${ANCIENT_ADULT_MALE_BODY_STANDARD}
- 现代成年男性：${MODERN_ADULT_MALE_BODY_STANDARD}
- 儿童、未成年、老人、病弱、残障或特殊身份：${EXCEPTION_BODY_STANDARD}
- 男性原文体态优先：男性被明确写成矮壮、魁梧、瘦小或年长时，服从原文，不强制统一男性比例。
- 身份、性别或时代不明：${NEUTRAL_BODY_STANDARD}
- 古风线索包括古风、仙侠、玄幻、权谋、武侠、古代、将军、长袍、战袍、锦衣；现代线索包括现代、都市、职场、校园成年、西装、通勤、街头、工装、设计师。
- 画风仅控制材质、皮肤、建模、线条、色彩和光影表达，不得覆盖人物体态比例与轮廓标准。
- 字段必须写完整、可直接生图的具体体态，不得写“按统一标准”“身材好”或省略。`;
