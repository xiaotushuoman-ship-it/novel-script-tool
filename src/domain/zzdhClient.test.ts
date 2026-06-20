import { describe, expect, it, vi } from "vitest";
import { parseStoryboardPanels, sendAssetsToZzdh, sendStoryboardToZzdh } from "./zzdhClient";

describe("zzdhClient", () => {
  it("creates extracted assets in ZZDH character location and item managers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entities: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entities: [{ name: "旧码头夜市", location_id: "loc-old" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entities: [] }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, entity_id: "new-id" }),
      });

    const result = await sendAssetsToZzdh(
      [
        { name: "林晚舟", type: "人物", description: "白衬衫，短发，神情警觉。" },
        { name: "旧码头夜市", type: "场景", description: "雨后霓虹夜市。" },
        { name: "红木菜箱", type: "物品", description: "旧红木箱，铜锁。" },
      ],
      fetchMock as unknown as typeof fetch,
    );

    const toolBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    expect(toolBodies.filter((body) => body.name === "zzdh_get_entity_list")).toHaveLength(3);
    const createBodies = toolBodies.filter((body) => body.name === "zzdh_create_entity");
    expect(createBodies).toHaveLength(2);
    expect(createBodies[0]).toMatchObject({
      name: "zzdh_create_entity",
      arguments: {
        entity_type: "character",
        name: "林晚舟",
        description: "白衬衫，短发，神情警觉。",
        auto_show: true,
      },
    });
    expect(createBodies[1]).toMatchObject({
      name: "zzdh_create_entity",
      arguments: {
        entity_type: "item",
        name: "红木菜箱",
      },
    });
    expect(result.created).toHaveLength(2);
    expect(result.skippedExisting).toHaveLength(1);
  });

  it("sends storyboard units as separate ZZDH video prompt panels", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ panels: [{ unique_name: "panel_001" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unique_name: "panel_002" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

    await sendStoryboardToZzdh(
      "test project",
      ["Segment 1 15S: market opening", "shot 1 opening", "", "Segment 2 15S: conflict", "shot 1 reaction"].join("\n"),
      fetchMock as unknown as typeof fetch,
    );

    const toolBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    const createBody = toolBodies[0];
    expect(createBody.name).toBe("zzdh_create_and_open_project");
    expect(createBody.arguments.type).toBe("paperwork");
    expect(createBody.arguments.name).toContain("test project");
    expect(createBody.arguments.content).toContain("Segment 1 15S: market opening");
    expect(createBody.arguments.panels).toHaveLength(1);
    expect(createBody.arguments.panels[0].prompt).toBe("");
    expect(createBody.arguments.panels[0].video_prompt).toBe("");

    expect(toolBodies[1]).toMatchObject({
      name: "zzdh_switch_media_mode",
      arguments: { mode: "video" },
    });

    const addPanelBody = toolBodies.find((body) => body.name === "zzdh_add_panel");
    expect(addPanelBody?.arguments.after_unique_name).toBe("panel_001");

    const toolNames = toolBodies.map((body) => body.name);
    expect(toolNames).not.toContain("zzdh_update_prompt");

    const updatePaperworkBodies = toolBodies.filter((body) => body.name === "zzdh_update_paperwork");
    expect(updatePaperworkBodies).toHaveLength(2);
    expect(updatePaperworkBodies[0].arguments.unique_name).toBe("panel_001");
    expect(updatePaperworkBodies[0].arguments.paperwork).toContain("shot 1 opening");
    expect(updatePaperworkBodies[1].arguments.unique_name).toBe("panel_002");
    expect(updatePaperworkBodies[1].arguments.paperwork).toContain("shot 1 reaction");

    const switchModeBodies = toolBodies.filter((body) => body.name === "zzdh_switch_prompt_mode");
    expect(switchModeBodies).toHaveLength(2);
    expect(switchModeBodies.every((body) => body.arguments.is_video === true)).toBe(true);

    const updateVideoPromptBodies = toolBodies.filter((body) => body.name === "zzdh_update_video_prompt");
    expect(updateVideoPromptBodies).toHaveLength(2);
    expect(updateVideoPromptBodies[0].arguments.unique_name).toBe("panel_001");
    expect(updateVideoPromptBodies[0].arguments.video_prompt).toContain("shot 1 opening");
    expect(updateVideoPromptBodies[1].arguments.unique_name).toBe("panel_002");
    expect(updateVideoPromptBodies[1].arguments.video_prompt).toContain("shot 1 reaction");
  });

  it("parses multiple 15s segment headings into separate panels", () => {
    const panels = parseStoryboardPanels(
      [
        "Segment 1 15S: market opening",
        "shot 1 opening",
        "shot 2 conflict",
        "",
        "Segment 2 15S: reaction beat",
        "shot 1 reaction",
      ].join("\n"),
    );

    expect(panels).toHaveLength(2);
    expect(panels[0].paperwork).toContain("shot 1 opening");
    expect(panels[1].paperwork).toContain("shot 1 reaction");
  });

  it("parses xiaotu skill segment headings into separate ZZDH panels", () => {
    const panels = parseStoryboardPanels(
      [
        "【段落1｜15秒｜多机位分镜】",
        "【基础设定】角色：许明舟，站在夜市摊前。",
        "【画面内容】[0-4s] 许明舟抬头看向来人。",
        "",
        "【段落2｜12秒｜一镜到底】",
        "【基础设定】角色：许明舟、万金宝，夜市摊前对峙。",
        "【画面内容】[0-5s] 万金宝把账单拍在桌上。",
      ].join("\n"),
    );

    expect(panels).toHaveLength(2);
    expect(panels[0].paperwork).toContain("许明舟抬头看向来人");
    expect(panels[1].paperwork).toContain("万金宝把账单拍在桌上");
  });

  it("parses Chinese 15S unit headings into ordered ZZDH panels", () => {
    const panels = parseStoryboardPanels(
      [
        "15S段落单元1：摊前开场",
        "【视觉基调】现实短剧",
        "分镜1 开场（0-4s）：林晚舟站在摊前。",
        "",
        "15S段落单元2：摊主质疑",
        "分镜1 对峙（0-5s）：刘婶看向林晚舟。",
        "",
        "15S段落单元3：提出方案",
        "分镜1 推进（0-5s）：林晚舟拿起手机。",
        "",
        "15S段落单元4：情绪转折",
        "分镜1 反应（0-5s）：老赵沉默。",
        "",
        "15S段落单元5：落点悬念",
        "分镜1 收束（0-5s）：众人看向镜头。",
      ].join("\n"),
    );

    expect(panels).toHaveLength(5);
    expect(panels.map((panel) => panel.paperwork.split("\n")[0])).toEqual([
      "15S段落单元1：摊前开场",
      "15S段落单元2：摊主质疑",
      "15S段落单元3：提出方案",
      "15S段落单元4：情绪转折",
      "15S段落单元5：落点悬念",
    ]);
    expect(panels[1].paperwork).toContain("刘婶看向林晚舟");
    expect(panels[0].video_prompt).toContain("林晚舟站在摊前");
    expect(panels[4].video_prompt).toContain("众人看向镜头");
  });

  it("adds one ZZDH panel for each Chinese 15S unit after the first panel", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ panels: [{ unique_name: "panel_001" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unique_name: "panel_002" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unique_name: "panel_003" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

    await sendStoryboardToZzdh(
      "中文分镜测试",
      [
        "15S段落单元1：摊前开场",
        "分镜1：林晚舟站在摊前。",
        "",
        "15S段落单元2：摊主质疑",
        "分镜1：刘婶质疑。",
        "",
        "15S段落单元3：老赵回应",
        "分镜1：老赵把锅盖轻轻放下。",
      ].join("\n"),
      fetchMock as unknown as typeof fetch,
    );

    const toolBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    expect(toolBodies.filter((body) => body.name === "zzdh_add_panel")).toHaveLength(2);

    const updateVideoPromptBodies = toolBodies.filter((body) => body.name === "zzdh_update_video_prompt");
    expect(updateVideoPromptBodies).toHaveLength(3);
    expect(updateVideoPromptBodies[0].arguments.video_prompt).toContain("林晚舟站在摊前");
    expect(updateVideoPromptBodies[1].arguments.video_prompt).toContain("刘婶质疑");
    expect(updateVideoPromptBodies[2].arguments.video_prompt).toContain("老赵把锅盖轻轻放下");

    const updatePaperworkBodies = toolBodies.filter((body) => body.name === "zzdh_update_paperwork");
    expect(updatePaperworkBodies).toHaveLength(3);
    expect(updatePaperworkBodies[0].arguments.paperwork).toContain("林晚舟站在摊前");
    expect(updatePaperworkBodies[1].arguments.paperwork).toContain("刘婶质疑");
    expect(updatePaperworkBodies[2].arguments.paperwork).toContain("老赵把锅盖轻轻放下");
  });

  it("keeps ZZDH paperwork aligned with the same storyboard unit as the video prompt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ panels: [{ unique_name: "panel_001" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unique_name: "panel_002" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unique_name: "panel_003" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, unique_name: "panel_004" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

    await sendStoryboardToZzdh(
      "文案提示词同源测试",
      [
        "15S段落单元1：开场",
        "分镜1：林晚舟站在摊前。",
        "",
        "15S段落单元2：质疑",
        "分镜1：刘婶质疑。",
        "",
        "15S段落单元3：老赵回应",
        "分镜1：老赵敲锅盖。",
        "",
        "15S段落单元4：新任务弹出",
        "分镜1：手机提示音响起，新任务弹出。",
      ].join("\n"),
      fetchMock as unknown as typeof fetch,
    );

    const toolBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    const updatePaperworkBodies = toolBodies.filter((body) => body.name === "zzdh_update_paperwork");
    const updateVideoPromptBodies = toolBodies.filter((body) => body.name === "zzdh_update_video_prompt");
    expect(updatePaperworkBodies).toHaveLength(4);
    expect(updateVideoPromptBodies).toHaveLength(4);
    expect(updatePaperworkBodies[0].arguments.paperwork).toContain("林晚舟站在摊前");
    expect(updateVideoPromptBodies[0].arguments.video_prompt).toContain("林晚舟站在摊前");
    expect(updatePaperworkBodies[2].arguments.paperwork).toContain("老赵敲锅盖");
    expect(updateVideoPromptBodies[2].arguments.video_prompt).toContain("老赵敲锅盖");
    expect(updatePaperworkBodies[3].arguments.paperwork).toContain("新任务弹出");
    expect(updateVideoPromptBodies[3].arguments.video_prompt).toContain("新任务弹出");
    expect(updatePaperworkBodies[3].arguments.paperwork).not.toContain("老赵敲锅盖");
  });

  it("deletes extra panels created by ZZDH auto splitting before updating storyboard units", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          panels: [
            { unique_name: "panel_001" },
            { unique_name: "panel_002" },
            { unique_name: "extra_003" },
          ],
        }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

    await sendStoryboardToZzdh(
      "删除多余分镜测试",
      [
        "15S段落单元1：开场",
        "分镜1：林晚舟站在摊前。",
        "",
        "15S段落单元2：质疑",
        "分镜1：刘婶质疑。",
      ].join("\n"),
      fetchMock as unknown as typeof fetch,
    );

    const toolBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    const deletePanelBodies = toolBodies.filter((body) => body.name === "zzdh_delete_panel");
    expect(deletePanelBodies).toHaveLength(1);
    expect(deletePanelBodies[0].arguments.unique_name).toBe("extra_003");

    const updateVideoPromptBodies = toolBodies.filter((body) => body.name === "zzdh_update_video_prompt");
    expect(updateVideoPromptBodies).toHaveLength(2);
    expect(updateVideoPromptBodies[0].arguments.unique_name).toBe("panel_001");
    expect(updateVideoPromptBodies[1].arguments.unique_name).toBe("panel_002");
  });

  it("keeps shots inside the same 15s unit as one ZZDH video prompt panel", () => {
    const panels = parseStoryboardPanels(
      [
        "Segment 1 15S: market opening",
        "shot 1 opening",
        "shot 2 conflict",
        "shot 3 ending beat",
      ].join("\n"),
    );

    expect(panels).toHaveLength(1);
    expect(panels[0].video_prompt).toContain("shot 1 opening");
    expect(panels[0].video_prompt).toContain("shot 2 conflict");
    expect(panels[0].video_prompt).toContain("shot 3 ending beat");
  });

});
