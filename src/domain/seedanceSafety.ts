export type SeedanceSafetyIssue = {
  category: string;
  severity: "高" | "中" | "低";
  matches: string[];
  suggestion: string;
};

export type SeedanceSafetyReport = {
  hasIssues: boolean;
  issues: SeedanceSafetyIssue[];
  summary: string;
  optimizedText: string;
};

type SeedanceSafetyRule = {
  category: string;
  severity: SeedanceSafetyIssue["severity"];
  terms: string[];
  suggestion: string;
};

export const SEEDANCE_SAFETY_RULES: SeedanceSafetyRule[] = [
  {
    category: "暴力血腥",
    severity: "高",
    terms: ["血腥", "断肢", "肢解", "爆头", "内脏", "喷血", "血肉模糊", "尸体", "虐杀", "酷刑"],
    suggestion: "改成非血腥受伤反馈、冲击感、倒退、武器擦过、尘土飞散、镜头避开伤口。",
  },
  {
    category: "色情低俗",
    severity: "高",
    terms: ["裸露", "情色", "性暗示", "床戏", "挑逗", "露点", "走光", "内衣特写", "低俗擦边"],
    suggestion: "改成情绪张力、眼神、距离变化、手部停顿、含蓄氛围，不写身体暴露和擦边动作。",
  },
  {
    category: "未成年人风险",
    severity: "高",
    terms: ["未成年", "小学生", "初中生", "幼女", "萝莉", "儿童恋爱", "校园霸凌细节"],
    suggestion: "涉及未成年人时只保留正向保护、成长、教育或求助表达，避免恋爱、暴力细节和身体化描写。",
  },
  {
    category: "危险违法",
    severity: "高",
    terms: ["开枪", "枪战", "制毒", "吸毒", "贩毒", "赌博", "诈骗教程", "自杀", "跳楼", "割腕", "爆炸物制作"],
    suggestion: "改成危机暗示、警方处理、远景避让、道具虚化、结果带过，不提供操作方法和可模仿细节。",
  },
  {
    category: "极端政治与仇恨",
    severity: "高",
    terms: ["恐怖袭击", "极端组织", "种族歧视", "地域黑", "煽动仇恨", "政治敏感", "反社会宣言"],
    suggestion: "改成虚构组织、抽象冲突、正向价值判断，删除煽动、歧视和现实政治指向。",
  },
  {
    category: "封建迷信",
    severity: "中",
    terms: ["做法", "招魂", "下降头", "诅咒应验", "鬼上身", "邪术", "算命改命", "献祭"],
    suggestion: "改成心理悬疑、民俗氛围、误会反转或象征性视觉，不把迷信写成真实有效方法。",
  },
  {
    category: "平台与版权",
    severity: "中",
    terms: ["水印", "logo", "抖音号", "二维码", "联系方式", "引流", "盗版", "明星同款脸", "品牌商标特写"],
    suggestion: "删除水印、logo、二维码、联系方式和真实品牌指向；改成无标识道具或虚构品牌。",
  },
  {
    category: "模型规避词",
    severity: "中",
    terms: ["绕过审核", "规避平台", "不被检测", "擦边通过", "隐藏违禁", "越狱提示"],
    suggestion: "删除规避审核意图，改成合规表达、平台友好、可公开发布的画面描述。",
  },
];

export function checkSeedanceSafety(text: string): SeedanceSafetyReport {
  const normalized = text.toLowerCase();
  const issues = SEEDANCE_SAFETY_RULES.map((rule) => {
    const matches = rule.terms.filter((term) => normalized.includes(term.toLowerCase()));
    if (matches.length === 0) return null;
    return {
      category: rule.category,
      severity: rule.severity,
      matches,
      suggestion: rule.suggestion,
    };
  }).filter((issue): issue is SeedanceSafetyIssue => Boolean(issue));

  return {
    hasIssues: issues.length > 0,
    issues,
    summary:
      issues.length > 0
        ? `发现 ${issues.length} 类 SEEDAN2.0 视频生成风险，请按建议替换后再送入视频模型。`
        : "未发现明显 SEEDAN2.0 视频生成违禁词风险。",
    optimizedText: optimizeSeedanceText(text, issues),
  };
}

function optimizeSeedanceText(text: string, issues: SeedanceSafetyIssue[]): string {
  let optimized = text;
  for (const issue of issues) {
    for (const match of issue.matches) {
      optimized = optimized.replace(new RegExp(escapeRegExp(match), "gi"), getReplacementForCategory(issue.category));
    }
  }
  return optimizeSeedanceStructure(optimized);
}

function getReplacementForCategory(category: string): string {
  const replacements: Record<string, string> = {
    暴力血腥: "受力反馈",
    色情低俗: "情绪张力",
    未成年人风险: "正向保护",
    危险违法: "危机暗示",
    极端政治与仇恨: "抽象冲突",
    封建迷信: "民俗氛围",
    平台与版权: "无标识道具",
    模型规避词: "合规表达",
  };
  return replacements[category] || "合规表达";
}

function optimizeSeedanceStructure(text: string): string {
  return text
    .replace(/角色掏枪开枪/g, "角色做出危机反应")
    .replace(/水印logo/g, "无标识道具")
    .replace(/血腥伤口/g, "受力反馈")
    .replace(/血腥/g, "受力反馈")
    .replace(/断肢|肢解|爆头|喷血|尸体特写/g, "冲击反馈")
    .replace(/诈骗教程|制毒|吸毒|贩毒|赌博|自杀|跳楼|割腕|爆炸物制作/g, "危机处理")
    .replace(/裸体|裸露|情色|性暗示|床戏|挑逗|露点|走光|内衣特写|低俗擦边/g, "情绪张力")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
