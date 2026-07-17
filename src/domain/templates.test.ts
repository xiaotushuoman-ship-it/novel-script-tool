import { describe, expect, it } from "vitest";
import { buildPrompt, getTemplate, PLATFORM_REVIEW_RULES, TEMPLATES } from "./templates";

describe("template catalog", () => {
  it("contains the required workflow templates in order", () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual([
      "outline-expansion",
      "chapter-split",
      "prose-generation",
      "novel-to-script",
      "asset-extraction",
      "asset-library",
      "storyboard-15s",
      "gpt-image2-storyboard",
      "xiaotu-skill",
      "seedance-video",
      "custom-image",
      "script-polish",
      "director-desk",
    ]);
  });
});

describe("buildPrompt", () => {
  it("injects platform review rules into every generation prompt", () => {
    expect(PLATFORM_REVIEW_RULES).toContain("抖音/红果短剧合规优先");
    expect(PLATFORM_REVIEW_RULES).toContain("绝对禁止");
    expect(PLATFORM_REVIEW_RULES).toContain("霸总虐恋");
    expect(PLATFORM_REVIEW_RULES).toContain("未成年人风险");

    const prompts = [
      buildPrompt(getTemplate("outline-expansion"), {
        outline: "普通人返乡创业，带动村民做非遗文旅。",
        totalChapters: "20",
        chapterWords: "2500",
        style: "现实主义",
        perspective: "第三人称",
        autoContinue: "开启",
      }),
      buildPrompt(getTemplate("chapter-split"), {
        storySetting: "普通人返乡创业，传承非遗。",
        totalChapters: "20",
      }),
      buildPrompt(getTemplate("prose-generation"), {
        storySetting: "普通人返乡创业，传承非遗。",
        chapterNumber: "1",
        chapterOutline: "主角回村修复老手艺工坊。",
        previousState: "无",
        nextPreview: "下一章开始招募学徒。",
        style: "现实主义",
      }),
      buildPrompt(getTemplate("novel-to-script"), {
        sourceScene: "主角回村修复老手艺工坊。",
        continuity: "无",
      }),
      buildPrompt(getTemplate("asset-extraction"), {
        sourceText: "主角在老工坊展示非遗技艺。",
        assetType: "人物",
        visualStyle: "3D国漫风格",
        imageModel: "gpt-image-2",
        imageRatio: "16:9",
        imageResolution: "1K",
      }),
      buildPrompt(getTemplate("storyboard-15s"), {
        scriptText: "主角在老工坊展示非遗技艺。",
        targetDuration: "120",
        segmentSeconds: "10-15秒自动选择",
        videoRatio: "横屏16:9",
        visualStyle: "3D国漫风格",
      }),
      buildPrompt(getTemplate("gpt-image2-storyboard"), {
        sourceText: "主角举起祖传菜谱，夜市摊前的人群围拢。",
        boardCount: "2",
        imageRatio: "16:9",
        visualStyle: "3D国漫风格",
        panelLayout: "四宫格2x2",
      }),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain("平台审核硬规则");
      expect(prompt).toContain("封建迷信");
      expect(prompt).toContain("极端复仇");
      expect(prompt).toContain("未成年人早恋");
      expect(prompt).toContain("普通人成长");
    }
  });

  it("fills one-click novel generation variables and keeps the no-source guard", () => {
    const template = getTemplate("outline-expansion");
    const prompt = buildPrompt(template, {
      outline: "主角被赶出家门，当晚发现祖传菜谱能让破摊起死回生。",
      totalChapters: "20",
      chapterWords: "2500",
      style: "粗粝写实",
      perspective: "第三人称",
      autoContinue: "开启",
    });

    expect(prompt).toContain("在用户明确提供大纲前");
    expect(prompt).toContain("主角被赶出家门");
    expect(prompt).toContain("总章数：20");
    expect(prompt).toContain("单章目标字数：2500");
    expect(prompt).toContain("完整短剧剧本");
    expect(prompt).not.toContain("本章自评分：95+");
  });

  it("tells one-click novel generation to infer missing outline details instead of asking follow-up questions", () => {
    const template = getTemplate("outline-expansion");
    const prompt = buildPrompt(template, {
      outline: "主角拿回父亲留下的老招牌，靠一门手艺翻盘。",
      totalChapters: "20",
      chapterWords: "2500",
      style: "粗粝写实",
      perspective: "第三人称",
      autoContinue: "完结",
    });

    expect(prompt).toContain("只要用户提供了故事大纲");
    expect(prompt).toContain("不得向用户追问");
    expect(prompt).toContain("根据题材自动补齐");
    expect(prompt).toContain("只补全大纲未写明的必要信息");
    expect(prompt).toContain("不得输出自检、评分、爆点拆解");
  });

  it("builds safe high-retention scripts without exposing internal checks or production specs", () => {
    const template = getTemplate("outline-expansion");
    const prompt = buildPrompt(template, {
      outline: "沈知意被迫交出祖传绣坊，却发现长姐早已调换账本。",
      totalChapters: "20",
      chapterWords: "2500",
      style: "古风权谋",
      perspective: "第三人称",
      autoContinue: "完结",
    });

    expect(prompt).toContain("都市爽文");
    expect(prompt).toContain("情感女频");
    expect(prompt).toContain("古风情感");
    expect(prompt).toContain("政治、军事、宗教、法律");
    expect(prompt).toContain("必须转换为普通人的家庭、情感、邻里、普通职场、经营、手艺、成长或生活选择冲突");
    expect(prompt).toContain("场景目标、现实阻力、结束时的价值变化");
    expect(prompt).toContain("晚进早出");
    expect(prompt).toContain("每8-12秒");
    expect(prompt).toContain("翻译腔、舞台剧腔");
    expect(prompt).toContain("生活梗");
    expect(prompt).toContain("场次标题");
    expect(prompt).toContain("画面/动作");
    expect(prompt).toContain("台词");
    expect(prompt).toContain("音效/氛围");
    expect(prompt).toContain("内部完成");
    expect(prompt).toContain("不得输出自检");
    expect(prompt).toContain("第一句话");
    expect(prompt).toContain("小说叙事模式与短剧表达模式自动判断");
    expect(prompt).toContain("人物语言指纹");
    expect(prompt).toContain("姓名互换测试");
    expect(prompt).toContain("潜台词");
    expect(prompt).toContain("单次发言不得超过20个汉字");
    expect(prompt).toContain("标点符号不计入字数");
    expect(prompt).toContain("拆成自然的多轮短句");
    expect(prompt).toContain("施压、试探、遮掩、套话、拒绝、交易、暴露、误判、反击、关系变化或行动决定");
    expect(prompt).toContain("你听我解释");
    expect(prompt).toContain("事情不是你想的那样");
    expect(prompt).toContain("0-2秒");
    expect(prompt).toContain("2-5秒");
    expect(prompt).toContain("直接从【第1章：章节名】开始");
    expect(prompt).toContain("禁止输出【制作规格】");
    expect(prompt).not.toContain("【制作规格】\n总章数");
    expect(prompt).not.toContain("输出人物语言指纹");
    expect(prompt).not.toContain("输出姓名互换测试结果");
    expect(prompt).not.toContain("本章自评分：95+");
    expect(prompt).toContain("不得输出自检、评分、爆点拆解");
  });

  it("configures the first step as one-click novel generation", () => {
    const template = getTemplate("outline-expansion");
    const fields = Object.fromEntries(template.fields.map((field) => [field.key, field]));

    expect(template.name).toBe("一键小说正文生成");
    expect(fields.outline.multiline).toBe(true);
    expect(fields.totalChapters.defaultValue).toBe("20");
    expect(fields.chapterWords.control).toBe("select");
    expect(fields.chapterWords.options).toContain("2500");
    expect(fields.style.control).toBe("select");
    expect(fields.style.options).toContain("都市爽文");
    expect(fields.style.options).toContain("电影感写实");
    expect(fields.style.options).toContain("古风家业");
    expect(fields.style.options).toContain("古风经营");
    expect(fields.style.options).toContain("生活悬念");
    expect(fields.style.options).not.toContain("历史权谋");
    expect(fields.style.options).not.toContain("悬疑刑侦");
    expect(fields.style.options).toContain("暗黑复仇");
    expect(fields.perspective.control).toBe("select");
    expect(fields.perspective.options).toContain("第三人称限知");
    expect(fields.perspective.options).toContain("第一人称");
    expect(fields.perspective.options).toContain("多主角群像视角");
    expect(fields.perspective.options).toContain("剧本镜头式叙事");
    expect(fields.autoContinue.control).toBe("select");
    expect(fields.autoContinue.options).toEqual(["连载", "完结"]);
  });

  it("throws when a required field is empty", () => {
    const template = getTemplate("novel-to-script");
    expect(() => buildPrompt(template, { sourceScene: "" })).toThrow("请填写：小说原文");
  });

  it("uses novel-only wording for the novel-to-script source field", () => {
    const template = getTemplate("novel-to-script");
    expect(template.description).toBe("把小说原文改成短剧脚本。");
    expect(template.fields[0]).toMatchObject({
      key: "sourceScene",
      label: "小说原文",
      multiline: true,
      required: true,
    });
  });

  it("builds a production-grade novel-to-script conversion prompt", () => {
    const prompt = buildPrompt(getTemplate("novel-to-script"), {
      sourceScene: "许明舟被二叔逼签断亲书，只带走父母留下的红木菜箱。",
    });

    expect(prompt).toContain("只允许改编用户提供的小说原文");
    expect(prompt).toContain("不得新增原文不存在的人物、场景、事件、关系、身份反转、道具功能或后续剧情");
    expect(prompt).toContain("原文事实锁定");
    expect(prompt).toContain("前三秒钩子");
    expect(prompt).toContain("冲突升级");
    expect(prompt).toContain("结尾钩子");
    expect(prompt).toContain("集数/段落");
    expect(prompt).toContain("场次");
    expect(prompt).toContain("画面");
    expect(prompt).toContain("台词");
    expect(prompt).toContain("音效/剪辑");
    expect(prompt).toContain("不要输出<think>");
    expect(prompt).toContain("内部自检");
    expect(prompt).not.toContain("短剧钩子评分");
    expect(prompt).not.toContain("人物动机评分");
    expect(prompt).not.toContain("可拍摄评分");
    expect(prompt).not.toContain("合规评分");
    expect(prompt).not.toContain("本段质量自检");
    expect(prompt).toContain("若原文中已经分成 N 集 / N 段 / N 个剧情节点，必须输出 N 段");
    expect(prompt).toContain("不得把所有内容压成 1 集");
    expect(prompt).toContain("许明舟被二叔逼签断亲书");
    expect(prompt).not.toContain("竖屏");
    expect(prompt).not.toContain("横屏");
    expect(prompt).not.toContain("9:16");
    expect(prompt).not.toContain("16:9");
  });

  it("builds a 15-second storyboard prompt from the Douyin viral short-drama template", () => {
    const template = getTemplate("storyboard-15s");
    const prompt = buildPrompt(template, {
      scriptText: "▶ 夜市摊前，女主攥着祖传菜谱。\n女主：今晚，我要把这条街翻过来。",
      targetDuration: "180",
      segmentSeconds: "10-15秒自动选择",
      videoRatio: "横屏16:9",
      visualStyle: "复古欧美原子朋克风格",
    });

    expect(prompt).toContain("抖音爆款AI短剧导演");
    expect(prompt).toContain("连续站位锚点");
    expect(prompt).toContain("180秒");
    expect(prompt).toContain("10-15秒自动选择");
    expect(prompt).toContain("横屏16:9");
    expect(prompt).toContain("复古欧美原子朋克风格");
    expect(prompt).toContain("不要在【画面内容】的每条分镜里重复写横屏、竖屏");
    expect(prompt).toContain("夜市摊前");
    expect(prompt).not.toContain("_::~OUTPUT_START::~_");
    expect(prompt).not.toContain("_::~FIELD::~_");
    expect(prompt).toContain("【视觉基调】");
    expect(prompt).toContain("【色彩与影调】");
    expect(prompt).toContain("【上一段尾帧缓冲】");
    expect(prompt).toContain("只作为下一段开场连续性参考");
    expect(prompt).toContain("不重复生成完整剧情，不重复对白，不推进新事件");
    expect(prompt).toContain("【本段开场继承】");
    expect(prompt).toContain("【主体和空间关系】");
    expect(prompt).toContain("【人物互动关系表】");
    expect(prompt).toContain("分镜1");
    expect(prompt).toContain("【本段结尾状态锁】");
    expect(prompt).toContain("本段最后一帧的可接状态");
    expect(prompt).toContain("角色位置、朝向、手部/脚步状态、道具状态、视线方向、声音余韵、环境状态");
    expect(prompt).toContain("最后一镜景别");
    expect(prompt).toContain("下一段开场景别必须继承上一段最后一镜景别或使用相邻景别过渡");
    expect(prompt).toContain("不允许大特写直接跳到远景/航拍");
    expect(prompt).toContain("远景 -> 全景 -> 中景");
    expect(prompt).toContain("不能让上一段手里拿着的东西下一段凭空消失");
    expect(prompt).toContain("如果剧情确实换场，必须用遮挡转场、声音先入、动作出画");
    expect(prompt).toContain("【画面内容】里的每个分镜不要再写横屏、竖屏、16:9、9:16、21:9等画面比例词");
    expect(prompt).toContain("对白：角色名：台词");
    expect(prompt).toContain("不要把台词揉进动作描述里");
    expect(prompt).toContain("角色称呼规则只约束分镜描述和提示词");
    expect(prompt).toContain("台词按真人说话逻辑");
    expect(prompt).toContain("可以自然使用“我、你、他、她”等代词");
    expect(prompt).toContain("对白：刘婶：年轻人嫌麻烦！");
    expect(prompt).toContain("对白：老赵：小摊，没啥好拍！");
    expect(prompt).toContain("每一个15S段落都是一个独立可生成的视频提示词单元");
    expect(prompt).toContain("只允许使用该段剧情实际出现的人物、场景、物品");
    expect(prompt).toContain("不要把全文所有出场人物、所有场景、所有物品资产塞进每一段");
    expect(prompt).toContain("禁止每段都用闪白、黑场、强转场、硬切转场来衔接");
    expect(prompt).toContain("人物互动防错规则");
    expect(prompt).toContain("发起者、承受者、关系类型、原文依据");
    expect(prompt).toContain("不能颠倒");
    expect(prompt).toContain("人物一致性与服装描述控制");
    expect(prompt).toContain("默认不要在【主体和空间关系】或【画面内容】中反复描述服装");
    expect(prompt).toContain("只有剧情明确需要时才可以写服装");
    expect(prompt).toContain("动作/打戏专项规则");
    expect(prompt).toContain("起势 -> 发力 -> 接触/避让 -> 受力反馈 -> 落点");
    expect(prompt).toContain("攻方/发起者、守方/承受者");
    expect(prompt).toContain("站位必须连续");
    expect(prompt).toContain("高级运镜与视角库");
    expect(prompt).toContain("ACT动作视角");
    expect(prompt).toContain("超微距视角");
    expect(prompt).toContain("过肩视角");
    expect(prompt).toContain("主观POV视角");
    expect(prompt).toContain("FPV穿越机式视角");
    expect(prompt).toContain("镜面/反射视角");
    expect(prompt).toContain("每个15S段落最多选择1-2种高级视角");
    expect(prompt).toContain("如果高级视角会破坏人物关系、手机朝向、站位连续或动作清晰度");
    expect(prompt).toContain("情绪导演增强");
    expect(prompt).toContain("角色音色与对白节奏锁定");
    expect(prompt).toContain("【角色音色锁定表】");
    expect(prompt).toContain("轻/重/缓/急");
    expect(prompt).toContain("对白：角色名（音色标签，轻/重，缓/急，情绪状态）：台词");
    expect(prompt).toContain("可拍摄的生理反应");
    expect(prompt).toContain("听者反应");
    expect(prompt).toContain("角色称呼规则只约束分镜描述和提示词");
    expect(prompt).toContain("台词按真人说话逻辑");
    expect(prompt).toContain("可以自然使用“我、你、他、她”等代词");
    expect(prompt).toContain("不要只写“悲伤/愤怒/心动/紧张/释然”");
    expect(prompt).toContain("15S容量控制");
    expect(prompt).toContain("高密度秒表模式");
    expect(prompt).toContain("标准剧情模式");
    expect(prompt).toContain("混合快节奏模式");
    expect(prompt).toContain("0-1.5s入画");
    expect(prompt).toContain("1.5-3s起势");
    expect(prompt).toContain("6.5-8s动作卖点");
    expect(prompt).toContain("动作卖点");
    expect(prompt).toContain("对白最多2句");
    expect(prompt).toContain("对白总量最多2句");
    expect(prompt).toContain("如果当前剧情必须超过所选模式容量，必须拆成下一个15S段落单元");
    expect(prompt).toContain("画面文字与乱码屏蔽规则");
    expect(prompt).toContain("字体、颜色、材质和排版必须根据剧情载体选择");
    expect(prompt).toContain("文字清晰工整，可读性高");
    expect(prompt).toContain("SEEDAN2.0视频生成审核规避规则");
    expect(prompt).toContain("不要输出血腥、断肢、爆头、喷血、肢解");
    expect(prompt).toContain("文字乱码、错别字、输入法候选栏");
    expect(prompt).toContain("不要字幕水印、不要多余UI文字");
    expect(prompt).toContain("信息载体朝向与镜头逻辑规则");
    expect(prompt).toContain("手机、纸张、合同、账单、屏幕、菜单、聊天界面等可读信息载体");
    expect(prompt).toContain("人物正面对镜头、低头看手机，手机屏幕应朝向人物");
    expect(prompt).toContain("不能让手机屏幕正对观众却又表现为角色正在阅读");
    expect(prompt).toContain("过肩镜头、主观视角、插入特写、角色把手机转向镜头展示");
    expect(prompt).toContain("100分成片级自检与自动返工");
    expect(prompt).toContain("任何一项不达标都必须先自动重写");
    expect(prompt).toContain("最终只输出正式分镜结果");
    expect(prompt).toContain("负面限制：不要随机换脸，不要字幕水印。");
  });

  it("defaults storyboard controls to duration ranges, aspect choices, and popular styles", () => {
    const template = getTemplate("storyboard-15s");
    const fields = Object.fromEntries(template.fields.map((field) => [field.key, field]));
    const fieldKeys = template.fields.map((field) => field.key);

    expect(fields.targetDuration.defaultValue).toBe("120");
    expect(fields.targetDuration.control).toBe("number");
    expect(fields.targetDuration.min).toBe(60);
    expect(fields.targetDuration.max).toBe(600);
    expect(fields.segmentSeconds.options).toContain("10-15秒自动选择");
    expect(fields.videoRatio.options).toContain("横屏16:9");
    expect(fields.videoRatio.options).toContain("电影宽屏21:9");
    expect(fields.visualStyle.options).toContain("3D国漫风格");
    expect(fields.visualStyle.options).not.toContain("3D仿真精致角色");
    expect(fields.visualStyle.options).not.toContain("现代甜酷3D乙游");
    expect(fields.visualStyle.options).toContain("复古欧美原子朋克风格");
    expect(fieldKeys).not.toContain("previousEnding");
    expect(fieldKeys).not.toContain("nextOpening");
    expect(fieldKeys).not.toContain("characterAssets");
    expect(fieldKeys).not.toContain("sceneAssets");
    expect(fieldKeys).not.toContain("propAssets");
  });

  it("configures one-click script polish as a Douyin-safe rewrite workflow", () => {
    const template = getTemplate("script-polish");
    const fields = Object.fromEntries(template.fields.map((field) => [field.key, field]));
    const prompt = buildPrompt(template, {
      sourceText: "女主被全家看不起，拿到证据后当众反击。",
      rewriteDirection: "打脸逆袭",
      outputForm: "短剧剧本",
      originalityLevel: "大幅重构，只学习爆点逻辑",
      targetLength: "20章",
      chapterWords: "2000字左右",
      endingMode: "完结",
      storyTime: "按参考内容自动判断",
      extraRequirement: "台词更口语化，节奏更快。",
    });

    expect(template.name).toBe("剧本一键洗稿");
    expect(fields.sourceText.multiline).toBe(true);
    expect(fields.sourceText.required).toBe(true);
    expect(fields.rewriteDirection.control).toBe("select");
    expect(fields.rewriteDirection.options).toContain("男频热血逆袭");
    expect(fields.rewriteDirection.options).toContain("女频大女主复仇");
    expect(fields.rewriteDirection.options).toContain("AI漫剧爆款");
    expect(fields.rewriteDirection.options).toContain("海外出海爽剧");
    expect(fields.rewriteDirection.options).toContain("电商带货剧情");
    expect(fields.outputForm.options).toContain("短剧剧本");
    expect(fields.targetLength.control).toBe("select");
    expect(fields.targetLength.label).toBe("目标长度");
    expect(fields.targetLength.options).toEqual(["10章", "20章", "30章", "50章", "80章", "100章", "自定义章数"]);
    expect(fields.chapterWords.control).toBe("select");
    expect(fields.chapterWords.defaultValue).toBe("2000字左右");
    expect(fields.endingMode.control).toBe("select");
    expect(fields.endingMode.options).toEqual(["完结", "连载"]);
    expect(fields.storyTime.control).toBe("select");
    expect(fields.storyTime.options).toContain("按参考内容自动判断");
    expect(fields.storyTime.options).toContain("现代都市");
    expect(fields.storyTime.options).toContain("古代架空");
    expect(prompt).toContain("不照抄原文");
    expect(prompt).toContain("只学习冲突结构、爽点递进、人物动机、爆点前置、钩子节奏和台词方式");
    expect(prompt).toContain("0-2秒");
    expect(prompt).toContain("2-5秒");
    expect(prompt).toContain("8-12秒");
    expect(prompt).toContain("抖音审核");
    expect(prompt).toContain("番茄小说/知乎");
    expect(prompt).toContain("女主被全家看不起");
    expect(prompt).toContain("大幅重构，只学习爆点逻辑");
    expect(prompt).toContain("20章");
    expect(prompt).toContain("2000字左右");
    expect(prompt).toContain("完结方式：完结");
    expect(prompt).toContain("故事时间背景：按参考内容自动判断");
    expect(prompt).toContain("【制作规格】");
    expect(prompt).toContain("目标章数");
    expect(prompt).toContain("单章字数");
    expect(prompt).toContain("输出范围");
    expect(prompt).toContain("完结状态");
    expect(prompt).toContain("内置多阶段创作流程");
    expect(prompt).toContain("赛道分析");
    expect(prompt).toContain("优先保持参考内容原始题材赛道");
    expect(prompt).toContain("同类型剧情");
    expect(prompt).toContain("洗稿方向只用于强化爽点结构");
    expect(prompt).toContain("不得把末世、古风、都市、悬疑、职场、电商、玄幻、武侠等明确题材强行改成乡土家庭题材");
    expect(prompt).toContain("农村乡土题材");
    expect(prompt).toContain("普通老百姓");
    expect(prompt).toContain("一句话就能吸引观众");
    expect(prompt).toContain("反差点和猎奇点");
    expect(prompt).toContain("按目标章数完整规划");
    expect(prompt).toContain("每章约2000字");
    expect(prompt).toContain("2S跳出率");
    expect(prompt).toContain("5S完播率");
    expect(prompt).toContain("开头第一句话必须能单独抓住观众");
    expect(prompt).toContain("去AI感");
    expect(prompt).toContain("男频都市爽文专属指令");
    expect(prompt).toContain("小生意、婚恋钱财、物业维权、职场利益冲突");
    expect(prompt).toContain("第一人称小说爆款稿");
    expect(prompt).toContain("男主沉稳、成熟、有经验、有掌控力");
    expect(prompt).toContain("合同、票据、后台、签字、盖章、流程");
    expect(prompt).toContain("反派就是反派，不提前洗白");
    expect(prompt).toContain("不写成“人物名：台词”的伪剧本");
    expect(prompt).toContain("每章都有新爽点");
    expect(prompt).toContain("强迫食用排泄物");
    expect(prompt).toContain("狗链、狗笼");
    expect(prompt).toContain("极端侮辱");
    expect(prompt).toContain("非人化");
    expect(prompt).toContain("亵渎受害者尊严");
    expect(prompt).toContain("群体妖魔化");
    expect(prompt).toContain("极端家庭暴力");
    expect(prompt).toContain("违背家庭人伦亲情");
    expect(prompt).toContain("封建婚恋观");
    expect(prompt).toContain("伦理擦边");
    expect(prompt).toContain("暴力美化与违法犯罪");
    expect(prompt).toContain("恶意丑化群体");
    expect(prompt).toContain("自动替换为同等戏剧功能");
    expect(prompt).toContain("短剧剧本或小说正文必须逐章输出完整成品");
    expect(prompt).toContain("不得用分章大纲、章节摘要、剧情概述代替后续章节正文");
    expect(prompt).not.toContain("先完整输出总章纲，再输出当前可覆盖章节");
    expect(prompt).not.toContain("成品内容和章节大纲必须按章编号输出");
    expect(prompt).toContain("不要输出 Mermaid 流程图");
    expect(prompt).not.toContain("graph TD");
    expect(prompt).not.toContain("ag_001");
  });

  it("builds the Xiaotu skill prompt with Seedance safety and free timestamps", () => {
    const template = getTemplate("xiaotu-skill");
    const fields = Object.fromEntries(template.fields.map((field) => [field.key, field]));
    const prompt = buildPrompt(template, {
      sourceText: "夜市摊前，许明舟端起第一碗葱油面，围观客人停下脚步。",
      mode: "多机位分镜",
      segmentSeconds: "12",
      visualStyle: "影视写实现代",
      audioRule: "保留环境声和原文对白",
    });

    expect(template.name).toBe("小兔skill");
    expect(fields.mode.options).toEqual(["一镜到底", "多机位分镜"]);
    expect(fields.segmentSeconds.control).toBe("number");
    expect(fields.segmentSeconds.min).toBe(1);
    expect(fields.segmentSeconds.max).toBe(600);
    expect(prompt).toContain("SEEDAN2.0视频生成审核规避规则");
    expect(prompt).toContain("不要输出血腥、断肢、爆头、喷血、肢解");
    expect(prompt).toContain("必须自动替换为可拍摄、可过审、可生成的同等戏剧功能画面");
    expect(prompt).toContain("必须先从原文抽取真实角色名");
    expect(prompt).toContain("规则条例优化版");
    expect(prompt).toContain("学习参考提炼版");
    expect(prompt).toContain("对白对峙默认使用过肩镜（OTS）+反打");
    expect(prompt).toContain("镜头时长以0.3-4.5秒为主");
    expect(prompt).toContain("每条分镜必须写清对准谁、对准哪里、表情/微动作、主体动作、跟随动作、画面信息点、镜头位置与运动");
    expect(prompt).toContain("每段最后一镜必须承担结尾钩子或转场任务");
    expect(prompt).toContain("时间戳必须按故事动作、对白长度、情绪停顿和镜头复杂度自由划分");
    expect(prompt).toContain("不要默认0-3s、3-6s、6-9s");
    expect(prompt).toContain("实际输出必须根据当前剧情自由增减分镜数量、分镜标题和时间戳");
    expect(prompt).toContain("参考图统一写成“角色名：{@图1}状态/手持道具/站位”");
    expect(prompt).toContain("不要输出【段落1｜12秒｜多机位分镜】");
    expect(prompt).toContain("每个段落必须直接从“剧情N：”开始");
    expect(prompt).toContain("长内容必须在同一次回答内依次输出剧情2：剧情3：剧情4：");
    expect(prompt).toContain("不要输出【段落2】【段落3】这类标题");
    expect(prompt).toContain("不要说受长度限制，不要说可以继续分批补齐");
    expect(prompt).toContain("集数/场次/章节号只用于识别剧情顺序，不等于输出段落数");
    expect(prompt).toContain("一集或一场超过12秒容量时，必须拆成多个【段落】");
    expect(prompt).toContain("场次编号不是拆段命令");
    expect(prompt).toContain("能在12秒内讲清，必须合并为一个【段落1】");
    expect(prompt).toContain("严禁只输出【段落1】后停止");
    expect(prompt).toContain("剧情1：");
    expect(prompt).toContain("剧情2：");
    expect(prompt).toContain("不要输出【基础设定】");
    expect(prompt).toContain("每个段落必须独立包含且只显示剧情N：【氛围与画质】【声音】【画面内容】四个结果字段");
    expect(prompt).toContain("角色名：{@图1}状态/手持道具/站位。");
    expect(prompt).toContain("不要写“成年男性”“成年女性”“二十多岁末到三十岁初”这类泛化年龄性别描述");
    expect(prompt).toContain("除非剧情明确需要，不要描述服装");
    expect(prompt).toContain("每个段落末尾必须单独加一句：不要出现字幕，不要BGM");
    expect(prompt).toContain("【声音】");
    expect(prompt).toContain("保留环境声和原文对白。");
    expect(prompt).toContain("风格核心字段只能写成“风格核心：影视写实现代”");
    expect(prompt).toContain("视觉基调：必须写成不少于80字的完整段落");
    expect(prompt).toContain("根据当前剧本或小说的题材、时代、空间和统一影像体系自行选择");
    expect(prompt).toContain("视觉基调字段禁止复述影像风格里的画风关键词");
    expect(prompt).toContain("只写摄影机设备感、镜头类型、画幅观感、拍摄方式、运动质感和景深控制");
    expect(prompt).toContain("同一部剧本或小说必须保持统一影像体系");
    expect(prompt).toContain("色彩与影调：必须写成不少于80字的完整段落");
    expect(prompt).not.toContain("例如ARRI Alexa 65");
    expect(prompt).not.toContain("Cooke Anamorphic/i");
    expect(prompt).toContain("分镜1丨分镜标题丨0-2.5s丨");
    expect(prompt).toContain("不要输出[0-3s]这种方括号时间码");
    expect(prompt).toContain("Mx-Shell_Prompts v1.5");
    expect(prompt).toContain("绝对禁止文学化修辞");
    expect(prompt).toContain("对白与画外音例外条款");
    expect(prompt).toContain("物理优先法则");
    expect(prompt).toContain("有参考图时");
    expect(prompt).toContain("不超过20字");
    expect(prompt).toContain("无参考图时");
    expect(prompt).toContain("只写角色身份、状态、手持道具、站位和当前动作");
    expect(prompt).toContain("不需要配乐，仅保留同期声");
    expect(prompt).toContain("对白与画外音处理");
    expect(prompt).toContain("纯文本以 TXT 格式输出");
    expect(prompt).not.toContain("欢迎来**AIGC自修室**");
  });

  it("locks Xiaotu skill spatial continuity and interaction direction", () => {
    const template = getTemplate("xiaotu-skill");
    const prompt = buildPrompt(template, {
      sourceText: "林晚舟站在豆腐坊门口，刘婶在门内质疑她，老赵在卤味摊旁轻拍锅盖。",
      mode: "多机位分镜",
      segmentSeconds: "15",
      visualStyle: "影视写实现代",
      audioRule: "保留同期声",
    });

    expect(prompt).toContain("禁止输出【角色音色锁定表】【空间坐标与连续性】");
    expect(prompt).toContain("空间坐标锁定");
    expect(prompt).toContain("上下分镜继承");
    expect(prompt).toContain("反打不反关系");
    expect(prompt).toContain("互动链校验");
    expect(prompt).toContain("实际站位不变，仅镜头反打");
    expect(prompt).toContain("动作发起者 -> 动作承受者/目标物 -> 可见结果");
  });

  it("locks Xiaotu skill character voices and dialogue delivery", () => {
    const template = getTemplate("xiaotu-skill");
    const prompt = buildPrompt(template, {
      sourceText: "林晚舟看向刘婶说：“我想让你们被看见。”刘婶停顿后说：“年轻人嫌麻烦。”",
      mode: "多机位分镜",
      segmentSeconds: "15",
      visualStyle: "影视写实现代",
      audioRule: "保留原文对白和环境声",
    });

    expect(prompt).toContain("内部建立角色音色锁定表");
    expect(prompt).toContain("顶级声优级别");
    expect(prompt).toContain("结果区只写简洁可用表达");
    expect(prompt).toContain("不能让角色来回换声音");
    expect(prompt).toContain("不要输出“对白：”独立行");
    expect(prompt).toContain("台词必须嵌入对应分镜画面句子里，并使用中文双引号“”");
    expect(prompt).not.toContain("对白：角色名（语气，轻/重，缓/急）：台词");
    expect(prompt).toContain("音色一致性校验");
  });

  it("folds the emotion director rules into the Xiaotu skill prompt", () => {
    const template = getTemplate("xiaotu-skill");
    const prompt = buildPrompt(template, {
      sourceText: "林晚舟看着空碗，手指攥紧衣角，声音发抖地说：“我没偷。”",
      mode: "多机位分镜",
      segmentSeconds: "15",
      visualStyle: "影视写实现代",
      audioRule: "保留同期声",
    });

    expect(prompt).toContain("情绪导演2.0增强规则");
    expect(prompt).toContain("触发事件 → 角色感知动作 → 微表情/生理反应 → 肢体动作 → 原文台词及说话语气");
    expect(prompt).toContain("每次明显情绪变化前，必须先出现原剧情能够证明的前置触发原因");
    expect(prompt).toContain("不得凭空产生情绪");
    expect(prompt).toContain("不得新增原文没有的触发事件");
    expect(prompt).toContain("不要输出“触发原因：”");
    expect(prompt).toContain("情绪曲线");
    expect(prompt).toContain("微动作、惯性动作、神经反应、失控反应");
    expect(prompt).toContain("动作四要素");
    expect(prompt).toContain("台词标注维度");
    expect(prompt).toContain("环境反馈必须与动作同步发生");
    expect(prompt).toContain("禁止毫米、厘米、赫兹、精确角度、小数比例");
  });

  it("keeps Xiaotu skill dialogue pronouns natural instead of replacing them with character names", () => {
    const template = getTemplate("xiaotu-skill");
    const prompt = buildPrompt(template, {
      sourceText: "许燃看向宋叔亭说：“你不是宋叔亭的，我会去。”",
      mode: "多机位分镜",
      segmentSeconds: "15",
      visualStyle: "影视写实现代",
      audioRule: "保留原文对白",
    });

    expect(prompt).toContain("台词内容必须逐字保留原文台词和原文代词");
    expect(prompt).toContain("不能改成“许燃不是宋叔亭的”");
    expect(prompt).toContain("不能改成“许燃会去”");
    expect(prompt).toContain("这条只约束画面描述，不约束对白台词");
  });

  it("requires Xiaotu skill dialogue text to match the source exactly", () => {
    const template = getTemplate("xiaotu-skill");
    const prompt = buildPrompt(template, {
      sourceText: "许燃看向宋叔亭说：“你不是宋叔亭的，我会去。”宋叔亭停顿后说：“别再骗我。”",
      mode: "多机位分镜",
      segmentSeconds: "15",
      visualStyle: "影视写实现代",
      audioRule: "保留原文对白",
    });

    expect(prompt).toContain("原文对白必须逐字保留");
    expect(prompt).toContain("不得改写、润色、缩写、合并、扩写或替换台词内容");
    expect(prompt).toContain("只能调整台词所在分镜、说话者动作、语气标注和听话者反应");
    expect(prompt).toContain("最高优先级对白逐字锁定");
    expect(prompt).toContain("原文台词的文字、标点、称呼、代词、语序和重复次数必须完全一致");
    expect(prompt).toContain("合规改写、平台友好表达、节奏优化和口语化处理均不得作用于台词文字");
    expect(prompt).toContain("只能调整非台词画面");
    expect(prompt).not.toContain("只保留必要短对白");
  });

  it("separates Xiaotu skill real spatial positions from temporary screen left and right", () => {
    const template = getTemplate("xiaotu-skill");
    const prompt = buildPrompt(template, {
      sourceText: "许燃站在门外台阶下，宋叔亭站在门内，登记员坐在柜台后方。",
      mode: "多机位分镜",
      segmentSeconds: "15",
      visualStyle: "影视写实现代",
      audioRule: "保留同期声",
    });

    expect(prompt).toContain("画面左/右只允许用于临时构图");
    expect(prompt).toContain("禁止把“画面左侧/画面右侧”当成真实站位依据");
    expect(prompt).toContain("人物真实站位");
    expect(prompt).toContain("不要输出【空间坐标与连续性】标题或表格");
    expect(prompt).toContain("门内/门外");
    expect(prompt).toContain("柜台内/柜台外");
    expect(prompt).toContain("实际站位不变，仅镜头反打");
  });

  it("builds a GPT-image2 director storyboard prompt with image and video sections", () => {
    const template = getTemplate("gpt-image2-storyboard");
    const prompt = buildPrompt(template, {
      sourceText: "夜市摊前，许明舟端出第一碗葱油面，万金宝盯着陶罐。",
      boardCount: "3",
      imageRatio: "21:9",
      visualStyle: "影视写实现代",
      panelLayout: "四宫格2x2",
      imageModel: "gemini-3.1-flash-preview",
      imageResolution: "1K",
    });
    const fields = Object.fromEntries(template.fields.map((field) => [field.key, field]));
    const fieldKeys = template.fields.map((field) => field.key);

    expect(template.name).toBe("GPT-image2 六宫格故事板");
    expect(template.description).toContain("图片提示词");
    expect(fields.visualStyle.options).not.toContain("3D仿真精致角色");
    expect(fields.visualStyle.options).not.toContain("现代甜酷3D乙游");
    expect(prompt).toContain("GPT-image-2");
    expect(prompt).toContain("_::~OUTPUT_START::~_");
    expect(prompt).toContain("_::~FIELD::~_");
    expect(prompt).toContain("_::~RECORD::~_");
    expect(prompt).toContain("_::~OUTPUT_END::~_");
    expect(prompt).toContain("【图片提示词区｜对白已明确标注】");
    expect(prompt).toContain("【视频提示词区】");
    expect(prompt).toContain("短剧导演分镜工作板");
    expect(prompt).toContain("【对白标注】");
    expect(prompt).toContain("参考当前导演分镜图依次帮我生成视频");
    expect(prompt).toContain("6 Cut");
    expect(prompt).toContain("15S");
    expect(prompt).toContain("生成数量：3");
    expect(prompt).toContain("输出3组");
    expect(prompt).toContain("四宫格2x2");
    expect(prompt).toContain("画面比例统一写：按当前项目设定");
    expect(prompt).toContain("图片提示词区不得出现音色参数");
    expect(prompt).toContain("有台词Cut必须使用双引号和@音色参数");
    expect(prompt).not.toContain("即梦Seedance2.0图生视频提示词");
    expect(prompt).not.toContain("Seedance2.0交付包");
    expect(prompt).not.toContain("单镜视频时长");
    expect(prompt).not.toContain("运动强度");
    expect(prompt).not.toContain("连续性锁定");
    expect(prompt).toContain("无水印");
    expect(prompt).toContain("平台审核硬规则");
    expect(prompt).not.toContain("21:9");
    expect(prompt).toContain("影视写实现代");
    expect(fields.boardCount.control).toBe("select");
    expect(fields.boardCount.options).toEqual(["1", "2", "3", "4"]);
    expect(fields.panelLayout.control).toBe("select");
    expect(fields.panelLayout.options).toEqual(["六宫格3x2"]);
    expect(fields.imageModel.control).toBe("select");
    expect(fields.imageModel.options).toContain("gpt-image-2");
    expect(fields.imageModel.options).not.toContain("gpt-image-2-all");
    expect(fields.imageModel.options).toContain("gemini-3.1-flash-preview");
    expect(fields.imageModel.options).toContain("gemini-3.1-flash-lite-image");
    expect(fields.imageResolution.control).toBe("select");
    expect(fields.imageResolution.options).toEqual(["1K", "2K", "4K"]);
    expect(fieldKeys).not.toContain("seedanceDuration");
    expect(fieldKeys).not.toContain("motionStrength");
    expect(fieldKeys).not.toContain("continuityMode");
  });

  it("uses selectable controls for asset extraction type, style, image model, image ratio, and resolution", () => {
    const template = getTemplate("asset-extraction");
    const fields = Object.fromEntries(template.fields.map((field) => [field.key, field]));
    const fieldKeys = template.fields.map((field) => field.key);

    expect(fields.assetType.control).toBe("select");
    expect(fields.assetType.options).toEqual(["人物", "场景", "物品"]);
    expect(fieldKeys).not.toContain("assetTarget");
    expect(fields.visualStyle.control).toBe("select");
    expect(fields.visualStyle.options).toContain("3D国漫风格");
    expect(fields.visualStyle.options).toContain("3D仿真精致角色");
    expect(fields.visualStyle.options).toContain("现代甜酷3D乙游");
    expect(fields.visualStyle.options).toContain("复古欧美原子朋克风格");
    expect(fields.imageModel.control).toBe("select");
    expect(fields.imageModel.options).toContain("gpt-image-2");
    expect(fields.imageModel.options).not.toContain("gpt-image-2-all");
    expect(fields.imageModel.options).toContain("gemini-3.1-flash-preview");
    expect(fields.imageModel.options).toContain("gemini-3.1-flash-lite-image");
    expect(fields.imageModel.options).toContain("gemini-3-pro-image-preview");
    expect(fields.imageModel.options).not.toContain("banana-2");
    expect(fields.imageRatio.control).toBe("select");
    expect(fields.imageRatio.options).toContain("16:9");
    expect(fields.imageRatio.options).toContain("9:16");
    expect(fields.imageRatio.options).toContain("21:9");
    expect(fields.imageResolution.control).toBe("select");
    expect(fields.imageResolution.defaultValue).toBe("1K");
    expect(fields.imageResolution.options).toEqual(["1K", "2K", "4K"]);
    expect(template.body).not.toContain("补全说明");
    expect(template.body).toContain("性别、年龄感");
    expect(template.body).toContain("服装");
    expect(template.body).toContain("像服装设计总监一样");
    expect(template.body).toContain("禁止所有人物默认统一穿西装");
    expect(template.body).toContain("不得撞脸当红网红、明星、艺人、博主");
    expect(template.body).toContain("人物外貌：");
    expect(template.body).toContain("角色等级：");
    expect(template.body).toContain("整体风格：根据画风锚点{{visualStyle}}");
    expect(template.body).toContain("画风附加词必须由画风锚点{{visualStyle}}决定");
    expect(template.body).toContain("{{assetCharacterStyleRule}}");
    expect(template.body).not.toContain("Hyperrealistic photographic 35mm film");
    expect(template.body).not.toContain("NOT 3D");
    expect(template.body).toContain("人物三视图生产参考图");
    expect(template.body).toContain("纯白背景");
    expect(template.body).toContain("上方三分之一为正面脸部近景头像");
    expect(template.body).toContain("下方三分之二严格分成三个等比例竖向面板");
    expect(template.body).toContain("颈部以下到脚部的正面、侧面、背面身体视图");
    expect(template.body).toContain("下方三块不出现头部和五官");
    expect(template.body).toContain("双手自然下垂");
    expect(template.body).toContain("双脚完整可见");
    expect(template.body).toContain("顶部头像与下方三视图必须是同一角色");
    expect(template.body).not.toContain("【Layout】2x2 grid");
    expect(template.body).not.toContain("FULL BODY NECK DOWN, NO FACE");
    expect(template.body).not.toContain("左下格不露脸");
    expect(template.body).not.toContain("必须使用2x2四宫格");
    expect(template.body).toContain("不要字幕、水印、logo、编号或多余文字");
    expect(template.body).toContain("必须达到男女主角、重要反派或核心配角的精美角色标准");
    expect(template.body).toContain("不能是大众脸");
    expect(template.body).toContain("人物的身份：");
    expect(template.body).toContain("图片的结构：");
    expect(template.body).not.toContain("绝对注意事项：");
    expect(template.body).not.toContain("严禁风格跑偏");
    expect(template.body).toContain("场景资产必须是空场景/环境设定");
    expect(template.body).toContain("不得出现人物姓名、人物外貌、人物姿态、人物动作");
    expect(template.body).toContain("只描述空间本身");
    expect(template.body).toContain("当前剧情时间");
    expect(template.body).toContain("同场景四视角设定图");
    expect(template.body).toContain("四个画面都必须展示整体场景");
    expect(template.body).toContain("1.左上：正面全景");
    expect(template.body).toContain("2.右上：侧向全景");
    expect(template.body).toContain("3.左下：俯视全景");
    expect(template.body).toContain("4.右下：反向全景");
    expect(template.body).toContain("不要只拍单个物品");
    expect(template.body).toContain("物品资产必须使用电商纯白色背景强约束");
  });

  it("keeps non-realistic asset character style wording from polluting the image prompt", () => {
    const template = getTemplate("asset-extraction");
    const prompt = buildPrompt(template, {
      sourceText: "林晚站在废弃加油站屋顶，手里握着骨制长矛。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    });
    const assetOutputRules = prompt.slice(prompt.indexOf("按下面格式输出"));

    expect(assetOutputRules).not.toContain("现实主义");
    expect(assetOutputRules).not.toContain("写实主义");
    expect(assetOutputRules).not.toContain("写实质感");
    expect(assetOutputRules).not.toContain("影视写实");
    expect(assetOutputRules).toContain("当前画风锚点不属于真人摄影方向");
  });

  it("adapts the supplied male and female character rules for 3D Guoman assets", () => {
    const template = getTemplate("asset-extraction");
    const prompt = buildPrompt(template, {
      sourceText: "古城议事堂内，女将军沈昭与年迈谋士顾衡并肩查看沙盘。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    });
    const assetOutputRules = prompt.slice(prompt.indexOf("按下面格式输出"));

    expect(assetOutputRules).toContain("整体风格首句必须明确写出“画风锚点：3D国漫风格”");
    expect(assetOutputRules).toContain("次世代高精度建模");
    expect(assetOutputRules).toContain("PBR国风材质");
    expect(assetOutputRules).toContain("鞋履完整包裹双脚");
    expect(assetOutputRules).toContain("男性角色的肩背、腰身、肌肉量和站姿必须服从年龄、身份、职业、时代与剧情");
    expect(assetOutputRules).toContain("男女主角、核心反派和重要配角使用主角级美型标准");
    expect(assetOutputRules).toContain("清雅、飒爽、温婉、冷艳、明艳等气质必须由剧情决定");
    expect(assetOutputRules).toContain("次表面散射");
    expect(assetOutputRules).toContain("PBR织物材质");
    expect(assetOutputRules).toContain("普通成年配角保持协调、自然、有辨识度");
    expect(assetOutputRules).toContain("老人、儿童、病弱者及特殊身份角色");
    expect(assetOutputRules).toContain("不得套用年轻主角体态、华丽服饰或高开衩设计");
    expect(assetOutputRules).toContain("所有明确为成年女性的角色保持：饱满S曲线、窄肩蜂腰、圆润胯部、前凸后翘、修长笔直大长腿");
    expect(assetOutputRules).toContain("服装精美华丽，采用收腰、高开衩、薄纱、刺绣和鎏金材质");
    expect(assetOutputRules).toContain("女性角色长相必须完全区分");
  });

  it("keeps non-3D character assets aligned with the selected style anchor", () => {
    const template = getTemplate("asset-extraction");
    const prompt = buildPrompt(template, {
      sourceText: "雨巷里，沈昭撑伞回头看向顾衡。",
      assetType: "人物",
      visualStyle: "水墨国风动画",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    });
    const assetOutputRules = prompt.slice(prompt.indexOf("按下面格式输出"));

    expect(assetOutputRules).toContain("整体风格首句必须明确写出“画风锚点：水墨国风动画”");
    expect(assetOutputRules).toContain("只能使用水墨国风动画对应的材质、线条、色彩、光影和角色设计语言");
    expect(assetOutputRules).toContain("禁止混入3D建模、PBR材质、真人摄影或影视写实描述");
    expect(assetOutputRules).not.toContain("次表面散射");
    expect(assetOutputRules).not.toContain("PBR织物材质");
  });

  it("allows realistic wording only when the asset style anchor is cinematic realism", () => {
    const template = getTemplate("asset-extraction");
    const prompt = buildPrompt(template, {
      sourceText: "林晚站在废弃加油站屋顶，手里握着骨制长矛。",
      assetType: "人物",
      visualStyle: "影视写实现代",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    });
    const assetOutputRules = prompt.slice(prompt.indexOf("按下面格式输出"));

    expect(assetOutputRules).toContain("当前画风锚点属于影视写实方向");
    expect(assetOutputRules).toContain("影视写实");
  });

  it("does not inject character beauty or rendering rules into scene extraction", () => {
    const template = getTemplate("asset-extraction");
    const prompt = buildPrompt(template, {
      sourceText: "雨夜古城的石桥与河岸灯笼。",
      assetType: "场景",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    });

    expect(prompt).not.toContain("男女主角、核心反派和重要配角使用主角级美型标准");
    expect(prompt).not.toContain("次表面散射");
    expect(prompt).not.toContain("PBR织物材质");
  });
});
