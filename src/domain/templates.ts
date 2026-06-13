import douyinViralShortDramaTemplate from "../prompts/douyin-viral-shortdrama-template.md?raw";

export type TemplateId =
  | "outline-expansion"
  | "chapter-split"
  | "prose-generation"
  | "novel-to-script"
  | "asset-extraction"
  | "asset-library"
  | "storyboard-15s"
  | "gpt-image2-storyboard";

export type TemplateField = {
  key: string;
  label: string;
  multiline?: boolean;
  required?: boolean;
  defaultValue?: string;
  control?: "text" | "textarea" | "number" | "select";
  min?: number;
  max?: number;
  options?: string[];
};

export type TemplateDefinition = {
  id: TemplateId;
  name: string;
  description: string;
  fields: TemplateField[];
  body: string;
};

export type PromptValues = Record<string, string>;

const noOutlineGuard =
  "在用户明确提供大纲前，你绝对不能自行编造、假设或生成任何故事内容。";
const noSettingGuard = "在用户明确粘贴设定前，你绝对不能自行编造世界观、人物或大纲。";
const noSourceGuard = "在用户提供原始内容前，绝对不能自行编造场景开写。";

export const PLATFORM_REVIEW_RULES = `# 平台审核硬规则（抖音/红果短剧合规优先）
生成前必须先做题材与桥段自检，宁可降低刺激度，也不能踩审核红线。

绝对禁止：
1. 封建迷信和现代玄学：冥婚、鬼宅、僵尸、道士捉鬼、邪祟附身、风水算命、占卜改运、现代法术逆天改命。
2. 极端复仇和暴力爽点：赶尽杀绝、以恶制恶、私刑报复、暴力复仇、血腥细节、恐怖恶心猎奇。
3. 拜金炫富和身份碾压：有钱就是一切、炫富攀比、不择手段获财、豪车豪宅特写、隐藏大佬/富二代/董事长身份反转爽点、一夜暴富。
4. 霸总虐恋和情感操控：性别物化、强制爱、PUA、畸形婚恋、用金钱/权力/外貌操控感情、美化出轨/家暴/婚外情。
5. 未成年人风险：未成年人早恋、暴力、吸烟饮酒、参与成人商业/职场/恋爱剧情、被成人化或工具化。
6. 低俗擦边：暴露着装、性暗示台词或动作、低俗封面标题、以暧昧卖点引流。
7. 历史虚无和侵权肖像：歪曲革命历史、抹黑英雄烈士、恶搞经典 IP、损害国家形象、模仿明星/公众人物肖像、盗用水印素材。
8. 专业领域错误：医生误诊、律师违法操作、老师体罚等医疗/法律/教育错误示范。

高风险题材处理：
- 重生/穿越只能服务自我成长和弥补遗憾，禁止复仇重生、穿越真实历史并改变重大历史事件。
- 玄幻/修仙只能使用纯架空世界观，禁止现代元素里的法术万能、玄学改运。
- 悬疑只写推理过程和轻罪案件，禁止连环杀人、血腥犯罪过程和警察负面形象。
- 古风权谋只能写智慧较量，禁止宫斗虐恋、阴谋诡计和血腥暴力。

鼓励方向：
- 优先选择乡村振兴、非遗文化、现实主义、普通人成长、家庭温情、邻里互助、文旅融合、体育竞技、职场技能科普等正向题材。
- 主角必须是普通人或可信人物，有缺点但本质善良，通过努力、沟通、学习和合法途径解决问题。
- 女性角色独立自主，不依附男性；男性角色积极向上，不靠权势碾压。
- 冲突必须可解决，结局积极向上，传递向善向美、努力有回报的价值观。
- 台词干净克制，禁止脏话、低俗热梗、金钱至上、颜值即正义等错误价值观。

如用户输入包含红线内容：不要照抄放大，必须自动改写为合规版本，并在结果中保持剧情可看、人物动机合理、价值观正向。`;

function removeLegacyStoryboardOutputFormat(template: string) {
  return template.replace(
    /输出格式：\s*\n\s*_::~OUTPUT_START::~_[\s\S]*?_::~OUTPUT_END::~_\s*\n```/,
    "输出格式：\n使用本软件下方【强制输出格式】。",
  );
}

export const STORYBOARD_SEGMENT_OPTIONS = [
  "10秒",
  "11秒",
  "12秒",
  "13秒",
  "14秒",
  "15秒",
  "10-15秒自动选择",
];

export const STORYBOARD_RATIO_OPTIONS = ["竖屏9:16", "横屏16:9", "电影宽屏21:9"];

export const IMAGE_RATIO_OPTIONS = ["1:1", "16:9", "9:16", "21:9", "4:3", "3:4"];

export const IMAGE_RESOLUTION_OPTIONS = ["1K", "2K"];

export const STORYBOARD_STYLE_OPTIONS = [
  "3D国漫风格",
  "影视写实古风",
  "影视写实现代",
  "2D赛璐璐风格",
  "水墨国风动画",
  "水墨画风",
  "复古欧美原子朋克风格",
  "赛博朋克霓虹风格",
  "蒸汽朋克风格",
  "暗黑哥特风格",
  "日系新海诚光影",
  "吉卜力温暖手绘风",
  "皮克斯式3D动画",
  "黏土定格动画风",
  "低多边形游戏风",
  "像素复古游戏风",
  "美式漫画风",
  "港片霓虹写实风",
  "黑色电影风",
  "纪录片写实风",
  "广告级产品短片风",
  "电影级玄幻仙侠风",
  "末世废土风",
  "未来科幻机甲风",
  "悬疑惊悚写实风",
  "温暖治愈家庭短剧风",
];

export const IMAGE_MODEL_OPTIONS = [
  "gpt-image-2",
  "gpt-image-2-all",
  "gemini-3.1-flash-preview",
  "gemini-3-pro-image-preview",
];

export const NOVEL_STYLE_OPTIONS = [
  "贴合大纲气质",
  "都市爽文",
  "都市逆袭打脸",
  "赘婿逆袭",
  "玄幻热血升级",
  "仙侠古风",
  "悬疑刑侦",
  "无限流高压",
  "末世生存",
  "科幻硬核",
  "赛博朋克",
  "历史权谋",
  "宫斗宅斗",
  "古言甜宠",
  "现代甜宠",
  "强情绪短剧风",
  "粗粝写实的市井烟火风",
  "轻喜剧吐槽风",
  "黑色幽默",
  "电影感写实",
  "少年热血群像",
  "暗黑复仇",
  "治愈温暖",
  "克制冷峻",
];

export const NARRATIVE_PERSPECTIVE_OPTIONS = [
  "第三人称",
  "第三人称限知",
  "第三人称全知",
  "第一人称",
  "第一人称回忆录",
  "双主角交替视角",
  "多主角群像视角",
  "男主视角",
  "女主视角",
  "反派视角穿插",
  "上帝视角",
  "近景跟拍式叙事",
  "剧本镜头式叙事",
  "书信/日记体",
  "案卷/档案体",
  "直播弹幕穿插",
  "新闻纪实穿插",
];

export type TopicRecommendation = {
  title: string;
  summary: string;
  outline: string;
  tags: string[];
};

export const LOCAL_TREND_TOPIC_RECOMMENDATIONS: TopicRecommendation[] = [
  {
    title: "烟火气逆袭",
    summary: "普通人靠手艺/小生意翻身，城市烟火感强，适合高频爽点。",
    tags: ["现实主义", "逆袭", "市井烟火"],
    outline:
      "主角被迫离开原有生活后，在夜市、街头或社区重新开局，凭借一门被低估的手艺、技能或经营脑，连续化解围剿，守住尊严并逐步逆袭。剧情要有强冲突、强执行力和明确利益目标，避免空泛鸡汤。",
  },
  {
    title: "年代家庭翻盘",
    summary: "年代质感、家庭矛盾、旧账新算，情绪抓人，适合连续反转。",
    tags: ["年代", "家庭", "情绪反转"],
    outline:
      "故事围绕家庭分家、遗产、招牌、旧宅或老手艺展开，主角在压迫中找回父辈留下的核心资产，靠实干与判断扭转家族矛盾。全程强调亲情、误解、修复与翻盘，不要写成纯狗血。",
  },
  {
    title: "系统打工升级",
    summary: "轻系统/技能树/任务奖励，重点是现实成长与爽感兑现。",
    tags: ["系统", "升级", "成长爽文"],
    outline:
      "主角获得一个只提供方向和小奖励的系统，在职场、创业、技能学习或服务行业中不断升级，逐步从边缘人变成核心人物。每章都要有任务、结果和回报，不要把系统写成万能外挂。",
  },
  {
    title: "萌宝治愈线",
    summary: "亲子、修复关系、家庭温暖，适合平台友好的高情绪价值内容。",
    tags: ["萌宝", "治愈", "家庭温情"],
    outline:
      "主角在失去、误会或重组家庭背景下，与孩子、长辈或伴侣重新建立关系，通过生活细节、陪伴和行动修复裂痕。要有明显情绪钩子和温暖反转，但避免过度煽情。",
  },
  {
    title: "职场反杀局",
    summary: "办公室、项目、竞争、晋升、整顿职场，适合短平快强冲突。",
    tags: ["职场", "反杀", "现实向"],
    outline:
      "主角在职场被压制、被抢功或被排挤，借专业能力、信息差和关键时机完成反击。剧情围绕项目、客户、业绩、升职展开，每段都要有明确博弈目标和结果反馈。",
  },
  {
    title: "非遗文旅爆点",
    summary: "传统手艺、地方文化、景区经营，容易做出差异化和正向价值。",
    tags: ["非遗", "文旅", "文化传承"],
    outline:
      "主角围绕非遗技艺、地方小店或文旅项目展开，用专业、审美和经营思维把老手艺重新做活。核心是传统与现代的碰撞，兼顾热血、文化感和现实经营难题。",
  },
];

const cleanedDouyinViralShortDramaTemplate = removeLegacyStoryboardOutputFormat(douyinViralShortDramaTemplate)
  .replace(/# 使用模板[\s\S]*?# 本次任务输入/, "# 使用模板\n请严格按该模板生成。\n\n# 本次任务输入")
  .replace(/# 输出约束[\s\S]*?# 本次任务输入/, "# 本次任务输入");

const cinematicStoryboardOutputFormat = `# 强制输出格式
最终回答必须只按下面格式输出，不要输出旧字段块、video_prompt、prompt 字段块，不要输出 Markdown 表格。

【视觉基调】
用一段话写清所选风格、镜头质感、运镜原则、清晰度要求和不使用的错误手法。

【色彩与影调】
用一段话写清主色、强调色、饱和度、对比度、颗粒、高光、暗部细节和整体情绪。

【光源与照明】
用一段话写清主要光源、辅助光、侧逆光、反光材质、体积光或雾气来源；光源必须来自场景内可解释位置。

【画面情绪】
用一段话写清本段核心情绪、冲突压力、速度感、危险感或爽点节拍。

【主体和空间关系】
用一段话写清角色全名、服装/身份锚点、人物站位、距离、朝向、关键道具、固定场景参照物和背景空间。

【画面内容】
按“分镜1 标题（0-Xs）：画面描述。”的格式连续输出所有分镜。
每个分镜必须包含时间码、景别或机位、人物动作、互动对象、环境反馈、镜头运动和声音/转场信息。
如果该分镜包含人物说话，必须在画面描述后另起一行写“对白：角色名：台词”，不要把台词揉进动作描述里；多个角色说话时逐行输出，例如“对白：刘婶：年轻人嫌麻烦！”、“对白：老赵：小摊，没啥好拍！”。
每段最后一个分镜必须写明下一段可承接的动作、视线、道具或空间锚点。

负面限制：不要随机换脸，不要字幕水印。`;

const segmentedStoryboardRules = `# 逐段剧情分镜硬规则
1. 先按原小说或剧本的当前剧情发展顺序拆段，不按固定字数平均切割；每段时长为{{segmentSeconds}}，单段上限15秒。
2. 每一个15S段落都是一个独立可生成的视频提示词单元，不允许把整篇剧情合成一个大分镜。
3. 每段只处理当前剧情节点：一个冲突、一个动作阶段、一次信息揭示、一次情绪转折或一次空间移动。
4. 只允许使用该段剧情实际出现的人物、场景、物品；不要把全文所有出场人物、所有场景、所有物品资产塞进每一段。
5. 人物和场景必须符合该段当前剧情：原文当前段没有出现的人物不得进入画面；原文当前段没有切换场景，不得擅自换场景。
6. 输出必须按“15S段落单元1、15S段落单元2、15S段落单元3……”分组；每组内部单独写【视觉基调】【色彩与影调】【光源与照明】【画面情绪】【主体和空间关系】【画面内容】。
7. 每个段落单元开头必须写“剧情范围、当前段人物、当前段场景、当前段物品”，且这些内容只能来自该段当前剧情。
8. 上下文要连贯：后一段第一镜承接前一段最后一镜的站位、动作余势、视线方向、声音或道具状态。
9. 衔接优先使用自然连续方式：动作接动作、视线接视线、声音先入、道具落点、人物走位、遮挡经过镜头、同场景换机位。
10. 禁止每段都用闪白、黑场、强转场、硬切转场来衔接；转场只能在剧情确实需要时使用，例如回忆、时间跳跃、空间切换、强光爆点、意识冲击。
11. 参考样例只代表一个15S单元的写法，不代表把所有分镜作为一个整体输出。
12. 如果原文剧情不足目标总时长，不要硬凑；如果剧情超过目标总时长，按主线保留关键节点并压缩次要动作。
13. 每个15S段落单元都要能单独复制给视频模型生成，同时段与段之间又能按剧情顺序连续剪辑。
14. 人物台词必须保留原意并标明说话人；不要写成“某某说某句话”的叙述句，必须写成独立对白行。
15. 以上逐段剧情分镜硬规则优先级最高；若与参考模板中“上一组结尾/下一组开头/角色资产/场景资产/物品资产”或固定转场规则冲突，以逐段剧情分镜硬规则为准。`;

const emotionDirectorRules = `# 情绪导演增强
当当前段属于感情戏、亲情戏、误会争执、沉默对峙、心动、和解或离别时，必须把抽象情绪改写成可拍摄的生理反应和动作链。
1. 不要只写“悲伤/愤怒/心动/紧张/释然”，必须同时给出眼神、嘴角、下颌、呼吸、手指、肩颈、重心或脚步变化。
2. 情绪必须有起点、波动、峰值和回落/转化；相邻分镜之间要有过渡，不要突然从平静跳到崩溃。
3. 有对白时，说话者必须有嘴部动作、音量、语速或停顿提示；听者反应必须出现，例如视线回避、手指停住、呼吸变浅、肩膀收紧或向后退半步。
4. 对白仍按独立行输出，可在角色名后加入简短声音提示，例如“对白：林晚舟（低声、停顿）：我想让他们被看见。”
5. 情绪动作要带环境反馈：手碰到桌沿、衣料被攥皱、碗筷轻响、门帘晃动、纸张被压出折痕等；反馈必须和动作同步。
6. 禁止文学化比喻、象征和空泛氛围词；不要写精确厘米、毫米、角度、小数比例，改用近景可见、半步、贴近、偏左、压到画面边缘等相对描述。
7. 感情戏不要长时间静止站立；每个分镜至少包含一个可见微动作、一个互动对象或一个声音/沉默变化。`;

const storyboardCapacityRules = `# 15S容量控制
1. 每个15S段落优先使用3-4个分镜，极限最多5个分镜；不要默认写6-8个分镜。
2. 每个分镜只承载一个核心动作、一个反应或一句对白，不能把“走位+争吵+回忆+转场+反应”塞进同一镜。
3. 对白总量最多2句；每句对白要短，超过12个汉字时优先改短或拆到下一段。
4. 有对白的分镜必须给表演时间：说话、停顿、听者反应不能同时压在1秒内完成。
5. 15S内至少保留2-3秒给无对白反应镜头，用于眼神、呼吸、手部、沉默或道具反馈。
6. 如果当前剧情必须超过5个分镜，必须拆成下一个15S段落单元；下一段从上一段最后的动作、视线、声音或道具状态自然承接。
7. 信息取舍优先级：保留核心冲突、关键动作、关键对白和情绪转折；删除旁枝说明、重复反应、无必要转场和装饰性空镜。
8. 输出前自检：按真实播放速度估算每镜能否看清；若台词和动作会被压缩过快，必须减少分镜或拆段。`;

const douyinStoryboardBody = `# 使用模板
以下内容来自 manju-storyboard-director/references/douyin-viral-shortdrama-template.md。
请严格按该模板生成，不要输出解释，不要要求用户再次选择；若风格字段已提供，就直接使用该风格。

${PLATFORM_REVIEW_RULES}

${cleanedDouyinViralShortDramaTemplate}

${cinematicStoryboardOutputFormat}

${segmentedStoryboardRules}

${emotionDirectorRules}

${storyboardCapacityRules}

# 本次任务输入
请把下面内容作为模板中的【当前文案】处理，并自动拆成每段{{segmentSeconds}}的提示词。总成片时长控制在{{targetDuration}}秒，允许范围60-600秒。

【当前文案】{{scriptText}}
【指定风格】{{visualStyle}}
【目标总时长】{{targetDuration}}秒（允许范围60-600秒）
【画面比例】{{videoRatio}}

# 输出约束
1. 直接输出可用的正式结果，不要再询问风格选择。
2. 每段时长由你按剧情密度在{{segmentSeconds}}内自行选择；每段只承载一个主要事件或动作阶段，并严格遵守【15S容量控制】。
3. 使用本软件的【强制输出格式】、连续站位锚点、角色称呼规则、负面提示词规则和三轮自检规则。
4. 目标总时长按{{targetDuration}}秒规划，且必须落在60-600秒区间内；剧情不足时不硬凑，剧情过长时自动分段压缩。
5. 画面比例只能从{{videoRatio}}中选择最适合当前题材的一种，并在提示词里明确写出。
6. 风格只能从【指定风格】清单中选择或组合最适合当前题材的一种，保持全片统一。
7. 先按【当前文案】剧情顺序拆成独立15S段落单元；每个单元只提取当前段实际出现的人物、场景、物品和承接锚点，不输出全局资产清单。
8. 若资产信息不足，只能从【当前文案】中提取，不要新增人物、地点、道具和事件。`;

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "outline-expansion",
    name: "一键小说正文生成",
    description: "导入或粘贴大纲后，自动规划章节、生成正文、续写和优化单章。",
    fields: [
      { key: "outline", label: "故事大纲", multiline: true, required: true },
      { key: "totalChapters", label: "总章数", defaultValue: "20", required: true },
      {
        key: "chapterWords",
        label: "单章字数",
        defaultValue: "2500",
        required: true,
        control: "select",
        options: ["1500", "2000", "2500", "3000", "3500", "4000"],
      },
      {
        key: "style",
        label: "文风",
        defaultValue: "贴合大纲气质",
        control: "select",
        options: NOVEL_STYLE_OPTIONS,
      },
      {
        key: "perspective",
        label: "叙事视角",
        defaultValue: "第三人称",
        control: "select",
        options: NARRATIVE_PERSPECTIVE_OPTIONS,
      },
      {
        key: "autoContinue",
        label: "小说模式",
        defaultValue: "完结",
        control: "select",
        options: ["连载", "完结"],
      },
      { key: "reviseChapter", label: "优化章节", defaultValue: "1" },
    ],
    body: `# Role
你是一位拥有20年网文连载经验的【白金级主编兼正文写手】。
你的任务是把用户给定的大纲一键生成可直接发布的长篇小说正文。
${noOutlineGuard}

${PLATFORM_REVIEW_RULES}

# 生成参数
- 总章数：{{totalChapters}}
- 单章目标字数：{{chapterWords}}
- 叙事视角：{{perspective}}
- 文风基调：{{style}}
- 小说模式：{{autoContinue}}
- 自我评分目标：每章必须达到主流商业小说95分以上

# 核心目标
1. 先根据大纲自动规划第1章到第{{totalChapters}}章的连续剧情节拍，再按章节顺序输出正文。
2. 每章约{{chapterWords}}字，第一句话必须是强钩子，禁止用天气、环境、人物背景、回忆作为开场。
3. 每章都要有明确对立，反派或对手聪明且步步紧逼，爽点有“压抑-蓄力-爆发”的完整节拍。
4. 章节之间必须时空连续、因果强咬合、线索持续追踪、人物状态不丢失。
5. 每章结尾必须留下具体可拍、可续写的钩子，不要空泛金句。
6. 每章完成后进行内部自评分：开篇钩子、冲突强度、爽点密度、人物动机、对话自然度、结尾钩子、连贯性、废话控制。低于95分必须自动重写或精修后再输出。
7. 输出中不要展示思考过程，不要输出评分推理，只在每章末尾用一行给出“本章自评分：95+”。
8. 小说模式为“完结”时，必须在最后一章完成主线闭合、人物弧线收束和结局落地；小说模式为“连载”时，只需保证当前总章数内剧情推进完整，并可保留后续延展钩子。

# 用户大纲
{{outline}}

# 输出格式
直接输出完整小说正文：
第1章：章节名
正文
本章自评分：95+

第2章：章节名
正文
本章自评分：95+

一直输出到第{{totalChapters}}章。不要只输出大纲，不要只输出前几章。`,
  },
  {
    id: "chapter-split",
    name: "章节拆分",
    description: "把世界观、人物档案和主线大纲拆成章节细纲。",
    fields: [
      { key: "storySetting", label: "世界观、人物档案和故事主线", multiline: true, required: true },
      { key: "totalChapters", label: "总章数", defaultValue: "20", required: true },
    ],
    body: `# Role
你是一位精通故事节奏控制、悬念设置、长篇小说因果逻辑咬合的白金级小说主编。
${noSettingGuard}

${PLATFORM_REVIEW_RULES}

# Task
根据故事大纲与设定拆分章节细纲。必须一次性完整输出 {{totalChapters}} 章，不要分批，不要省略中间章节。

# Input Data
<story_setting>
{{storySetting}}
</story_setting>

# 输出要求
先输出全局节拍规划，再从第1章到第{{totalChapters}}章逐章输出五元骨架：舞台设定、承前破题、场景脉络、伏线与心流、死结留钩。章节编号必须连续完整，例如总章数为20时必须输出第1章到第20章。
每章必须时空连续、因果强咬合、线索持续追踪、情绪连续、钩子具体。`,
  },
  {
    id: "prose-generation",
    name: "正文生成",
    description: "按世界观、本章大纲、上一章状态生成正式章节正文。",
    fields: [
      { key: "storySetting", label: "世界观与人物档案", multiline: true, required: true },
      { key: "chapterNumber", label: "章节号", defaultValue: "1", required: true },
      { key: "chapterOutline", label: "本章大纲", multiline: true, required: true },
      { key: "previousState", label: "上一章结尾与状态结算", multiline: true, defaultValue: "无" },
      { key: "nextPreview", label: "下一章起笔预告", multiline: true, defaultValue: "无" },
      { key: "style", label: "文风", defaultValue: "粗粝写实的市井烟火风" },
    ],
    body: `# Role
你是一位拥有20年网文创作经验、文笔老辣的白金级小说大师。

# 启动规则
在用户提供 <story_setting> 和本章大纲之前，绝对不能自行编造设定或开写。
续写章必须承接上一章结尾与状态结算。

${PLATFORM_REVIEW_RULES}

# 本书文风
{{style}}

# Input Data
<story_setting>
{{storySetting}}
</story_setting>

<previous_chapter_save_state>
{{previousState}}
</previous_chapter_save_state>

<chapter_outlines>
- 本章：第{{chapterNumber}}章
- 本章大纲：{{chapterOutline}}
- 下一章起笔预告：{{nextPreview}}
</chapter_outlines>

# 输出格式
输出第{{chapterNumber}}章正式正文、下一章起笔提示、本章状态结算与衔接备忘。`,
  },
  {
    id: "novel-to-script",
    name: "小说改剧本",
    description: "把小说原文改成竖屏短剧脚本。",
    fields: [
      { key: "sourceScene", label: "小说原文", multiline: true, required: true },
    ],
    body: `# Role
你是一位精通抖音竖屏短剧流量密码的【硬核短剧导演兼总编剧】。你的任务不是重写新故事，而是把用户给出的小说原文改成可拍、可剪、可投放的竖屏短剧成片脚本。
${noSourceGuard}

${PLATFORM_REVIEW_RULES}

# Input Data
<source_scene>
{{sourceScene}}
</source_scene>

# 改编总原则
1. 只允许改编用户提供的小说原文；不得新增原文不存在的人物、场景、事件、关系、身份反转、道具功能或后续剧情。
2. 可以短剧化压缩、重排表达顺序、强化台词和镜头冲突，但必须保持原文事实、人物动机、情绪走向和因果关系不变。
3. 如果原文信息不足，只做最小可拍摄补足，并让补足服务于原文已有剧情；不要凭空制造新爽点。
4. 如原文包含平台红线，必须自动改写为合规版本，保留戏剧张力但不放大违规桥段。
5. 不要输出<think>、思考过程、解释废话、项目资料或检查清单。

# 工作流程
先做【原文事实锁定】，再做【短剧节拍重构】，最后输出【成片脚本】。

【原文事实锁定】必须提取：
- 原文章节/段落范围：识别来源内容属于哪一章、哪一段或哪个剧情节点；无法识别时写“未标明”。
- 核心事件：只列原文真实发生的事件。
- 出场人物：只列当前原文实际出现或被明确提及的人物。
- 场景空间：只列当前原文实际发生的场所。
- 关键道具：只列原文出现并推动剧情的物品。
- 人物动机：根据原文证据判断，不能凭空拔高或乱加仇恨。
- 情绪转折：写清从什么情绪转到什么情绪。

【短剧节拍重构】必须包含：
- 前三秒钩子：第一句或第一个画面必须制造压迫、疑问、冲突、羞辱、危险或利益诱惑。
- 冲突升级：每30-60秒至少有一次信息翻转、关系压迫、目标阻碍或情绪爆点。
- 可视化表达：抽象心理必须改成动作、表情、走位、道具、环境反应或旁观者反应。
- 台词爆点：台词短、准、狠，推动剧情；不要长篇解释，不要把台词揉进动作描述。
- 结尾钩子：每集/每段结尾必须留下下一步动作、危机、反转、人物选择或未解决问题。

# 成片脚本输出格式
按“集数/段落”输出。如果原文较短，输出1段；如果原文较长，按剧情自然节点拆成多段，不要硬塞。

【原文事实锁定】
- 原文章节/段落范围：
- 核心事件：
- 出场人物：
- 场景空间：
- 关键道具：
- 人物动机：
- 情绪转折：

【短剧改编策略】
- 前三秒钩子：
- 本段核心冲突：
- 冲突升级：
- 情绪爆点：
- 结尾钩子：

【集数/段落1】
- 建议时长：60-90秒；若原文信息不足，可写30-60秒。
- 场次1：场景名 / 时间 / 人物
▶ 画面：写清镜头景别、人物动作、表情、站位、道具和可拍摄调度。
角色名：台词
▶ 音效/剪辑：写清音效、停顿、推近、反打、字幕强调或剪辑节奏。
- 场次2：场景名 / 时间 / 人物
▶ 画面：
角色名：台词
▶ 音效/剪辑：

【内部自检】先在模型内部完成钩子、动机、冲突、台词、可拍摄性和合规性检查，若不达标先自动精修到达标，再直接输出成片脚本，不要展示评分结果。
# 铁律
判断一句话能不能留，只看它能不能被摄影机拍出来。
台词推动剧情，画面行放大反应。禁止抽象情绪词和机械“一镜头一台词”。
所有非台词内容用“▶”开头，台词行只保留角色名和话语。`,
  },
  {
    id: "asset-extraction",
    name: "剧本资产提取",
    description: "提取人物、物品、场景视觉特征，生成 GPT Image 出图指令。",
    fields: [
      { key: "sourceText", label: "小说或剧本文本", multiline: true, required: true },
      {
        key: "assetType",
        label: "提取类型",
        defaultValue: "人物",
        required: true,
        control: "select",
        options: ["人物", "场景", "物品"],
      },
      {
        key: "visualStyle",
        label: "画风锚点",
        defaultValue: "3D国漫风格",
        control: "select",
        options: STORYBOARD_STYLE_OPTIONS,
      },
      {
        key: "imageModel",
        label: "生图模型",
        defaultValue: "gpt-image-2",
        control: "select",
        options: IMAGE_MODEL_OPTIONS,
      },
      {
        key: "imageRatio",
        label: "生图比例",
        defaultValue: "16:9",
        control: "select",
        options: IMAGE_RATIO_OPTIONS,
      },
      {
        key: "imageResolution",
        label: "分辨率",
        defaultValue: "1K",
        control: "select",
        options: IMAGE_RESOLUTION_OPTIONS,
      },
    ],
    body: `# Role
你是一位专为 GPT Image 出图服务的【美术设定提取师】。

# 启动规则
在用户提供原文之前，绝对不能凭空编造形象。

${PLATFORM_REVIEW_RULES}

# Input Data
<source_text>
{{sourceText}}
</source_text>
- 本次只提取：{{assetType}}
- 画风锚点：{{visualStyle}}

# 输出格式
严格只输出“{{assetType}}”资产。不要输出未选择类型的资产：
- 如果本次只提取人物：不要输出场景资产，不要输出物品资产。
- 如果本次只提取场景：不要输出人物资产，不要输出物品资产。
- 如果本次只提取物品：不要输出人物资产，不要输出场景资产。
- 场景资产必须是空场景/环境设定，不得出现人物姓名、人物外貌、人物姿态、人物动作、人物关系或角色表演；只描述空间本身、陈设、材质、光线、色彩、时代地域和可拍摄机位。
- 物品资产必须是纯道具设定，不得出现人物姓名、人物外貌、人物动作或使用者表演；只描述物品本身的外形、材质、颜色、尺寸感、磨损、功能和摆放状态。

按下面格式输出，便于软件识别和批量生图：
- 人物输出必须按“完整提示词展示”字段结构，每个人物单独一组：
【人物】人物名称：
人物外貌：根据原文提取性别、年龄感、脸型、五官、眼睛、皮肤、发型、服装、配饰、表情、姿态；原文缺失时只做最小合理补足，不另起说明。
整体风格：请生成一张真人质感的人物展示图，写清{{visualStyle}}、材质、光影、镜头质感；禁止二次元插画感、塑料感、数字人CG感，除非用户明确选择对应风格。
人物的身份：根据剧情写身份、职业、阶层、时代或阵营，例如古风富家千金、夜市摊主、黑甲武将。
图片的结构：左边是人物近景肖像（正面），人物眼睛要看向摄像头；右边是人物站立三视图，包含正面、侧面、背面；背景保持干净统一，不要字幕。
绝对注意事项：严禁风格跑偏，不要平面插画感、二次元感、塑料感、仿真人感、数字人CG感；不要字幕、水印、logo、编号、文字说明；不要随机换脸、畸形手指、低清模糊。
- 场景输出必须按下面结构，每个场景单独一组；当前剧情时间必须根据原文当前剧情准确判定，例如清晨、午后、傍晚、深夜、雨夜、室内灯光时段，不要给多选项；风格与氛围必须和人物资产的画风锚点{{visualStyle}}保持一致：
【场景】场景名称：
当前剧情时间：根据当前剧情写一个明确时间段。
同场景四视角设定图：固定2X2布局，四个画面都必须展示整体场景，不是局部细节，不是单个物品特写；四格保持同一空间、同一时间、同一风格、同一氛围。
1.左上：正面全景，从主入口或正面机位看完整空间，写清核心主体、前中后景、环境结构和主光源。
2.右上：侧向全景，从左侧或右侧机位看完整空间，写清空间纵深、边缘陈设、通道关系和侧逆光。
3.左下：俯视全景，从高处俯瞰完整空间，写清动线、摊位/建筑/家具/道具整体位置和层次关系。
4.右下：反向全景，从场景内部或背面回看完整空间，写清背景出口、远景结构、光影反打和氛围延续。
统一限制：不要只拍单个物品、不要只拍材质局部、不要把四格画成四个不同地点；不得出现人物、角色、主角、配角、路人或人物动作。
- 物品输出为：【物品】物品名称：物品资产必须使用电商纯白色背景强约束，纯道具产品图，居中展示，纯白背景，白底棚拍，柔和商品光，真实材质反光，只描述物品本身的外形、材质、颜色、尺寸感、磨损状态和功能；不要人物，不要手持，不要场景环境，不要文字水印，不要logo，不要字幕。

格式示例：
【人物】林晚：
人物外貌：女性，二十多岁，白衬衫，黑色长发，眼神警觉，站在夜市摊前，冷色霓虹侧光。
整体风格：3D国漫风格，真人质感，柔和电影光影，皮肤和布料材质自然。
人物的身份：夜市摊主，普通年轻女性。
图片的结构：左边人物正面近景肖像，眼睛看向摄像头；右边人物站立三视图，正面、侧面、背面。
绝对注意事项：不要字幕、水印、logo，不要随机换脸，不要平面插画感。
【场景】破碎祭坛：
当前剧情时间：深夜冷月时段。
同场景四视角设定图：固定2X2布局，四个画面都展示同一座破碎祭坛的完整场景，不要只拍单个符文、碎石或柱子。
1.左上：正面全景，破碎祭坛石台位于神殿中央，断裂石柱围绕四周，前景碎石、中景祭坛、后景残破殿墙层次清楚，冷月逆光照出薄雾。
2.右上：侧向全景，从祭坛右侧看完整空间，塌陷石阶延伸到后方殿墙，断柱形成侧向纵深，暗红符文辅光贴地蔓延。
3.左下：俯视全景，从高处俯瞰祭坛圆形布局、塌陷石阶、符文环线和碎石分布。
4.右下：反向全景，从祭坛内部回看神殿入口和残破殿墙，冷月光从入口方向反打，薄雾保持连续。
【物品】长刀：物品资产必须使用电商纯白色背景强约束，纯道具产品图，居中展示，黑色刀柄、银白刀刃、边缘有缺口、冷光反射，不要人物，不要手持，不要场景环境，不要文字水印。

`,
  },
  {
    id: "asset-library",
    name: "资产库",
    description: "集中管理人物、场景、物品图片资产，支持导入、分类、保存和复用。",
    fields: [],
    body: "",
  },
  {
    id: "storyboard-15s",
    name: "15S 分镜脚本",
    description: "把剧本拆成每段约15秒的竖屏分镜、视频提示词和剪辑指令。",
    fields: [
      { key: "scriptText", label: "剧本或资产内容", multiline: true, required: true },
      {
        key: "targetDuration",
        label: "目标总时长",
        defaultValue: "120",
        required: true,
        control: "number",
        min: 60,
        max: 600,
      },
      {
        key: "segmentSeconds",
        label: "单段时长",
        defaultValue: "10-15秒自动选择",
        required: true,
        control: "select",
        options: STORYBOARD_SEGMENT_OPTIONS,
      },
      {
        key: "videoRatio",
        label: "画面比例",
        defaultValue: "竖屏9:16",
        control: "select",
        options: STORYBOARD_RATIO_OPTIONS,
      },
      {
        key: "visualStyle",
        label: "影像风格",
        defaultValue: "3D国漫风格",
        control: "select",
        options: STORYBOARD_STYLE_OPTIONS,
      },
    ],
    body: douyinStoryboardBody,
  },
  {
    id: "gpt-image2-storyboard",
    name: "GPT-image2 四宫格故事板",
    description: "把当前小说、剧本或分镜的15S内容压缩成一张图，用四个画面完整展示剧情信息。",
    fields: [
      { key: "sourceText", label: "小说/剧本/分镜内容", multiline: true, required: true },
      {
        key: "boardCount",
        label: "故事板数量",
        defaultValue: "1",
        required: true,
        control: "select",
        options: ["1", "2", "3", "4"],
      },
      {
        key: "imageRatio",
        label: "画面比例",
        defaultValue: "16:9",
        control: "select",
        options: IMAGE_RATIO_OPTIONS,
      },
      {
        key: "imageModel",
        label: "生图模型",
        defaultValue: "gpt-image-2",
        control: "select",
        options: IMAGE_MODEL_OPTIONS,
      },
      {
        key: "imageResolution",
        label: "分辨率",
        defaultValue: "1K",
        control: "select",
        options: IMAGE_RESOLUTION_OPTIONS,
      },
      {
        key: "visualStyle",
        label: "影像风格",
        defaultValue: "3D国漫风格",
        control: "select",
        options: STORYBOARD_STYLE_OPTIONS,
      },
      {
        key: "panelLayout",
        label: "画面布局",
        defaultValue: "四宫格2x2",
        control: "select",
        options: ["四宫格2x2", "六宫格3x2", "九宫格3x3", "横向四连格", "竖向四连格"],
      },
    ],
    body: `# Role
你是专业 AI 影视故事板导演和 GPT-image-2 出图提示词工程师。你的任务是把用户提供的小说、剧本或分镜内容，压缩成一张可直接交给 GPT-image-2 生成的“四宫格故事板单图”。这张图必须用四个画面完整展示当前约15S剧情信息，而不是输出多张独立故事板。

${PLATFORM_REVIEW_RULES}

# 输入内容
<source_text>
{{sourceText}}
</source_text>

# 生成参数
- 生成数量：{{boardCount}}
- GPT-image-2 出图比例：{{imageRatio}}
- 统一影像风格：{{visualStyle}}
- 画面布局：{{panelLayout}}

# 工作规则
1. 只处理用户当前给出的小说、剧本或分镜内容，默认它对应约15S视频信息；不要扩写成后续剧情，不要加入未出现的人物、场景和物品。
2. 必须把这15S信息拆成四个画面：画面1负责钩子/起势，画面2负责冲突推进，画面3负责关键动作或情绪爆点，画面4负责结果/悬念/可衔接落点。
3. 最终目标是一张图，不是四张图，也不是视频提示词。四个画面必须同图呈现，布局使用{{panelLayout}}。
4. 人物、服装、场景、道具必须来自原文；原文缺失时只做最小合理补全，并在四个画面里保持一致。
5. 画面之间要有清晰时间顺序，但不要在图中写文字编号、台词、字幕、说明、水印或logo。
6. GPT-image-2出图提示词必须写清整张图的布局、画面比例、统一风格、四格内容、角色一致性、场景一致性、光线色彩和负面限制。
7. 按生成数量输出{{boardCount}}组，每组都是一张独立的 GPT-image2 四宫格单图提示词；不同组可以从镜头角度、构图节奏、情绪重心上做变化，但不得改变剧情事实。
8. 审核红线要自动规避。遇到暴力、迷信、低俗、未成年人风险、拜金炫富、极端复仇等内容时，保留戏剧张力但改写成合规视觉表达。
9. 不要输出思考过程，不要输出<think>标签，不要输出项目资料、检查清单或解释性废话。

# 输出格式
输出{{boardCount}}组，每组都按以下结构输出：

【第1组 GPT-image2四宫格故事板】
【标杆视频分析】
- 产品卖点：总结本段剧情最值得模仿的视觉卖点，不复制具体人物、品牌、台词或受版权保护的独特画面。
- 人物关系：只列当前故事板范围内实际出现的人物关系。
- 场景结构：列出核心空间、人物站位和可重复使用的视觉锚点。
- 15S信息节奏：说明四个画面分别承载的剧情功能。

【素材准备】
至少准备三类素材，并明确哪些素材可以复用：
- 产品/核心物品类素材：本段剧情中的核心产品、道具、包装、食物、武器或信息载体。
- 人物类素材：主角、配角的统一脸型、发型、年龄感、体型、妆容和身份锚点。
- 场景类素材：完整场景、固定背景、空间结构、时间、光源和关键陈设。
- 服装类素材：单独准备服装类素材，写清上装、下装、鞋履、配饰、材质和颜色；不要把服装一致性只交给模型猜测。

【全局连续性设定】
- 角色锁定：
- 场景锁定：
- 道具锁定：
- 色彩与光影：
- 镜头语言：
- 负面限制：不要字幕、水印、logo、随机换脸、畸形手指、角色服装漂移、场景无故切换、低清模糊。

【四宫格画面拆分】
画面1：
画面2：
画面3：
画面4：

【GPT-image2四宫格单图提示词】
GPT-image-2出图提示词：
必须是一张图，{{panelLayout}}，{{imageRatio}}，{{visualStyle}}。四个画面共同展示当前15S剧情完整信息：画面1写起势，画面2写推进，画面3写爆点，画面4写结果或悬念。四格共享同一角色设定、同一服装、同一场景逻辑、同一光影色彩体系。不要字幕、水印、logo，不要文字说明，不要随机换脸，不要把四格画成四个无关场景，不要遗漏核心道具和关键动作。`,
  },
];

export function getTemplate(id: TemplateId): TemplateDefinition {
  const template = TEMPLATES.find((item) => item.id === id);
  if (!template) throw new Error(`未知模板：${id}`);
  return template;
}

export function buildPrompt(template: TemplateDefinition, values: PromptValues): string {
  const missing = template.fields
    .filter((field) => field.required)
    .filter((field) => !(values[field.key] ?? field.defaultValue ?? "").trim())
    .map((field) => field.label);

  if (missing.length > 0) {
    throw new Error(`请填写：${missing.join("、")}`);
  }

  return template.body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return values[key] ?? template.fields.find((field) => field.key === key)?.defaultValue ?? "";
  });
}

