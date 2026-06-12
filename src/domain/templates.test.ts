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
    expect(() => buildPrompt(template, { sourceScene: "" })).toThrow("请填写：小说原文或场景");
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
    expect(prompt).toContain("夜市摊前");
    expect(prompt).not.toContain("_::~OUTPUT_START::~_");
    expect(prompt).not.toContain("_::~FIELD::~_");
    expect(prompt).toContain("【视觉基调】");
    expect(prompt).toContain("【色彩与影调】");
    expect(prompt).toContain("【主体和空间关系】");
    expect(prompt).toContain("分镜1");
    expect(prompt).toContain("对白：角色名：台词");
    expect(prompt).toContain("不要把台词揉进动作描述里");
    expect(prompt).toContain("对白：刘婶：年轻人嫌麻烦！");
    expect(prompt).toContain("对白：老赵：小摊，没啥好拍！");
    expect(prompt).toContain("每一个15S段落都是一个独立可生成的视频提示词单元");
    expect(prompt).toContain("只允许使用该段剧情实际出现的人物、场景、物品");
    expect(prompt).toContain("不要把全文所有出场人物、所有场景、所有物品资产塞进每一段");
    expect(prompt).toContain("禁止每段都用闪白、黑场、强转场、硬切转场来衔接");
    expect(prompt).toContain("情绪导演增强");
    expect(prompt).toContain("可拍摄的生理反应");
    expect(prompt).toContain("听者反应");
    expect(prompt).toContain("不要只写“悲伤/愤怒/心动/紧张/释然”");
    expect(prompt).toContain("15S容量控制");
    expect(prompt).toContain("每个15S段落优先使用3-4个分镜");
    expect(prompt).toContain("对白总量最多2句");
    expect(prompt).toContain("如果当前剧情必须超过5个分镜，必须拆成下一个15S段落单元");
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

  it("builds a GPT-image2 four-panel storyboard prompt for one image", () => {
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

    expect(template.name).toBe("GPT-image2 四宫格故事板（暂不可用）");
    expect(template.description).toContain("一张图");
    expect(prompt).toContain("GPT-image-2");
    expect(prompt).toContain("一张图");
    expect(prompt).toContain("四个画面");
    expect(prompt).toContain("15S");
    expect(prompt).toContain("生成数量：3");
    expect(prompt).toContain("输出3组");
    expect(prompt).toContain("四宫格2x2");
    expect(prompt).toContain("标杆视频分析");
    expect(prompt).toContain("至少准备三类素材");
    expect(prompt).toContain("服装类素材");
    expect(prompt).toContain("GPT-image2四宫格单图提示词");
    expect(prompt).toContain("画面1");
    expect(prompt).toContain("画面2");
    expect(prompt).toContain("画面3");
    expect(prompt).toContain("画面4");
    expect(prompt).toContain("GPT-image-2出图提示词");
    expect(prompt).not.toContain("即梦Seedance2.0图生视频提示词");
    expect(prompt).not.toContain("Seedance2.0交付包");
    expect(prompt).not.toContain("单镜视频时长");
    expect(prompt).not.toContain("运动强度");
    expect(prompt).not.toContain("连续性锁定");
    expect(prompt).toContain("不要字幕、水印、logo");
    expect(prompt).toContain("平台审核硬规则");
    expect(prompt).toContain("21:9");
    expect(prompt).toContain("影视写实现代");
    expect(fields.boardCount.control).toBe("select");
    expect(fields.boardCount.options).toEqual(["1", "2", "3", "4"]);
    expect(fields.panelLayout.control).toBe("select");
    expect(fields.panelLayout.options).toContain("四宫格2x2");
    expect(fields.panelLayout.options).toContain("六宫格3x2");
    expect(fields.panelLayout.options).toContain("九宫格3x3");
    expect(fields.imageModel.control).toBe("select");
    expect(fields.imageModel.options).toContain("gpt-image-2");
    expect(fields.imageModel.options).toContain("gpt-image-2-all");
    expect(fields.imageModel.options).toContain("gemini-3.1-flash-preview");
    expect(fields.imageResolution.control).toBe("select");
    expect(fields.imageResolution.options).toEqual(["1K", "2K"]);
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
    expect(fields.imageResolution.options).toEqual(["1K", "2K"]);
    expect(template.body).not.toContain("补全说明");
    expect(template.body).toContain("性别、年龄感");
    expect(template.body).toContain("服装");
    expect(template.body).toContain("人物外貌：");
    expect(template.body).toContain("整体风格：");
    expect(template.body).toContain("人物的身份：");
    expect(template.body).toContain("图片的结构：");
    expect(template.body).toContain("绝对注意事项：");
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
