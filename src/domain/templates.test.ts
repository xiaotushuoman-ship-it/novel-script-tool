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
    expect(prompt).toContain("95分");
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
    expect(template.description).toBe("把小说原文改成竖屏短剧脚本。");
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
    expect(fields.visualStyle.options).toContain("复古欧美原子朋克风格");
    expect(fieldKeys).not.toContain("previousEnding");
    expect(fieldKeys).not.toContain("nextOpening");
    expect(fieldKeys).not.toContain("characterAssets");
    expect(fieldKeys).not.toContain("sceneAssets");
    expect(fieldKeys).not.toContain("propAssets");
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
    expect(prompt).toContain("时间戳必须按故事动作、对白长度、情绪停顿和镜头复杂度自由划分");
    expect(prompt).toContain("不要默认0-3s、3-6s、6-9s");
    expect(prompt).toContain("实际输出必须根据当前剧情自由增减分镜数量、分镜标题和时间戳");
    expect(prompt).toContain("参考图统一写成“角色名：{@图1}角色描述”");
    expect(prompt).toContain("【基础设定】");
    expect(prompt).toContain("角色名：{@图1}外貌/状态/手持道具/站位。");
    expect(prompt).toContain("声音：保留环境声和原文对白。");
    expect(prompt).toContain("分镜1丨分镜标题丨0-2.5s丨");
    expect(prompt).toContain("不要输出[0-3s]这种方括号时间码");
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
    expect(fields.imageModel.options).toContain("gpt-image-2-all");
    expect(fields.imageModel.options).toContain("gemini-3.1-flash-preview");
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
    expect(fields.visualStyle.options).toContain("复古欧美原子朋克风格");
    expect(fields.imageModel.control).toBe("select");
    expect(fields.imageModel.options).toContain("gpt-image-2");
    expect(fields.imageModel.options).toContain("gpt-image-2-all");
    expect(fields.imageModel.options).toContain("gemini-3.1-flash-preview");
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
    expect(template.body).toContain("人物外貌：");
    expect(template.body).toContain("整体风格：根据画风锚点{{visualStyle}}");
    expect(template.body).toContain("不要固定套用真人质感");
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
});
