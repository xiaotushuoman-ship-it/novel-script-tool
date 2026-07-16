import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState } from "react";
import { createProject } from "../domain/projects";
import { Workspace } from "./Workspace";
import { within } from "@testing-library/react";

const callAiMock = vi.fn();
const callAiStreamMock = vi.fn();
const callImageGenerationMock = vi.fn();
const sendStoryboardToZzdhMock = vi.fn();
const sendAssetsToZzdhMock = vi.fn();
const uploadAistarsLabMaterialMock = vi.fn();
const createAistarsLabVideoTaskMock = vi.fn();
const fetchAistarsLabVideoTaskMock = vi.fn();
const { readImportedDocumentMock } = vi.hoisted(() => ({
  readImportedDocumentMock: vi.fn(),
}));

function mockStreamTextOnce(text: string) {
  callAiStreamMock.mockImplementationOnce(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
    onChunk(text);
    return text;
  });
}

vi.mock("../domain/aiClient", async () => {
  const actual = await vi.importActual<typeof import("../domain/aiClient")>("../domain/aiClient");
  return {
    ...actual,
    callAi: (...args: unknown[]) => callAiMock(...args),
    callAiStream: (...args: unknown[]) => callAiStreamMock(...args),
    callImageGeneration: (...args: unknown[]) => callImageGenerationMock(...args),
  };
});

vi.mock("../domain/zzdhClient", () => ({
  sendStoryboardToZzdh: (...args: unknown[]) => sendStoryboardToZzdhMock(...args),
  sendAssetsToZzdh: (...args: unknown[]) => sendAssetsToZzdhMock(...args),
}));

vi.mock("../domain/documentImport", () => ({
  readImportedDocument: (...args: unknown[]) => readImportedDocumentMock(...args),
}));

vi.mock("./DirectorDeskStep", () => ({
  DirectorDeskStep: () => <section aria-label="3D导演台">3D导演台</section>,
}));

vi.mock("../domain/aistarslabVideo", async () => {
  const actual = await vi.importActual<typeof import("../domain/aistarslabVideo")>("../domain/aistarslabVideo");
  return {
    ...actual,
    createAistarsLabVideoTask: (...args: unknown[]) => createAistarsLabVideoTaskMock(...args),
    fetchAistarsLabVideoTask: (...args: unknown[]) => fetchAistarsLabVideoTaskMock(...args),
    uploadAistarsLabMaterial: (...args: unknown[]) => uploadAistarsLabMaterialMock(...args),
  };
});

beforeEach(() => {
  readImportedDocumentMock.mockImplementation(
    (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Workspace progress", () => {
  it("renders the embedded 3D director desk for step 11", () => {
    const project = createProject("3D导演台工作区测试");
    project.currentStep = "director-desk";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByLabelText("3D导演台")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调用 AI 生成" })).not.toBeInTheDocument();
  });

  it("blocks AI generation when required fields are missing", () => {
    const project = createProject("必填校验测试");

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    expect(callAiMock).not.toHaveBeenCalled();
    expect(screen.getByText("请先填写：故事大纲")).toBeInTheDocument();
  });

  it("shows a generation progress bar while AI is running", async () => {
    vi.useFakeTimers();
    callAiStreamMock.mockReturnValue(new Promise(() => {}));
    const project = createProject("进度测试");
    project.steps["outline-expansion"].inputs.outline = "主角被赶出家门。";

    render(
      <Workspace
        aiSettings={{
          endpoint: "https://timeai.chat/v1",
          apiKey: "sk-test",
          model: "gpt-5.5",
          geminiImageEndpoint: "https://gemini.example/v1",
          geminiImageApiKey: "sk-gemini",
          geminiImageModel: "gemini-3.1-flash-preview",
        }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /调用 AI 生成/ }));

    const currentProgress = screen.getByLabelText("当前步骤生成进度");
    expect(within(currentProgress).getByText("生成进度")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(within(currentProgress).getByText("等待模型生成")).toBeInTheDocument();
    const firstProgress = Number(within(currentProgress).getByRole("progressbar").getAttribute("aria-valuenow"));

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    const laterProgress = Number(within(currentProgress).getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(firstProgress).toBeGreaterThanOrEqual(65);
    expect(laterProgress).toBeGreaterThan(firstProgress);
    expect(laterProgress).toBeGreaterThan(65);
  });

  it("lets different workflow steps generate at the same time without blocking each other", async () => {
    callAiStreamMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(new Promise(() => {}));
    const project = createProject("并发步骤测试");
    project.steps["outline-expansion"].inputs.outline = "主角被赶出家门。";
    project.steps["chapter-split"].inputs.storySetting = "主角在夜市重新开局。";
    const onProjectChange = vi.fn();
    const sharedProps = {
      aiSettings: {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      onAiSettingsChange: () => undefined,
      onProjectChange,
      onSaveVersion: () => undefined,
    };
    const { rerender } = render(<Workspace {...sharedProps} project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));
    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "生成中" })).toBeDisabled();

    const chapterProject = {
      ...project,
      currentStep: "chapter-split" as const,
    };
    rerender(<Workspace {...sharedProps} project={chapterProject} />);

    const chapterGenerateButton = screen.getByRole("button", { name: "调用 AI 生成" });
    expect(chapterGenerateButton).not.toBeDisabled();
    fireEvent.click(chapterGenerateButton);

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(2));
  });

  it("shows a background task center for concurrent step generations", async () => {
    callAiStreamMock.mockClear();
    callAiStreamMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(new Promise(() => {}));
    const project = createProject("后台任务中心测试");
    project.steps["outline-expansion"].inputs.outline = "主角被赶出家门。";
    project.steps["chapter-split"].inputs.storySetting = "主角在夜市重新开局。";
    const sharedProps = {
      aiSettings: {
        endpoint: "https://timeai.chat/v1",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      onAiSettingsChange: () => undefined,
      onProjectChange: () => undefined,
      onSaveVersion: () => undefined,
    };
    const { rerender } = render(<Workspace {...sharedProps} project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));
    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));

    rerender(<Workspace {...sharedProps} project={{ ...project, currentStep: "chapter-split" }} />);
    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));
    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(2));

    const taskCenter = screen.getByLabelText("后台任务中心");
    expect(within(taskCenter).getByText("后台任务中心")).toBeInTheDocument();
    expect(within(taskCenter).getByText("一键小说正文生成")).toBeInTheDocument();
    expect(within(taskCenter).getByText("章节拆分")).toBeInTheDocument();
    expect(within(taskCenter).getAllByText("运行中")).toHaveLength(2);
  });

  it("streams normal text generation into the result area before the request finishes", async () => {
    let finishStream: ((value: string) => void) | undefined;
    callAiStreamMock.mockImplementation(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
      onChunk("第一段实时出现。");
      await new Promise<string>((resolve) => {
        finishStream = resolve;
      });
      onChunk("第二段继续补上。");
      return "第一段实时出现。第二段继续补上。";
    });
    const project = createProject("流式正文测试");
    project.steps["outline-expansion"].inputs.outline = "主角被赶出家门。";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenCalledWith(project.id, "outline-expansion", "第一段实时出现。"),
    );
    expect(screen.getByRole("button", { name: "生成中" })).toBeDisabled();

    await act(async () => {
      finishStream?.("done");
    });

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "outline-expansion",
        "第一段实时出现。第二段继续补上。",
      ),
    );
  });

  it("builds one-click novel prompts from the latest outline typed before clicking generate", async () => {
    callAiStreamMock.mockImplementationOnce(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
      onChunk("第1章：旧宅门前\n林清禾握紧木匣。");
      return "第1章：旧宅门前\n林清禾握紧木匣。";
    });
    const project = createProject("最新大纲生成测试");
    project.steps["outline-expansion"].inputs.outline = "旧大纲：夜市摊主逆袭。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("旧大纲：夜市摊主逆袭。"), {
      target: { value: "新大纲：林清禾回村守住父亲留下的旧宅和木雕招牌。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    const prompt = callAiStreamMock.mock.calls[0][1] as string;
    expect(prompt).toContain("新大纲：林清禾回村守住父亲留下的旧宅和木雕招牌。");
    expect(prompt).not.toContain("旧大纲：夜市摊主逆袭。");
  });

  it("streams asset extraction results into the result area before the request finishes", async () => {
    let finishStream: ((value: string) => void) | undefined;
    callAiStreamMock.mockImplementation(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
      onChunk("【人物】林晚：夜市摊主，");
      await new Promise<string>((resolve) => {
        finishStream = resolve;
      });
      onChunk("服装带有市井烟火细节。");
      return "【人物】林晚：夜市摊主，服装带有市井烟火细节。";
    });
    const project = createProject("资产提取流式测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].inputs.sourceText = "林晚在夜市摊前端起第一碗面。";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenCalledWith(project.id, "asset-extraction", "【人物】林晚：夜市摊主，"),
    );
    expect(screen.getByRole("button", { name: "生成中" })).toBeDisabled();

    await act(async () => {
      finishStream?.("done");
    });

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "asset-extraction",
        "【人物】林晚：夜市摊主，服装带有市井烟火细节。",
      ),
    );
  });

  it("streams one-click script polish results into the result area before the request finishes", async () => {
    let finishStream: ((value: string) => void) | undefined;
    callAiStreamMock.mockImplementation(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
      onChunk("【制作规格】\n总时长：30分钟\n");
      await new Promise<string>((resolve) => {
        finishStream = resolve;
      });
      onChunk("预计总集数：15集\n【成品短剧剧本】\n【第1集】女主当众拿出证据反击。");
      return "【制作规格】\n总时长：30分钟\n预计总集数：15集\n【成品短剧剧本】\n【第1集】女主当众拿出证据反击。";
    });
    const project = createProject("洗稿流式测试");
    project.currentStep = "script-polish";
    project.steps["script-polish"].inputs.sourceText = "女主被全家看不起，拿到证据后当众反击。";
    project.steps["script-polish"].inputs.targetLength = "自定义章数";
    project.steps["script-polish"].inputs.extraRequirement = "只生成1章，台词口语化。";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenCalledWith(project.id, "script-polish", "【制作规格】\n总时长：30分钟"),
    );
    expect(screen.getByPlaceholderText("把 AI 输出粘贴到这里，或点击“调用 AI 生成”。确认后点击“保存结果”。")).toHaveValue(
      "【制作规格】\n总时长：30分钟",
    );
    expect(screen.getByRole("button", { name: "生成中" })).toBeDisabled();

    await act(async () => {
      finishStream?.("done");
    });

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "script-polish",
        "【制作规格】\n总时长：30分钟\n预计总集数：15集\n【成品短剧剧本】\n【第1集】女主当众拿出证据反击。",
      ),
    );
    expect(screen.getByPlaceholderText("把 AI 输出粘贴到这里，或点击“调用 AI 生成”。确认后点击“保存结果”。")).toHaveValue(
      "【制作规格】\n总时长：30分钟\n预计总集数：15集\n【成品短剧剧本】\n【第1集】女主当众拿出证据反击。",
    );
  });

  it("generates script polish chapters in complete-content batches instead of degrading into outlines", async () => {
    mockStreamTextOnce(["【制作规格】", "【成品短剧剧本】", "【第1集】完整场次一。", "【第2集】完整场次二。", "【第3集】完整场次三。"].join("\n"));
    mockStreamTextOnce(["【第4集】完整场次四。", "【第5集】完整场次五。", "【第6集】完整场次六。"].join("\n"));
    mockStreamTextOnce(["【第7集】完整场次七。", "【第8集】完整场次八。", "【第9集】完整场次九。"].join("\n"));
    mockStreamTextOnce("【第10集】完整场次十，主线收束。");
    const project = createProject("洗稿完整剧本分批测试");
    project.currentStep = "script-polish";
    project.steps["script-polish"].inputs = {
      ...project.steps["script-polish"].inputs,
      sourceText: "女主拿到关键证据后开始反击。",
      outputForm: "短剧剧本",
      targetLength: "10章",
      chapterWords: "2000字左右",
      endingMode: "完结",
    };
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(4));
    expect(callAiStreamMock.mock.calls[0][1]).toContain("本次只输出第1章到第3章的完整短剧剧本");
    expect(callAiStreamMock.mock.calls[1][1]).toContain("从第4章继续写到第6章");
    expect(callAiStreamMock.mock.calls[1][1]).toContain("不得输出分集大纲、分章大纲、章节摘要或剧情概述");
    expect(callAiStreamMock.mock.calls[3][1]).toContain("从第10章继续写到第10章");
    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "script-polish",
        expect.stringContaining("【第10集】完整场次十，主线收束。"),
      ),
    );
  });

  it("rewrites a script polish batch when the model returns an outline instead of complete chapters", async () => {
    mockStreamTextOnce(["【制作规格】", "【成品短剧剧本】", "【第1集】完整场次一。", "【第2集】完整场次二。", "【第3集】完整场次三。"].join("\n"));
    mockStreamTextOnce(["【分集大纲】", "【第4集】本集发生冲突。", "【第5集】主角寻找证据。", "【第6集】反派受到反击。"].join("\n"));
    mockStreamTextOnce(["【第4集】完整场次四。", "【第5集】完整场次五。", "【第6集】完整场次六。"].join("\n"));
    const project = createProject("洗稿大纲自动重写测试");
    project.currentStep = "script-polish";
    project.steps["script-polish"].inputs = {
      ...project.steps["script-polish"].inputs,
      sourceText: "女主拿到关键证据后开始反击。",
      outputForm: "短剧剧本",
      targetLength: "自定义章数",
      chapterWords: "2000字左右",
      endingMode: "完结",
      extraRequirement: "只生成6章。",
    };
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(3));
    expect(callAiStreamMock.mock.calls[2][1]).toContain("上一版错误地输出了大纲、摘要或缺少本批章节");
    await waitFor(() => {
      const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
      expect(finalDraft).toContain("【第6集】完整场次六。");
      expect(finalDraft).not.toContain("【分集大纲】");
    });
  });

  it("continues chapter split generation until the requested total chapters are present", async () => {
    mockStreamTextOnce(["第1章：开局。", "第2章：夜市。", "第3章：追兵。", "第4章：反击。", "第5章：线索。"].join("\n"));
    mockStreamTextOnce(["第6章：暗巷。", "第7章：旧友。", "第8章：码头。"].join("\n"));
    const project = createProject("章节补齐测试");
    project.currentStep = "chapter-split";
    project.steps["chapter-split"].inputs.storySetting = "夜市逆袭故事。";
    project.steps["chapter-split"].inputs.totalChapters = "8";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(2));
    expect(callAiStreamMock.mock.calls[1][1]).toContain("继续补齐章节拆分");
    expect(callAiStreamMock.mock.calls[1][1]).toContain("从第6章继续输出到第8章");
    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "chapter-split",
        expect.stringContaining("第8章：码头。"),
      ),
    );
  });

  it("streams Xiaotu skill output from one model request without auto continuation", async () => {
    mockStreamTextOnce(
      [
        "【段落1｜15秒｜多机位分镜】",
        "【基础设定】许燃站在客厅门口。",
        "【画面内容】分镜1丨对峙丨0-15s丨许燃看向宋叔亭。",
      ].join("\n"),
    );
    const project = createProject("小兔skill补齐测试");
    project.currentStep = "xiaotu-skill";
    const denseBeat =
      "许燃站在客厅门口，右手握着手机边缘，视线压在宋叔亭脸上，宋叔亭站在茶几旁，桌上杯子轻响，窗外雨声很密，许燃先看向门口又看回宋叔亭，宋叔亭压低声音追问，许燃没有立刻回答，只把手机慢慢扣到掌心，客厅顶灯闪了一下，走廊传来电梯提示音。";
    project.steps["xiaotu-skill"].inputs.sourceText = [
      `第1场：${denseBeat}`,
      `第2场：${denseBeat}`,
      `第3场：${denseBeat}`,
    ].join("\n");
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    expect(callAiStreamMock.mock.calls[0][1]).not.toContain("继续补齐小兔skill视频提示词");
    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "xiaotu-skill",
        expect.stringContaining("【基础设定】许燃站在客厅门口。"),
      ),
    );
    const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(finalDraft).not.toContain("【段落1｜15秒｜多机位分镜】");
  });

  it("does not force Xiaotu skill continuation when numbered beats fit in one 15-second segment", async () => {
    mockStreamTextOnce(
      [
        "【段落1｜15秒｜多机位分镜】",
        "【基础设定】许燃站在客厅门口，宋叔亭站在茶几旁。",
        "【画面内容】分镜1丨短促对峙丨0-15s丨许燃看向宋叔亭，宋叔亭压低声音追问，许燃沉默后移开视线。",
      ].join("\n"),
    );
    const project = createProject("小兔skill短剧情不强拆测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].inputs.sourceText = [
      "第1场：许燃站在客厅门口，看向宋叔亭。",
      "第2场：宋叔亭站在茶几旁，压低声音追问。",
    ].join("\n");
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    expect(callAiStreamMock.mock.calls[0][1]).toContain("第2场");
  });

  it("pre-splits a long Xiaotu script and keeps sequential segment numbers across streamed batches", async () => {
    callAiStreamMock.mockImplementation(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
      const result = [
        "剧情1：",
        "许燃：站在客厅门口。",
        "【氛围与画质】甲组画质。",
        "【声音】保留同期声。",
        "【画面内容】分镜1丨推进丨0-15s丨许燃推进当前剧情。",
        "不要出现字幕，不要BGM",
        "剧情2：",
        "宋叔亭：站在茶几旁。",
        "【氛围与画质】乙组画质。",
        "【声音】保留同期声。",
        "【画面内容】分镜1丨回应丨0-15s丨宋叔亭回应当前剧情。",
        "不要出现字幕，不要BGM",
      ].join("\n");
      onChunk(result);
      return result;
    });
    const project = createProject("小兔skill长剧本预拆批次测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].inputs.sourceText = Array.from(
      { length: 8 },
      (_, index) => `第${index + 1}场：许燃和宋叔亭推进唯一标记${index + 1}。`,
    ).join("\n");
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gemini-3.5-flash" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(2));
    expect(callAiStreamMock.mock.calls[0][1]).toContain("唯一标记1");
    expect(callAiStreamMock.mock.calls[0][1]).not.toContain("唯一标记8");
    expect(callAiStreamMock.mock.calls[1][1]).toContain("唯一标记8");
    expect(callAiStreamMock.mock.calls[1][1]).not.toContain("唯一标记1");

    const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(finalDraft.match(/^剧情\d+：/gm)).toEqual(["剧情1：", "剧情2：", "剧情3：", "剧情4："]);
    expect(finalDraft).toContain("甲组画质");
    expect(finalDraft).toContain("乙组画质");
  });

  it("streams later Xiaotu batches into the existing result instead of replacing earlier batches", async () => {
    let releaseSecondBatch: (() => void) | undefined;
    callAiStreamMock
      .mockImplementationOnce(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
        const result = "剧情1：\n【画面内容】分镜1丨前组丨0-15s丨前组结果。";
        onChunk(result);
        return result;
      })
      .mockImplementationOnce(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
        await new Promise<void>((resolve) => {
          releaseSecondBatch = resolve;
        });
        const result = "剧情1：\n【画面内容】分镜1丨后组丨0-15s丨后组结果。";
        onChunk(result);
        return result;
      });
    const project = createProject("小兔skill多批实时累计测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].inputs.sourceText = Array.from(
      { length: 8 },
      (_, index) => `第${index + 1}场：许燃推进第${index + 1}个剧情节点。`,
    ).join("\n");
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gemini-3.5-flash" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(2));
    expect(onStepDraftChange).toHaveBeenCalledWith(project.id, "xiaotu-skill", expect.stringContaining("前组结果"));

    await act(async () => releaseSecondBatch?.());

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "xiaotu-skill",
        expect.stringContaining("后组结果"),
      ),
    );
    const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(finalDraft).toContain("前组结果");
    expect(finalDraft).toContain("后组结果");
    expect(finalDraft.match(/^剧情\d+：/gm)).toEqual(["剧情1：", "剧情2："]);
  });

  it("streams Xiaotu skill chunks into the result area during the single model request", async () => {
    let finishStream: ((value: string) => void) | undefined;
    callAiStreamMock.mockImplementationOnce(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
      const segment1 = "【段落1｜15秒｜多机位分镜】\n【基础设定】许燃站在客厅门口。";
      onChunk(segment1);
      onChunk("【段落2｜15秒｜多机位分镜】\n");
      await new Promise<string>((resolve) => {
        finishStream = resolve;
      });
      onChunk("【基础设定】宋叔亭站在茶几旁。");
      return [
        "【段落1｜15秒｜多机位分镜】",
        "【基础设定】许燃站在客厅门口。",
        "【段落2｜15秒｜多机位分镜】",
        "【基础设定】宋叔亭站在茶几旁。",
      ].join("\n");
    });
    const project = createProject("小兔skill逐段流式测试");
    project.currentStep = "xiaotu-skill";
    const denseBeat =
      "许燃站在客厅门口，右手握着手机边缘，视线压在宋叔亭脸上，宋叔亭站在茶几旁，桌上杯子轻响，窗外雨声很密，许燃先看向门口又看回宋叔亭，宋叔亭压低声音追问，许燃没有立刻回答，只把手机慢慢扣到掌心，客厅顶灯闪了一下，走廊传来电梯提示音。";
    project.steps["xiaotu-skill"].inputs.sourceText = [
      `第1场：${denseBeat}`,
      `第2场：${denseBeat}`,
      `第3场：${denseBeat}`,
    ].join("\n");
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(onStepDraftChange).toHaveBeenCalledTimes(2));
    const segment2Partial = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(segment2Partial).not.toContain("【段落1｜15秒｜多机位分镜】");
    expect(segment2Partial).not.toContain("【段落2｜15秒｜多机位分镜】");
    expect(segment2Partial).toContain("许燃站在客厅门口");
    expect(callAiStreamMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishStream?.("done");
    });

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "xiaotu-skill",
        expect.stringContaining("宋叔亭站在茶几旁"),
      ),
    );
  });

  it("does not auto continue Xiaotu skill when the model mentions a length limit", async () => {
    mockStreamTextOnce(
      [
        "【段落1｜15秒｜多机位分镜】",
        "【基础设定】许燃站在客厅门口。",
        "【画面内容】分镜1丨对峙丨0-15s丨许燃看向宋叔亭。",
        "受单次输出长度限制，无法一次性塞下【段落2】到【段落62】且每段都完整包含全部字段。我可以继续分批补齐。",
      ].join("\n"),
    );
    const project = createProject("小兔skill解释过滤测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].inputs.sourceText = Array.from(
      { length: 3 },
      (_, index) => `第${index + 1}场：许燃和宋叔亭推进第${index + 1}个剧情节点。`,
    ).join("\n");
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(finalDraft).not.toContain("【段落1｜15秒｜多机位分镜】");
    expect(finalDraft).not.toContain("【段落62｜15秒｜多机位分镜】");
    expect(finalDraft).toContain("【基础设定】许燃站在客厅门口。");
  });

  it("removes Xiaotu skill explanatory prefaces before the first segment", async () => {
    mockStreamTextOnce(
      [
        "我先按合规规则把整段剧情拆成可直接生成的分段提示词，并保持人物、站位和道具连续。接下来会输出完整的多段 `15秒` 分镜提示词，不加解释。",
        "",
        "【段落1｜15秒｜多机位分镜】",
        "【基础设定】许燃站在客厅门口。",
        "【画面内容】分镜1丨对峙丨0-15s丨许燃看向宋叔亭。",
      ].join("\n"),
    );
    const project = createProject("小兔skill解释前缀过滤测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].inputs.sourceText = "许燃站在客厅门口，看向宋叔亭。";
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "xiaotu-skill",
        expect.stringMatching(/^【基础设定】/),
      ),
    );
    const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(finalDraft).not.toContain("【段落1｜15秒｜多机位分镜】");
    expect(finalDraft).not.toContain("我先按合规规则");
    expect(finalDraft).not.toContain("接下来会输出");
  });

  it("hides Xiaotu skill internal voice and spatial blocks from the result area", async () => {
    mockStreamTextOnce(
      [
        "【段落1｜15秒｜多机位分镜】",
        "",
        "【基础设定】",
        "许燃：站在客厅门口。",
        "声音：保留同期声。",
        "",
        "【角色音色锁定表】",
        "许燃｜青年男声｜冷静克制｜中速｜禁止变化项",
        "要求：主要角色必须全部列出。",
        "",
        "【氛围与画质】",
        "风格核心：影视写实现代。",
        "视觉基调：现实电影质感。",
        "色彩与影调：冷白室内光。",
        "",
        "【空间坐标与连续性】",
        "固定参照物：客厅门口、茶几。",
        "互动链：许燃 -> 宋叔亭 -> 沉默。",
        "",
        "【画面内容】",
        "分镜1丨短促对峙丨0-15s丨中景固定机位，许燃看向宋叔亭。",
      ].join("\n"),
    );
    const project = createProject("小兔skill简洁输出测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].inputs.sourceText = "许燃站在客厅门口，看向宋叔亭。";
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "xiaotu-skill",
        expect.stringContaining("【画面内容】"),
      ),
    );
    const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(finalDraft).toContain("【基础设定】");
    expect(finalDraft).toContain("【氛围与画质】");
    expect(finalDraft).toContain("【画面内容】");
    expect(finalDraft).not.toContain("【角色音色锁定表】");
    expect(finalDraft).not.toContain("【空间坐标与连续性】");
    expect(finalDraft).not.toContain("互动链");
    expect(finalDraft).not.toContain("禁止变化项");
  });

  it("removes standalone Xiaotu skill dialogue lines from the result area", async () => {
    mockStreamTextOnce(
      [
        "【段落1｜15秒｜多机位分镜】",
        "",
        "【基础设定】",
        "陆沉舟：站在丹道大会入口。弟子甲：守在门前。弟子乙：站在弟子甲身后。",
        "",
        "【声音】",
        "保留原文对白和门口人群声。",
        "",
        "【画面内容】",
        "对白：弟子甲（警惕，轻，快）：哪来的老头？今日丹道大会，闲人止步。",
        "对白：陆沉舟（平静，轻，缓）：我找沈无极。",
        "分镜1丨门前拦路丨0-5s丨中景固定机位，弟子甲站在门槛前抬手拦住陆沉舟，警惕地说：“哪来的老头？今日丹道大会，闲人止步。”陆沉舟停在石阶下，平静地看向弟子甲，说：“我找沈无极。”",
      ].join("\n"),
    );
    const project = createProject("小兔skill对白清洗测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].inputs.sourceText =
      "陆沉舟走到丹道大会入口，弟子甲拦住他说：“哪来的老头？今日丹道大会，闲人止步。”陆沉舟说：“我找沈无极。”";
    project.steps["xiaotu-skill"].inputs.mode = "多机位分镜";
    project.steps["xiaotu-skill"].inputs.segmentSeconds = "15";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "xiaotu-skill",
        expect.stringContaining("分镜1丨门前拦路"),
      ),
    );
    const finalDraft = String(onStepDraftChange.mock.calls.at(-1)?.[2] ?? "");
    expect(finalDraft).not.toContain("对白：");
    expect(finalDraft).toContain("弟子甲站在门槛前抬手拦住陆沉舟，警惕地说：“哪来的老头？今日丹道大会，闲人止步。”");
    expect(finalDraft).toContain("陆沉舟停在石阶下，平静地看向弟子甲，说：“我找沈无极。”");
  });

  it("removes model thinking tags before writing AI output into the result area", async () => {
    mockStreamTextOnce(
      [
        "<think>**Drafting Chinese fiction**",
        "",
        "I need to create a short Chinese fiction piece.",
        "</think>",
        "许明舟把断亲书折好，转身走出了许家堂屋。",
      ].join("\n"),
    );
    const project = createProject("思考标签清洗测试");
    project.steps["outline-expansion"].inputs.outline = "许明舟被许家赶出门。";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "outline-expansion",
        "许明舟把断亲书折好，转身走出了许家堂屋。",
      ),
    );
  });

  it("shows a clear failure when AI output is empty after cleanup", async () => {
    mockStreamTextOnce("<think>only hidden reasoning</think>");
    const project = createProject("空结果提示测试");
    project.steps["outline-expansion"].inputs.outline = "许明舟被许家赶出门。";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    expect(await screen.findByText("AI 返回内容为空，请检查模型是否只返回了思考过程或更换模型重试。")).toBeInTheDocument();
    expect(onStepDraftChange).not.toHaveBeenCalled();
  });

  it("keeps continuing chapter split generation until all 20 chapters are present", async () => {
    mockStreamTextOnce(["第1章：开局。", "第2章：立摊。", "第3章：破局。", "第4章：举报。", "第5章：收款。"].join("\n"));
    mockStreamTextOnce(["第6章：暗线。", "第7章：新客。", "第8章：熬汤。", "第9章：抢摊。", "第10章：证据。"].join("\n"));
    mockStreamTextOnce(["第11章：对赌。", "第12章：直播。", "第13章：翻盘。", "第14章：旧账。", "第15章：招牌。"].join("\n"));
    mockStreamTextOnce(["第16章：围剿。", "第17章：反证。", "第18章：夜宴。", "第19章：归名。", "第20章：开张。"].join("\n"));
    const project = createProject("二十章补齐测试");
    project.currentStep = "chapter-split";
    project.steps["chapter-split"].inputs.storySetting = "夜市逆袭故事。";
    project.steps["chapter-split"].inputs.totalChapters = "20";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(4));
    expect(callAiStreamMock.mock.calls[1][1]).toContain("从第6章继续输出到第20章");
    expect(callAiStreamMock.mock.calls[2][1]).toContain("从第11章继续输出到第20章");
    expect(callAiStreamMock.mock.calls[3][1]).toContain("从第16章继续输出到第20章");
    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "chapter-split",
        expect.stringContaining("第20章：开张。"),
      ),
    );
  });

  it("uses enough continuation attempts when the model only returns a few chapters each time", async () => {
    mockStreamTextOnce(["第1章：开局。", "第2章：立摊。"].join("\n"));
    for (let chapter = 3; chapter <= 20; chapter += 2) {
      mockStreamTextOnce(
        [`第${chapter}章：节点${chapter}。`, `第${chapter + 1}章：节点${chapter + 1}。`].join("\n"),
      );
    }
    const project = createProject("慢速二十章补齐测试");
    project.currentStep = "chapter-split";
    project.steps["chapter-split"].inputs.storySetting = "夜市逆袭故事。";
    project.steps["chapter-split"].inputs.totalChapters = "20";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(10));
    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "chapter-split",
        expect.stringContaining("第20章：节点20。"),
      ),
    );
    expect(onStepDraftChange.mock.calls.at(-1)?.[2]).not.toContain("系统提醒");
  });

  it("shows topic recommendations on the outline expansion step", () => {
    const project = createProject("题材推荐测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.outline = "主角被赶出家门。";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);

    expect(screen.getByRole("heading", { name: "AI 推荐 2026 近期爆款题材" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新推荐" })).toBeInTheDocument();
    const genreSelect = screen.getByRole("combobox", { name: "题材类型" });
    const recommendationStyleSelect = screen.getByRole("combobox", { name: "推荐文风" });
    expect(genreSelect).toHaveValue("都市男频");
    expect(recommendationStyleSelect).toHaveValue("都市爽文");
    expect(recommendationStyleSelect).toBeInTheDocument();
    fireEvent.change(genreSelect, { target: { value: "古风权谋" } });
    expect(recommendationStyleSelect).toHaveValue("历史权谋");
    expect(within(recommendationStyleSelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "历史权谋",
      "仙侠古风",
      "克制冷峻",
      "电影感写实",
    ]);
    expect(screen.getByRole("combobox", { name: "文风" })).toHaveValue("历史权谋");
    expect(screen.getAllByRole("button", { name: "一键填入大纲" }).length).toBeGreaterThan(0);
  });

  it("restores fallback cards for the genre saved in an existing project", () => {
    const project = createProject("已保存题材测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.topicGenre = "古风权谋";
    project.steps["outline-expansion"].inputs.style = "历史权谋";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox", { name: "题材类型" })).toHaveValue("古风权谋");
    expect(screen.getByText("盐仓旧账")).toBeInTheDocument();
    expect(screen.queryByText("县城技能合伙人")).not.toBeInTheDocument();
  });

  it("keeps the recommendation style valid when the main form uses a cross-genre style", () => {
    const project = createProject("跨类型文风测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.topicGenre = "都市男频";
    project.steps["outline-expansion"].inputs.style = "古言甜宠";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox", { name: "文风" })).toHaveValue("古言甜宠");
    expect(screen.getByRole("combobox", { name: "推荐文风" })).toHaveValue("都市爽文");
  });

  it("does not let an older online refresh overwrite cards after the genre changes", async () => {
    let resolveRecommendation: ((value: string) => void) | undefined;
    callAiMock.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveRecommendation = resolve;
      }),
    );
    const project = createProject("题材刷新竞态测试");
    project.currentStep = "outline-expansion";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "刷新推荐" }));
    fireEvent.change(screen.getByRole("combobox", { name: "题材类型" }), { target: { value: "古风权谋" } });
    resolveRecommendation?.(
      JSON.stringify([
        {
          title: "过期都市推荐",
          summary: "旧请求结果。",
          outline: "不应覆盖古风权谋卡片。",
          tags: ["旧请求"],
          style: "都市爽文",
          genre: "都市男频",
        },
      ]),
    );

    await waitFor(() => expect(screen.getByText("盐仓旧账")).toBeInTheDocument());
    expect(screen.queryByText("过期都市推荐")).not.toBeInTheDocument();
  });

  it("does not let an older online refresh overwrite cards after switching projects", async () => {
    let resolveRecommendation: ((value: string) => void) | undefined;
    callAiMock.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveRecommendation = resolve;
      }),
    );
    const firstProject = createProject("旧项目");
    firstProject.currentStep = "outline-expansion";
    const nextProject = createProject("新项目");
    nextProject.currentStep = "outline-expansion";
    nextProject.steps["outline-expansion"].inputs.topicGenre = "古风权谋";
    nextProject.steps["outline-expansion"].inputs.style = "历史权谋";

    const props = {
      aiSettings: { endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" },
      onAiSettingsChange: () => undefined,
      onProjectChange: () => undefined,
      onSaveVersion: () => undefined,
    };
    const { rerender } = render(<Workspace {...props} project={firstProject} />);
    fireEvent.click(screen.getByRole("button", { name: "刷新推荐" }));
    rerender(<Workspace {...props} project={nextProject} />);
    resolveRecommendation?.(
      JSON.stringify([
        {
          title: "旧项目推荐",
          summary: "旧请求结果。",
          outline: "不应覆盖新项目卡片。",
          tags: ["旧项目"],
          style: "都市爽文",
          genre: "都市男频",
        },
      ]),
    );

    await waitFor(() => expect(screen.getByText("盐仓旧账")).toBeInTheDocument());
    expect(screen.queryByText("旧项目推荐")).not.toBeInTheDocument();
  });

  it("refreshes only the selected 2026 genre and applies the returned outline with its matching style", async () => {
    callAiMock.mockResolvedValue(
      JSON.stringify([
        {
          title: "边城换防夜",
          summary: "限时军政博弈。",
          outline: "新任县令必须在天亮前辨认真伪军令。",
          tags: ["边城", "权谋", "限时"],
          style: "历史权谋",
          genre: "古风权谋",
        },
      ]),
    );
    const project = createProject("题材类型联动测试");
    project.currentStep = "outline-expansion";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);
    fireEvent.change(screen.getByRole("combobox", { name: "题材类型" }), { target: { value: "古风权谋" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新推荐" }));

    await waitFor(() => expect(callAiMock).toHaveBeenCalledTimes(1));
    const recommendationPrompt = String(callAiMock.mock.calls[0][1]);
    expect(recommendationPrompt).toContain("题材类型：古风权谋");
    expect(recommendationPrompt).toContain("最近30至90天");
    expect(recommendationPrompt).toMatch(/当前日期：2026-07-1[67]/);
    expect(await screen.findByText("边城换防夜")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "一键填入大纲" }));
    expect(screen.getByRole("textbox", { name: /故事大纲/ })).toHaveValue("新任县令必须在天亮前辨认真伪军令。");
    expect(screen.getByRole("combobox", { name: "文风" })).toHaveValue("历史权谋");
  });

  it("keeps local topic recommendations usable when online refresh fails", async () => {
    callAiMock.mockRejectedValue(new Error("AI 调用失败：网络请求未完成"));
    const project = createProject("题材推荐失败兜底测试");
    project.currentStep = "outline-expansion";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新推荐" }));

    expect(screen.getByText("正在联网分析都市男频近期趋势...")).toBeInTheDocument();
    expect(await screen.findByText("联网推荐暂不可用，当前显示都市男频的本地 2026 趋势兜底。")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "一键填入大纲" }).length).toBeGreaterThan(0);
  });

  it("shows online topic recommendations after refresh succeeds", async () => {
    callAiMock.mockResolvedValue(
      JSON.stringify([
        {
          title: "夜市焕新",
          summary: "年轻摊主帮助老街小店重新被看见。",
          outline: "主角接手冷清夜市摊位，用短视频运营和真诚服务带动整条街复兴。",
          tags: ["现实主义", "烟火气"],
          genre: "都市男频",
        },
      ]),
    );
    const project = createProject("题材推荐在线测试");
    project.currentStep = "outline-expansion";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新推荐" }));

    expect((await screen.findAllByText(/联网 AI 近期趋势推荐/)).length).toBeGreaterThan(0);
    expect(screen.getByText("夜市焕新")).toBeInTheDocument();
  });
});

describe("Workspace AI settings", () => {
  it("routes all text-generation steps through the same TimeAI proxy endpoint", async () => {
    callAiStreamMock.mockResolvedValue("生成结果");
    const stepCases = [
      { step: "outline-expansion", inputs: { outline: "夜市摊主逆袭。" } },
      { step: "chapter-split", inputs: { storySetting: "夜市摊主逆袭。" } },
      {
        step: "prose-generation",
        inputs: {
          storySetting: "许明舟是被逐出家门的夜市摊主。",
          chapterOutline: "主角守住摊位。",
        },
      },
      { step: "novel-to-script", inputs: { sourceScene: "主角端出第一碗面。" } },
      { step: "asset-extraction", inputs: { sourceText: "【人物】许明舟：夜市摊主。" } },
      { step: "storyboard-15s", inputs: { scriptText: "许明舟在夜市摊前挡住收摊费的人。" } },
      { step: "gpt-image2-storyboard", inputs: { sourceText: "夜市摊前，许明舟端出葱油面。" } },
    ] as const;

    for (const item of stepCases) {
      callAiMock.mockClear();
      callAiStreamMock.mockClear();
      const project = createProject(`统一代理测试-${item.step}`);
      project.currentStep = item.step;
      project.steps[item.step].inputs = {
        ...project.steps[item.step].inputs,
        ...item.inputs,
      };

      const { unmount } = render(
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "claude-opus-4-8" }}
          project={project}
          onAiSettingsChange={() => undefined}
          onProjectChange={() => undefined}
          onSaveVersion={() => undefined}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

      await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
      expect(callAiStreamMock.mock.calls[0][0]).toMatchObject({ endpoint: "/api/timeai/v1" });
      expect(callAiMock).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("shows a unified friendly message when a text-generation proxy request does not complete", async () => {
    callAiStreamMock.mockRejectedValue(new Error("AI 流式响应超时"));
    callAiMock.mockResolvedValue("降级后的普通结果");
    const project = createProject("统一网络错误提示测试");
    project.steps["outline-expansion"].inputs.outline = "夜市摊主逆袭。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "claude-opus-4-8" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    expect(await screen.findByText("AI 结果已放入草稿区")).toBeInTheDocument();
    expect(callAiMock).toHaveBeenCalledTimes(1);
  });

  it("keeps API editing in the settings dialog and only shows the active model in the workspace", () => {
    const project = createProject("AI 设置测试");
    project.steps["outline-expansion"].inputs.outline = "主角被赶出家门。";
    const onAiSettingsChange = vi.fn();

    render(
      <Workspace
        aiSettings={{
          endpoint: "https://timeai.chat/v1",
          apiKey: "sk-test",
          model: "gpt-5.5",
          geminiImageEndpoint: "https://gemini.example/v1",
          geminiImageApiKey: "sk-gemini",
          geminiImageModel: "gemini-3.1-flash-preview",
        }}
        project={project}
        onAiSettingsChange={onAiSettingsChange}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.queryByText("AI 调用设置")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("API 地址")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "模型" })).not.toBeInTheDocument();
    expect(screen.getByText("当前文本模型：gpt-5.5")).toBeInTheDocument();
    expect(screen.getByText("Gemini 生图备用：gemini-3.1-flash-preview")).toBeInTheDocument();
    expect(onAiSettingsChange).not.toHaveBeenCalled();
  });
});


describe("Workspace storyboard controls", () => {
  it("renders selectable controls for storyboard duration, ratio, and style", () => {
    const project = createProject("分镜参数测试");
    project.currentStep = "storyboard-15s";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("spinbutton", { name: /目标总时长/ })).toHaveAttribute("min", "60");
    expect(screen.getByRole("spinbutton", { name: /目标总时长/ })).toHaveAttribute("max", "600");
    expect(screen.getByRole("combobox", { name: /单段时长/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /画面比例/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /影像风格/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "横屏16:9" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "电影宽屏21:9" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "复古欧美原子朋克风格" })).toBeInTheDocument();
    expect(screen.queryByText("上一组结尾")).not.toBeInTheDocument();
    expect(screen.queryByText("下一组开头")).not.toBeInTheDocument();
    expect(screen.queryByText("角色资产")).not.toBeInTheDocument();
    expect(screen.queryByText("场景资产")).not.toBeInTheDocument();
    expect(screen.queryByText("物品资产")).not.toBeInTheDocument();
  });

  it("supports document import and moves prompt actions to the result area", () => {
    const project = createProject("导入测试");
    project.currentStep = "storyboard-15s";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.queryByText("提示词预览")).not.toBeInTheDocument();
    expect(screen.getByLabelText("导入文档")).toHaveAttribute("type", "file");
    expect(screen.getByText("支持 TXT / MD / CSV / JSON / SRT 等文本文件，也可以拖拽到这里。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 TXT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一键清除" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "送入下一步" })).not.toBeInTheDocument();
  });

  it("supports document import and clearing for novel-to-script source text", () => {
    const project = createProject("小说改剧本导入测试");
    project.currentStep = "novel-to-script";
    project.steps["novel-to-script"].inputs.sourceScene = "旧文本";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);

    expect(screen.getByText("把小说原文改成短剧脚本。")).toBeInTheDocument();
    expect(screen.getByText("小说原文")).toBeInTheDocument();
    expect(screen.queryByText("小说原文或场景")).not.toBeInTheDocument();
    expect(screen.getByLabelText("导入文档")).toHaveAttribute("type", "file");

    fireEvent.click(screen.getByRole("button", { name: "清除" }));

    expect(screen.queryByDisplayValue("旧文本")).not.toBeInTheDocument();
  });

  it("uses the language model to convert GPT-image2 storyboard source into an image prompt", async () => {
    mockStreamTextOnce(
      [
        "_::~OUTPUT_START::~_",
        "【图片提示词区｜对白已明确标注】",
        "GPT-image-2出图提示词：一张四宫格故事板图。",
        "_::~FIELD::~_",
        "【视频提示词区】",
        "参考当前导演分镜图依次帮我生成视频",
        "_::~OUTPUT_END::~_",
      ].join("\n"),
    );
    const project = createProject("故事板提示词转换测试");
    project.currentStep = "gpt-image2-storyboard";
    project.steps["gpt-image2-storyboard"].inputs.sourceText = "夜市摊前，许明舟端出第一碗葱油面。";
    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    expect(callAiStreamMock.mock.calls[0][0]).toMatchObject({
      endpoint: "/api/timeai/v1",
      model: "gpt-5.5",
    });
    expect(callAiStreamMock.mock.calls[0][1]).toContain("GPT-image-2");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("夜市摊前");
    expect(callImageGenerationMock).not.toHaveBeenCalled();
    const result = await screen.findByDisplayValue(/GPT-image-2出图提示词：一张四宫格故事板图。/);
    expect(result).toBeInTheDocument();
    expect((result as HTMLTextAreaElement).value).not.toContain("_::~OUTPUT_START::~_");
    expect((result as HTMLTextAreaElement).value).not.toContain("_::~FIELD::~_");
    expect((result as HTMLTextAreaElement).value).not.toContain("_::~OUTPUT_END::~_");
  });

  it("shows a storyboard image generation panel under GPT-image2 storyboard results", async () => {
    callImageGenerationMock.mockResolvedValue("https://example.com/storyboard.png");
    const project = createProject("故事板出图测试");
    project.currentStep = "gpt-image2-storyboard";
    project.steps["gpt-image2-storyboard"].inputs.sourceText = "夜市摊前，许明舟端出第一碗葱油面。";
    project.steps["gpt-image2-storyboard"].inputs.imageRatio = "16:9";
    project.steps["gpt-image2-storyboard"].inputs.visualStyle = "3D国漫风格";
    project.steps["gpt-image2-storyboard"].inputs.panelLayout = "六宫格3x2";
    project.steps["gpt-image2-storyboard"].inputs.imageModel = "gemini-3.1-flash-preview";
    project.steps["gpt-image2-storyboard"].inputs.imageResolution = "2K";
    project.steps["gpt-image2-storyboard"].draft = [
      "_::~OUTPUT_START::~_",
      "【图片提示词区｜对白已明确标注】",
      "短剧导演分镜工作板，6 Cut左右排版，一张六宫格故事板图。",
      "Cut 1｜00:00-00:02",
      "【对白标注】无对白",
      "_::~FIELD::~_",
      "【视频提示词区】",
      "参考当前导演分镜图依次帮我生成视频",
      "Cut 1 (00:00-00:02): 夜市摊前，许明舟端出葱油面",
      "_::~OUTPUT_END::~_",
    ].join("\n");

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("option", { name: "六宫格3x2" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "九宫格3x3" })).not.toBeInTheDocument();
    const storyboardImagePanel = screen.getByLabelText("故事板出图区");
    expect(within(storyboardImagePanel).getByRole("combobox", { name: "故事板数量" })).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("combobox", { name: "画面比例" })).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("combobox", { name: "影像风格" })).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("combobox", { name: "画面布局" })).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("combobox", { name: "生图模型" })).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("combobox", { name: "分辨率" })).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByText("故事板出图区")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成故事板图片" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("一张六宫格故事板图");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("【图片提示词区｜对白已明确标注】");
    expect(callImageGenerationMock.mock.calls[0][1]).not.toContain("【视频提示词区】");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("六宫格3x2");
    expect(callImageGenerationMock.mock.calls[0][2]).toBe("gemini-3.1-flash-preview");
    expect(callImageGenerationMock.mock.calls[0][3]).toBe("16:9");
    expect(callImageGenerationMock.mock.calls[0][4]).toBe("2K");
    expect(await within(storyboardImagePanel).findByRole("img", { name: "故事板 生图结果 1" })).toHaveAttribute(
      "src",
      "https://example.com/storyboard.png",
    );
    expect(within(storyboardImagePanel).getByRole("button", { name: "下载图片 1" })).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("button", { name: "删除图片 1" })).toBeInTheDocument();
  });

  it("shows a clear message when storyboard image generation returns no image reference", async () => {
    callImageGenerationMock.mockResolvedValue("生图完成");
    const project = createProject("故事板无图提示测试");
    project.currentStep = "gpt-image2-storyboard";
    project.steps["gpt-image2-storyboard"].inputs.sourceText = "夜市摊前，许明舟端出第一碗葱油面。";
    project.steps["gpt-image2-storyboard"].draft = "GPT-image-2出图提示词：一张四宫格故事板图。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成故事板图片" }));

    expect(await screen.findByText("模型已响应，但没有返回可预览图片。请换生图模型或检查该模型是否支持图片输出。")).toBeInTheDocument();
    expect(screen.queryByLabelText("生图结果预览")).not.toBeInTheDocument();
  });

  it("keeps uploaded Seedance materials on stable reference names and appends @ mentions", async () => {
    uploadAistarsLabMaterialMock
      .mockResolvedValueOnce({
        fileKey: "materials/entity_3.png",
        url: "https://cdn.example.com/entity_3.png",
        size: 100,
        contentType: "image/png",
      })
      .mockResolvedValueOnce({
        fileKey: "materials/entity_5.png",
        url: "https://cdn.example.com/entity_5.png",
        size: 100,
        contentType: "image/png",
      });
    const project = createProject("Seedance 参考素材别名测试");
    project.currentStep = "seedance-video";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);

    const input = screen.getByLabelText("上传 SEEDANCE 参考素材");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["image-1"], "entity_3.png", { type: "image/png" }),
          new File(["image-2"], "entity_5.png", { type: "image/png" }),
        ],
      },
    });

    expect(await screen.findByText("参考图片 1")).toBeInTheDocument();
    expect(await screen.findByText("参考图片 2")).toBeInTheDocument();
    expect(screen.queryByText("entity_3.png")).not.toBeInTheDocument();
    expect(screen.queryByText("entity_5.png")).not.toBeInTheDocument();

    const callButtons = screen.getAllByRole("button", { name: "@调用" });
    fireEvent.click(callButtons[0]);
    fireEvent.click(callButtons[1]);

    const promptTextarea = screen.getByLabelText("小说/剧本/分镜/视频提示词") as HTMLTextAreaElement;
    expect(promptTextarea.value).toContain("@参考图片 1");
    expect(promptTextarea.value).toContain("@参考图片 2");
  });

  it("opens a reference image picker when typing @ in custom-image prompt", async () => {
    const project = createProject("第9项@参考图选择测试");
    project.currentStep = "custom-image";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);

    const input = screen.getByLabelText("上传参考图片");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["image-1"], "person.png", { type: "image/png" }),
          new File(["image-2"], "scene.png", { type: "image/png" }),
        ],
      },
    });

    expect(await screen.findByText("参考图片 1")).toBeInTheDocument();
    expect(await screen.findByText("参考图片 2")).toBeInTheDocument();

    const promptTextarea = screen.getByLabelText("主提示词") as HTMLTextAreaElement;
    fireEvent.change(promptTextarea, { target: { value: "请修改 @" } });

    expect(await screen.findByLabelText("第9项参考图片选择")).toBeInTheDocument();
    const picker = screen.getByLabelText("第9项参考图片选择");
    fireEvent.click(within(picker).getByRole("button", { name: /参考图片 2/ }));

    expect(promptTextarea.value).toContain("@参考图片 2");
  });

  it("does not inline uploaded reference image base64 into custom-image prompts", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/custom-reference.png");
    const project = createProject("第9项参考图不内联测试");
    project.currentStep = "custom-image";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);

    fireEvent.change(screen.getByLabelText("上传参考图片"), {
      target: {
        files: [new File(["image-1"], "person.png", { type: "image/png" })],
      },
    });
    expect(await screen.findByText("参考图片 1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("主提示词"), {
      target: { value: "@参考图片 1 保持人物脸型不变，改成雨夜街头电影感。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    const prompt = callImageGenerationMock.mock.calls[0][1] as string;
    expect(prompt).toContain("@参考图片 1：person.png");
    expect(prompt).toContain("已在第9项本地参考区上传");
    expect(prompt).not.toContain("data:image/");
    expect(callImageGenerationMock.mock.calls[0][5]).toMatchObject({
      referenceImages: [expect.stringMatching(/^data:image\//)],
    });
  });

  it("uses a fixed Seedance video preview card layout for completed videos", async () => {
    vi.useFakeTimers();
    createAistarsLabVideoTaskMock.mockResolvedValue({
      taskId: "task_123",
      status: 3,
      outputUrl: "https://cdn.example.com/video.mp4",
      costCredits: 1,
    });
    fetchAistarsLabVideoTaskMock.mockResolvedValue({
      taskId: "task_123",
      status: 3,
      progress: 100,
      outputUrl: "https://cdn.example.com/video.mp4",
      costCredits: 1,
    });
    const project = createProject("Seedance 视频预览布局测试");
    project.currentStep = "seedance-video";
    project.steps["seedance-video"].inputs.videoPromptSource = "许明舟端起葱油面。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "生成视频" }));
    });
    expect(createAistarsLabVideoTaskMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    const previewPanel = screen.getByLabelText("视频生成结果预览");
    const video = within(previewPanel).getByLabelText("视频 1 预览");
    expect(video).toHaveClass("seedance-video-thumbnail");
    expect(video.closest("figure")).toHaveClass("seedance-video-result-card");
  });

  it("keeps Seedance video polling active for twenty minutes before timing out", async () => {
    vi.useFakeTimers();
    createAistarsLabVideoTaskMock.mockResolvedValue({ taskId: "task_slow", status: 1, costCredits: 1 });
    fetchAistarsLabVideoTaskMock.mockResolvedValue({
      taskId: "task_slow",
      status: 2,
      progress: 55,
      costCredits: 1,
    });
    const project = createProject("Seedance 视频轮询时长测试");
    project.currentStep = "seedance-video";
    project.steps["seedance-video"].inputs.videoPromptSource = "许明舟把夜市摊位灯打开。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "生成视频" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12 * 60 * 1000);
    });

    expect(screen.queryByText(/等待超时/)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * 60 * 1000 + 3000);
    });

    expect(screen.getByText(/等待超时/)).toBeInTheDocument();
  });

  it("shows storyboard image progress and failure feedback inside the storyboard image panel", async () => {
    callImageGenerationMock.mockReturnValue(new Promise((_, reject) => window.setTimeout(() => reject(new Error("故事板图片接口失败")), 20)));
    const project = createProject("故事板独立进度测试");
    project.currentStep = "gpt-image2-storyboard";
    project.steps["gpt-image2-storyboard"].draft = "GPT-image-2出图提示词：一张四宫格故事板图。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    const storyboardImagePanel = screen.getByLabelText("故事板出图区");
    fireEvent.click(within(storyboardImagePanel).getByRole("button", { name: "生成故事板图片" }));

    expect(within(storyboardImagePanel).getByText("故事板出图中")).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("progressbar", { name: "故事板图片生成进度" })).toHaveAttribute(
      "aria-valuenow",
      "28",
    );
    expect(await within(storyboardImagePanel).findByText("故事板图片接口失败")).toBeInTheDocument();
    expect(within(storyboardImagePanel).getByRole("progressbar", { name: "故事板图片生成进度" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("keeps the selected image model for 2K storyboard image generation", async () => {
    callImageGenerationMock.mockResolvedValue("https://example.com/storyboard-2k.png");
    const project = createProject("故事板2K自动模型测试");
    project.currentStep = "gpt-image2-storyboard";
    project.steps["gpt-image2-storyboard"].inputs.imageModel = "gpt-image-2";
    project.steps["gpt-image2-storyboard"].inputs.imageResolution = "2K";
    project.steps["gpt-image2-storyboard"].draft = "GPT-image-2出图提示词：一张四宫格故事板图。";

    render(
      <Workspace
        aiSettings={{
          endpoint: "https://timeai.chat/v1",
          apiKey: "sk-test",
          model: "gpt-5.5",
          geminiImageEndpoint: "https://timeai.chat/v1",
          geminiImageApiKey: "sk-gemini",
          geminiImageModel: "gemini-3.1-flash-preview",
        }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成故事板图片" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(callImageGenerationMock.mock.calls[0][0]).toMatchObject({
      endpoint: "https://timeai.chat/v1",
      apiKey: "sk-test",
      model: "gpt-5.5",
    });
    expect(callImageGenerationMock.mock.calls[0][2]).toBe("gpt-image-2");
    expect(callImageGenerationMock.mock.calls[0][4]).toBe("2K");
  });

  it("offers 4K storyboard image generation and keeps the selected image model", async () => {
    callImageGenerationMock.mockResolvedValue("https://example.com/storyboard-4k.png");
    const project = createProject("故事板4K自动模型测试");
    project.currentStep = "gpt-image2-storyboard";
    project.steps["gpt-image2-storyboard"].inputs.imageModel = "gpt-image-2";
    project.steps["gpt-image2-storyboard"].inputs.imageResolution = "4K";
    project.steps["gpt-image2-storyboard"].draft = "GPT-image-2出图提示词：一张四宫格故事板图。";

    render(
      <Workspace
        aiSettings={{
          endpoint: "https://timeai.chat/v1",
          apiKey: "sk-test",
          model: "gpt-5.5",
          geminiImageEndpoint: "https://timeai.chat/v1",
          geminiImageApiKey: "sk-gemini",
          geminiImageModel: "gemini-3.1-flash-preview",
        }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    const storyboardImagePanel = screen.getByLabelText("故事板出图区");
    expect(within(storyboardImagePanel).getByRole("option", { name: "4K" })).toBeInTheDocument();

    fireEvent.click(within(storyboardImagePanel).getByRole("button", { name: "生成故事板图片" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(callImageGenerationMock.mock.calls[0][2]).toBe("gpt-image-2");
    expect(callImageGenerationMock.mock.calls[0][4]).toBe("4K");
  });

  it("previews signed asset image urls that do not include a file extension", async () => {
    callImageGenerationMock.mockResolvedValue("https://oaidalleapiprodscus.blob.core.windows.net/private/generated?id=abc");
    const project = createProject("无后缀图片链接预览");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].inputs = {
      sourceText: "【人物】林晚：白衬衫，夜市摊主。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，夜市摊主。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    expect(await screen.findByAltText("林晚 生图结果 1")).toHaveAttribute(
      "src",
      "https://oaidalleapiprodscus.blob.core.windows.net/private/generated?id=abc",
    );
  });

  it("extracts preview images from wrapped third-party image responses", async () => {
    callImageGenerationMock.mockResolvedValue(
      '生图完成 {"data":[{"url":"https://cdn.example.com/generated/scene?id=abc&token=secure"}]}',
    );
    const project = createProject("包装格式图片返回测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].inputs = {
      sourceText: "夜市霓虹灯牌亮起，雨后地面反光。",
      assetType: "场景",
      visualStyle: "影视写实现代",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    project.steps["asset-extraction"].draft = "【场景】夜市：霓虹灯牌，雨后地面反光，深夜冷色调。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 夜市" }));

    expect(await screen.findByAltText("夜市 生图结果 1")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated/scene?id=abc&token=secure",
    );
  });

  it("shows only the first returned image for one asset generation click", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/chen-bo-1.png\nhttps://img.example.com/chen-bo-2.png");
    const project = createProject("单资产只显示一张图");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].inputs = {
      sourceText: "【人物】陈伯：老厨子，灰色围裙。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    project.steps["asset-extraction"].draft = "【人物】陈伯：老厨子，灰色围裙。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 陈伯" }));

    expect(await screen.findByAltText("陈伯 生图结果 1")).toHaveAttribute("src", "https://img.example.com/chen-bo-1.png");
    expect(screen.queryByAltText("陈伯 生图结果 2")).not.toBeInTheDocument();
  });

  it("keeps asset action button labels compact while retaining asset-specific accessible names", () => {
    const project = createProject("资产按钮布局测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].inputs = {
      sourceText: "夜市霓虹灯牌亮起。",
      assetType: "场景",
      visualStyle: "影视写实现代",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    project.steps["asset-extraction"].draft = "【场景】夜市：霓虹灯牌，雨后地面反光。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "生成 夜市" })).toHaveTextContent(/^生成$/);
    expect(screen.getByRole("button", { name: "删除 夜市" })).toHaveTextContent(/^删除$/);
  });

  it("writes 15S storyboard output into the result area before the full stream finishes", async () => {
    const deferred = (() => {
      let resolve: () => void = () => undefined;
      const promise = new Promise<void>((innerResolve) => {
        resolve = innerResolve;
      });
      return { promise, resolve };
    })();

    callAiStreamMock.mockImplementation(async (_settings: unknown, _prompt: string, onChunk: (chunk: string) => void) => {
      onChunk("分镜1：开场入画");
      await deferred.promise;
      onChunk("\n分镜2：冲突推进");
      return "分镜1：开场入画\n分镜2：冲突推进";
    });

    const project = createProject("15S流式结果测试");
    project.currentStep = "storyboard-15s";
    project.steps["storyboard-15s"].inputs.scriptText = "夜市摊前，许明舟抬头看见有人来收摊费。";
    project.steps["storyboard-15s"].inputs.targetDuration = "60";
    project.steps["storyboard-15s"].inputs.segmentSeconds = "15";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    const resultEditor = screen.getByPlaceholderText("把 AI 输出粘贴到这里，或点击“调用 AI 生成”。确认后点击“保存结果”。");
    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(resultEditor).toHaveDisplayValue("分镜1：开场入画"));
    await act(async () => {
      deferred.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(resultEditor).toHaveDisplayValue("分镜1：开场入画\n分镜2：冲突推进"));
  });

  it("checks 15S storyboard results for SEEDAN2.0 video prompt forbidden words", () => {
    const project = createProject("SEEDAN检测测试");
    project.currentStep = "storyboard-15s";
    project.steps["storyboard-15s"].inputs.scriptText = "夜市摊前，许明舟阻止对方。";
    project.steps["storyboard-15s"].draft = "分镜1：角色掏枪开枪，画面出现血腥伤口和水印logo。";

    function Shell() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<Shell />);

    fireEvent.click(screen.getByRole("button", { name: "SEEDAN2.0违禁词检测" }));

    expect(screen.getByText("已检测并自动优化 SEEDAN2.0 风险内容")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/受力反馈|危机暗示|无标识道具/)).toBeInTheDocument();
    expect(screen.queryByText("暴力血腥")).not.toBeInTheDocument();
  });

  it("sends storyboard draft to ZZDH from the 15s storyboard step", async () => {
    sendStoryboardToZzdhMock.mockResolvedValue({ success: true });
    const project = createProject("字字动画联动测试");
    project.currentStep = "storyboard-15s";
    project.steps["storyboard-15s"].inputs.scriptText = "夜市摊前，许明舟抬头看见有人来收摊费。";
    project.steps["storyboard-15s"].draft = [
      "第1段 15S：夜市摊前",
      "分镜1 开场（0-3s）：许明舟站在摊前。",
      "对白：许明舟：今天这摊，我守定了。",
    ].join("\n");

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "发送分镜到字字动画" }));

    await waitFor(() => expect(sendStoryboardToZzdhMock).toHaveBeenCalledTimes(1));
    expect(sendStoryboardToZzdhMock).toHaveBeenCalledWith(
      "字字动画联动测试",
      project.steps["storyboard-15s"].draft,
    );
    expect(await screen.findByText("已发送到字字动画，并自动创建/打开项目")).toBeInTheDocument();
  });

  it("sends xiaotu skill draft to ZZDH", async () => {
    sendStoryboardToZzdhMock.mockResolvedValue({ success: true });
    const project = createProject("小兔skill联动测试");
    project.currentStep = "xiaotu-skill";
    project.steps["xiaotu-skill"].draft = [
      "【段落1｜15秒｜多机位分镜】",
      "【画面内容】[0-4s] 许明舟站在夜市摊前。",
      "",
      "【段落2｜12秒｜一镜到底】",
      "【画面内容】[0-5s] 万金宝走到摊前。",
    ].join("\n");

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "发送到字字动画" }));

    await waitFor(() => expect(sendStoryboardToZzdhMock).toHaveBeenCalledTimes(1));
    expect(sendStoryboardToZzdhMock).toHaveBeenCalledWith("小兔skill联动测试", project.steps["xiaotu-skill"].draft);
    expect(await screen.findByText("已发送到字字动画，并自动创建/打开项目")).toBeInTheDocument();
  });

  it("keeps storyboard and asset image previews independent when switching steps", async () => {
    callImageGenerationMock.mockResolvedValue("https://example.com/storyboard.png");
    const project = createProject("出图预览隔离测试");
    project.currentStep = "gpt-image2-storyboard";
    project.steps["gpt-image2-storyboard"].draft = "GPT-image-2出图提示词：一张四宫格故事板图。";
    project.steps["asset-extraction"].draft = "【人物】许明舟：男，黑色围裙，夜市摊主。";

    function Shell({ initialProject }: { initialProject: typeof project }) {
      const [currentProject, setCurrentProject] = useState(initialProject);

      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    const { rerender } = render(<Shell initialProject={project} />);

    fireEvent.click(screen.getByRole("button", { name: "生成故事板图片" }));
    expect(await screen.findByRole("img", { name: "故事板 生图结果 1" })).toHaveAttribute(
      "src",
      "https://example.com/storyboard.png",
    );

    const assetProject = { ...project, currentStep: "asset-extraction" as const };
    rerender(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={assetProject}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.queryByRole("img", { name: "故事板 生图结果 1" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("生图结果预览")).not.toBeInTheDocument();
  });
});

describe("Workspace writing flow", () => {
  it("shows one-click novel controls and chapter maintenance actions on the first step", () => {
    const project = createProject("一键小说测试");
    project.currentStep = "outline-expansion";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByText("一键小说正文生成")).toBeInTheDocument();
    expect(screen.getByLabelText("总章数")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "单章字数" })).toBeInTheDocument();
    const styleSelect = screen.getByRole("combobox", { name: "文风" });
    expect(styleSelect).toBeInTheDocument();
    expect(within(styleSelect).getByRole("option", { name: "都市爽文" })).toBeInTheDocument();
    expect(within(styleSelect).getByRole("option", { name: "电影感写实" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "叙事视角" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "第三人称限知" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "多主角群像视角" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "小说模式" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "优化章节" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "续写下一章" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "优化选中章节" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一步：章节拆分" })).not.toBeInTheDocument();
  });

  it("continues the next novel chapter from the generated result", async () => {
    mockStreamTextOnce("第2章：新摊开张\n许明舟把炉火压稳，第二晚的第一位客人已经站到摊前。");
    const project = createProject("续写测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.outline = "许明舟被赶出许家后经营夜市摊。";
    project.steps["outline-expansion"].inputs.totalChapters = "20";
    project.steps["outline-expansion"].inputs.chapterWords = "2500";
    project.steps["outline-expansion"].draft = "第1章：断亲书\n许明舟签下断亲书，拿着红木箱去了夜市。";
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "续写下一章" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    expect(callAiStreamMock.mock.calls[0][1]).toContain("续写第2章");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("单章目标字数：2500");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("继承前文主要人物的语言指纹");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("姓名互换后仍成立的台词必须重写");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("不得用对白复述前文");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("单次发言不得超过20个汉字");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("标点符号不计入字数");
    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "outline-expansion",
        expect.stringContaining("第2章：新摊开张"),
      ),
    );
  });

  it("optimizes the selected chapter without replacing the whole novel result", async () => {
    mockStreamTextOnce("第1章：断亲书\n许明舟没有争辩，只把断亲书推回桌心，字字像刀。");
    const project = createProject("单章优化测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.outline = "许明舟被赶出许家后经营夜市摊。";
    project.steps["outline-expansion"].inputs.reviseChapter = "1";
    project.steps["outline-expansion"].draft = [
      "第1章：断亲书",
      "许明舟签下断亲书。",
      "第2章：夜市破摊",
      "许明舟到了夜市。",
    ].join("\n");
    const onStepDraftChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
        onStepDraftChange={onStepDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "优化选中章节" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    expect(callAiStreamMock.mock.calls[0][1]).toContain("优化第1章");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("机械对白");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("人物声音同质化");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("潜台词");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("万能模板句");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("单次发言不得超过20个汉字");
    expect(callAiStreamMock.mock.calls[0][1]).toContain("拆成自然的多轮短句");
    await waitFor(() =>
      expect(onStepDraftChange).toHaveBeenLastCalledWith(
        project.id,
        "outline-expansion",
        expect.stringContaining("第2章：夜市破摊"),
      ),
    );
    expect(onStepDraftChange.mock.calls.at(-1)?.[2]).toContain("字字像刀");
  });

  it("lets prose generation choose one chapter from the chapter split output", () => {
    const project = createProject("章节选择测试");
    project.currentStep = "prose-generation";
    project.steps["chapter-split"].inputs.storySetting = "夜市逆袭故事，主角林晚和顾玄同行。";
    project.steps["chapter-split"].draft = [
      "第1章：夜市重逢。林晚被追兵逼到摊位后方，顾玄出手解围。",
      "第2章：暗巷反击。二人进入暗巷，发现追兵背后另有主使。",
    ].join("\n");
    const onProjectChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={onProjectChange}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "选择章节" }), {
      target: { value: "2" },
    });

    expect(onProjectChange).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.objectContaining({
          "prose-generation": expect.objectContaining({
            inputs: expect.objectContaining({
              storySetting: "夜市逆袭故事，主角林晚和顾玄同行。",
              chapterNumber: "2",
              chapterOutline: "第2章：暗巷反击。二人进入暗巷，发现追兵背后另有主使。",
            }),
          }),
        }),
      }),
    );
  });

  it("moves chapter split output into prose generation and supports markdown chapter formats", () => {
    const project = createProject("章节拆分进入正文测试");
    project.currentStep = "chapter-split";
    project.steps["chapter-split"].inputs.storySetting = "夜市逆袭故事，主角林晚和顾玄同行。";
    project.steps["chapter-split"].draft = [
      "## 第1章 夜市重逢",
      "林晚被追兵逼到摊位后方，顾玄出手解围。",
      "**章节二：暗巷反击**",
      "二人进入暗巷，发现追兵背后另有主使。",
    ].join("\n");
    const onProjectChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={onProjectChange}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下一步：正文生成" }));

    expect(onProjectChange).toHaveBeenCalledWith(
      expect.objectContaining({
        currentStep: "prose-generation",
        steps: expect.objectContaining({
          "prose-generation": expect.objectContaining({
            inputs: expect.objectContaining({
              storySetting: "夜市逆袭故事，主角林晚和顾玄同行。",
              chapterNumber: "1",
              chapterOutline: expect.stringContaining("第1章 夜市重逢"),
            }),
          }),
        }),
      }),
    );
  });

  it("treats chapter split as a complete total-chapter output and keeps next prose action in the result area", () => {
    const project = createProject("章节完整输出测试");
    project.currentStep = "chapter-split";
    project.steps["chapter-split"].inputs.storySetting = "夜市逆袭故事。";
    project.steps["chapter-split"].inputs.totalChapters = "20";
    project.steps["chapter-split"].draft = "第1章：开局。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.queryByLabelText(/每批章数/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复制" }));
    expect(screen.getAllByDisplayValue("第1章：开局。").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "下一步：正文生成" })).toBeInTheDocument();
  });

  it("copies the current result with a fallback when clipboard write is unavailable", async () => {
    const project = createProject("复制兜底测试");
    project.currentStep = "chapter-split";
    project.steps["chapter-split"].inputs.storySetting = "夜市逆袭故事。";
    project.steps["chapter-split"].draft = "第1章：开局。";
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(),
    });
    const execCommandMock = vi.spyOn(document, "execCommand").mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(execCommandMock).toHaveBeenCalledWith("copy"));
    expect(screen.getByText("结果已复制")).toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    execCommandMock.mockRestore();
  });

  it("copies the first-step result to the clipboard", async () => {
    const project = createProject("第一步复制结果测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.outline = "许明舟被赶出许家后经营夜市摊。";
    project.steps["outline-expansion"].draft = "第1章：断亲书与破摊";
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("第1章：断亲书与破摊");
    expect(screen.getByText("结果已复制")).toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("reports a copy failure when the fallback command cannot write to the clipboard", async () => {
    const project = createProject("复制失败测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.outline = "许明舟被赶出许家后经营夜市摊。";
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(),
    });
    const execCommandMock = vi.spyOn(document, "execCommand").mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(execCommandMock).toHaveBeenCalledWith("copy"));
    expect(screen.getByText("结果复制失败：浏览器拒绝写入剪贴板")).toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    execCommandMock.mockRestore();
  });

  it("shows generated chapters in the optimize chapter dropdown after continuation adds chapter 2", async () => {
    mockStreamTextOnce("第2章：新摊开张\n许明舟把炉火压稳，第二晚的第一位客人已经站到摊前。");
    const project = createProject("章节下拉测试");
    project.currentStep = "outline-expansion";
    project.steps["outline-expansion"].inputs.outline = "许明舟被赶出许家后经营夜市摊。";
    project.steps["outline-expansion"].inputs.totalChapters = "1";
    project.steps["outline-expansion"].inputs.chapterWords = "2500";
    project.steps["outline-expansion"].draft = "第1章：断亲书\n许明舟签下断亲书，拿着红木箱去了夜市。";

    function Shell() {
      const [currentProject, setCurrentProject] = useState(project);

      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<Shell />);

    fireEvent.click(screen.getByRole("button", { name: "续写下一章" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("option", { name: "第2章" })).toBeInTheDocument();
  });

  it("shows every chapter from mixed chapter split formats in prose generation", () => {
    const project = createProject("完整章节选择测试");
    project.currentStep = "prose-generation";
    project.steps["chapter-split"].inputs.storySetting = "二十章短篇大纲。";
    project.steps["chapter-split"].draft = [
      "第1章：开局。主角被赶出家门。",
      "第2章：夜市。主角遇到同伴。",
      "第3章：追兵。危机逼近。",
      "第4章：反击。主角第一次出手。",
      "第5章：线索。幕后势力露面。",
      "6. 暗巷试探。二人发现第一枚令牌。",
      "7、旧友重逢。旧友提供情报。",
      "08 码头伏击。敌人设下陷阱。",
      "09-雨夜突围。主角负伤逃离。",
      "10）客栈疗伤。同伴关系升温。",
      "11：密信。真相开始浮出。",
      "12 暗线。反派安插内应。",
      "13. 赌局。主角以计破局。",
      "14、围城。敌人全面压迫。",
      "15-断桥。主角被迫选择。",
      "16）反杀。第一阶段胜利。",
      "17：余波。新的危机出现。",
      "18 终局前夜。众人整装待发。",
      "【第19章】决战。主角直面幕后黑手。",
      "第二十章：新生。故事进入新的起点。",
    ].join("\n");

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    const chapterSelect = screen.getByRole("combobox", { name: "选择章节" });
    for (let chapterNumber = 1; chapterNumber <= 20; chapterNumber += 1) {
      expect(within(chapterSelect).getByRole("option", { name: new RegExp(`第${chapterNumber}章`) })).toBeInTheDocument();
    }
  });
});

describe("Workspace asset extraction image generation", () => {
  it("generates multiple images from custom-image reference prompt in step 9", async () => {
    callImageGenerationMock
      .mockResolvedValueOnce("https://img.example.com/custom-1.png")
      .mockResolvedValueOnce("https://img.example.com/custom-2.png")
      .mockResolvedValueOnce("https://img.example.com/custom-3.png");
    const project = createProject("第9项自定义参考图测试");
    project.currentStep = "custom-image";
    project.steps["custom-image"].inputs = {
      referencePrompt: "@参考图片 1 电影宽屏，黑衣刀客站在破碎祭坛，冷月逆光。",
      imageModel: "gemini-3.1-flash-preview",
      imageRatio: "21:9",
      imageResolution: "2K",
      imageCount: "3",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByText("第9项：自定义参考图出图")).toBeInTheDocument();
    expect(screen.queryByText("自定义提示词出图")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(3));
    for (const call of callImageGenerationMock.mock.calls) {
      expect(call[1]).toContain("@参考图片 1 电影宽屏，黑衣刀客站在破碎祭坛，冷月逆光。");
      expect(call[2]).toBe("gemini-3.1-flash-preview");
      expect(call[3]).toBe("21:9");
      expect(call[4]).toBe("2K");
    }
    expect(await screen.findByRole("img", { name: "自定义参考图 custom-image-job-1 生图结果 1" })).toHaveAttribute(
      "src",
      "https://img.example.com/custom-1.png",
    );
    expect(await screen.findByRole("img", { name: "自定义参考图 custom-image-job-1 生图结果 2" })).toHaveAttribute(
      "src",
      "https://img.example.com/custom-2.png",
    );
    expect(await screen.findByRole("img", { name: "自定义参考图 custom-image-job-1 生图结果 3" })).toHaveAttribute(
      "src",
      "https://img.example.com/custom-3.png",
    );
  });

  it("allows submitting a second custom-image generation job while the first is still running", async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    let resolveSecond: (value: string) => void = () => undefined;
    callImageGenerationMock
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const project = createProject("第9项并发任务测试");
    project.currentStep = "custom-image";
    project.steps["custom-image"].inputs = {
      referencePrompt: "电影宽屏，黑衣刀客站在破碎祭坛，冷月逆光。",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
      imageCount: "1",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));
    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("第9项任务列表")).toBeInTheDocument();
    expect(screen.getByText("任务 1")).toBeInTheDocument();
    expect(screen.getByText("任务 2")).toBeInTheDocument();

    resolveFirst("https://img.example.com/custom-job-1.png");
    resolveSecond("https://img.example.com/custom-job-2.png");

    await waitFor(() => expect(screen.getAllByAltText(/自定义参考图 .* 生图结果 1/).length).toBeGreaterThanOrEqual(2));
  });

  it("previews custom-image prompt results from gateway image fields without file extensions", async () => {
    callImageGenerationMock.mockResolvedValue('{"image":"https://cdn.example.com/generated?id=custom&token=secure"}');
    const project = createProject("第9项网关格式测试");
    project.currentStep = "custom-image";
    project.steps["custom-image"].inputs = {
      referencePrompt: "电影宽屏，黑衣刀客站在破碎祭坛，冷月逆光。",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
      imageCount: "1",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成图片" }));

    expect(await screen.findByRole("img", { name: "自定义参考图 custom-image-job-1 生图结果 1" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated?id=custom&token=secure",
    );
  });

  it("downloads generated images through a local blob instead of relying on remote link download", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/asset.png");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Blob(["image-bytes"], { type: "image/png" })));
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:download-url");
    URL.revokeObjectURL = vi.fn();
    const anchorClickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const project = createProject("图片下载测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gemini-3.1-flash-preview",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    await screen.findByRole("img", { name: "林晚 生图结果 1" });
    fireEvent.click(screen.getByRole("button", { name: "下载图片 1" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://img.example.com/asset.png"));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(anchorClickMock).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download-url");

    fetchMock.mockRestore();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    anchorClickMock.mockRestore();
  });

  it("opens a lossless preview on left click and downloads the original image on right click", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/preview.png");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Blob(["image-bytes"], { type: "image/png" })));
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:preview-download-url");
    URL.revokeObjectURL = vi.fn();
    const anchorClickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const project = createProject("图片交互测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gemini-3.1-flash-preview",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    const thumbnail = await screen.findByRole("img", { name: "林晚 生图结果 1" });

    fireEvent.click(thumbnail);
    expect(screen.getByRole("dialog", { name: "图片高清预览" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "高清预览：林晚 生图结果 1" })).toHaveAttribute(
      "src",
      "https://img.example.com/preview.png",
    );
    fireEvent.click(screen.getByRole("button", { name: "预览放大" }));
    expect(screen.getByRole("img", { name: "高清预览：林晚 生图结果 1" })).toHaveStyle({
      transform: "scale(2)",
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "图片高清预览" })).not.toBeInTheDocument());

    fireEvent.click(thumbnail);
    fireEvent.click(screen.getByRole("dialog", { name: "图片高清预览" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "图片高清预览" })).not.toBeInTheDocument());

    fireEvent.contextMenu(thumbnail);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://img.example.com/preview.png"));
    expect(anchorClickMock).toHaveBeenCalled();

    fetchMock.mockRestore();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    anchorClickMock.mockRestore();
  });

  it("imports text documents into the asset extraction source text field", async () => {
    const project = createProject("资产导入测试");
    project.currentStep = "asset-extraction";
    const onProjectChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={onProjectChange}
        onSaveVersion={() => undefined}
      />,
    );

    const file = new File(["顾玄持刀站在破碎祭坛中央。"], "assets.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText("导入文档"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(onProjectChange).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: expect.objectContaining({
            "asset-extraction": expect.objectContaining({
              inputs: expect.objectContaining({
                sourceText: "顾玄持刀站在破碎祭坛中央。",
              }),
            }),
          }),
        }),
      ),
    );
  });

  it("advertises and imports DOCX only for asset extraction", async () => {
    readImportedDocumentMock.mockResolvedValue("第一幕\n\n顾玄进入祭坛。");
    const project = createProject("资产 DOCX 导入测试");
    project.currentStep = "asset-extraction";
    const onProjectChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={onProjectChange}
        onSaveVersion={() => undefined}
      />,
    );

    const input = screen.getByLabelText("导入文档");
    expect(input).toHaveAttribute("accept", expect.stringContaining(".docx"));
    expect(screen.getByText("支持 DOCX / TXT / MD / CSV / JSON / SRT 等文档，也可以拖拽到这里。")).toBeInTheDocument();

    const file = new File([new Uint8Array([80, 75, 3, 4])], "assets.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(readImportedDocumentMock).toHaveBeenCalledWith(file, { allowDocx: true }));
    expect(onProjectChange).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.objectContaining({
          "asset-extraction": expect.objectContaining({
            inputs: expect.objectContaining({ sourceText: "第一幕\n\n顾玄进入祭坛。" }),
          }),
        }),
      }),
    );
  });

  it("keeps other document import controls text-only", () => {
    const project = createProject("小说改剧本 DOCX 范围测试");
    project.currentStep = "novel-to-script";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByLabelText("导入文档")).not.toHaveAttribute("accept", expect.stringContaining(".docx"));
    expect(screen.getByText("支持 TXT / MD / CSV / JSON / SRT 等文本文件，也可以拖拽到这里。")).toBeInTheDocument();
  });

  it("keeps existing asset text when DOCX parsing fails", async () => {
    readImportedDocumentMock.mockRejectedValue(new Error("DOCX 文档解析失败"));
    const project = createProject("资产 DOCX 失败保护测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].inputs.sourceText = "旧内容";

    function StatefulWorkspace() {
      const [currentProject, setCurrentProject] = useState(project);
      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<StatefulWorkspace />);
    const file = new File([new Uint8Array([80, 75, 3, 4])], "broken.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(screen.getByLabelText("导入文档"), { target: { files: [file] } });

    expect(await screen.findByText("导入失败：DOCX 文档解析失败")).toBeInTheDocument();
    expect(screen.getByDisplayValue("旧内容")).toBeInTheDocument();
  });

  it("builds an asset extraction prompt that only asks for the selected asset type", async () => {
    mockStreamTextOnce("【场景】破碎祭坛：月光、石柱、暗红符文。");
    const project = createProject("资产类型提取测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].inputs = {
      sourceText: "顾玄站在破碎祭坛，夜魁手持重斧，暗红符文照亮石柱。",
      assetType: "场景",
      visualStyle: "影视写实古风",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调用 AI 生成" }));

    await waitFor(() => expect(callAiStreamMock).toHaveBeenCalled());
    const extractionPrompt = callAiStreamMock.mock.calls[0][1] as string;
    expect(extractionPrompt).toContain("本次只提取：场景");
    expect(extractionPrompt).toContain("不要输出人物资产");
    expect(extractionPrompt).toContain("不要输出物品资产");
    expect(extractionPrompt).toContain("【场景】场景名称：");
  });

  it("detects multiple extracted assets and generates their images concurrently", async () => {
    callImageGenerationMock
      .mockResolvedValueOnce("https://img.example.com/lin-wan.png")
      .mockResolvedValueOnce("https://img.example.com/gu-xuan.png");
    const project = createProject("多资产并发生图测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【人物】顾玄：黑色战斗长衣，右手持长刀。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市遇见顾玄，顾玄拔刀挡住追兵。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gemini-3.1-flash-preview",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByText("资产批量生图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成 林晚" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成 顾玄" })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "并发生成全部" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成全部" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成全部" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(2));
    const firstPrompt = callImageGenerationMock.mock.calls[0][1] as string;
    const secondPrompt = callImageGenerationMock.mock.calls[1][1] as string;
    expect(firstPrompt).toContain("林晚");
    expect(firstPrompt).not.toContain("顾玄：黑色战斗长衣");
    expect(secondPrompt).toContain("顾玄");
    expect(secondPrompt).not.toContain("林晚：白衬衫");
    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toHaveAttribute(
      "src",
      "https://img.example.com/lin-wan.png",
    );
    expect(await screen.findByRole("img", { name: "顾玄 生图结果 1" })).toHaveAttribute(
      "src",
      "https://img.example.com/gu-xuan.png",
    );
  });

  it("recognizes the five-field character asset card format for batch image generation", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/lin-wan-card.png");
    const project = createProject("人物卡片资产测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = [
      "【人物】林晚：",
      "人物外貌：女性，二十多岁，白衬衫，黑色长发，眼神警觉。",
      "整体风格：3D国漫风格，真人质感，柔和电影光影。",
      "人物的身份：夜市摊主。",
      "图片的结构：左边人物正面近景肖像，右边人物站立三视图。",
    ].join("\n");
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市摊前抬头，看见有人来收摊费。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "生成 林晚" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    const prompt = callImageGenerationMock.mock.calls[0][1] as string;
    expect(prompt).toContain("人物外貌：女性");
    expect(prompt).toContain("整体风格：3D国漫风格");
    expect(prompt).toContain("指定画风：3D国漫风格");
    expect(prompt).toContain("图片的结构：左边人物正面近景肖像");
    expect(prompt).toContain("人物三视图生产参考图");
    expect(prompt).toContain("上方三分之一为正面脸部近景头像");
    expect(prompt).toContain("下方三分之二严格分成三个等比例竖向面板");
    expect(prompt).toContain("颈部以下到脚部的正面、侧面、背面身体视图");
    expect(prompt).toContain("下方三块不出现头部和五官");
    expect(prompt).toContain("双手自然下垂");
    expect(prompt).toContain("双脚完整可见");
    expect(prompt).toContain("不是信息图、不是表格、不是PPT、不是教学海报、不是英文语法图");
    expect(prompt).not.toContain("人物统一后缀：2x2同一人角色设定图");
    expect(prompt).not.toContain("FULL BODY NECK DOWN, NO FACE");
    expect(prompt).not.toContain("Top-left");
    expect(prompt).not.toContain("Hyperrealistic photographic");
    expect(prompt).not.toContain("NOT 3D");
    expect(prompt).not.toContain("完整原文背景：林晚在夜市摊前抬头");
    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toHaveAttribute(
      "src",
      "https://img.example.com/lin-wan-card.png",
    );
  });

  it("clears only asset image previews from the asset generation header action", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/lin-wan.png");
    const project = createProject("资产图片清除测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    const onProjectChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={onProjectChange}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toBeInTheDocument();

    const assetGenerationPanel = screen.getByText("资产批量生图").closest(".asset-generation-panel");
    expect(assetGenerationPanel).not.toBeNull();
    fireEvent.click(within(assetGenerationPanel as HTMLElement).getByRole("button", { name: "清除资产图片" }));

    expect(screen.queryByRole("img", { name: "林晚 生图结果 1" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("【人物】林晚：白衬衫，站在夜市摊前，神情警觉。")).toBeInTheDocument();
    expect(onProjectChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.objectContaining({
          "asset-extraction": expect.objectContaining({ draft: "" }),
        }),
      }),
    );
    expect(screen.getByText("已清空资产生图结果")).toBeInTheDocument();
  });

  it("lets other assets run while one asset image is still generating and keeps custom image out of step 3", async () => {
    callImageGenerationMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(new Promise(() => {}));
    const project = createProject("独立资产生图测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【人物】顾玄：黑色战斗长衣，右手持长刀。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市遇见顾玄，顾玄拔刀挡住追兵。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "生成 林晚" })).toBeDisabled();

    const guXuanButton = screen.getByRole("button", { name: "生成 顾玄" });
    expect(guXuanButton).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "按提示词出图" })).not.toBeInTheDocument();

    fireEvent.click(guXuanButton);

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(2));
  });

  it("does not mark shared image progress complete while another single-asset generation is still running", async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    callImageGenerationMock
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockReturnValueOnce(new Promise(() => {}));
    const project = createProject("单张并发生图进度测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【人物】顾玄：黑色战斗长衣，右手持长刀。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市遇见顾玄，顾玄拔刀挡住追兵。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "生成 顾玄" }));
    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "生成 顾玄" })).toBeDisabled());

    await act(async () => {
      resolveFirst("https://img.example.com/lin-wan.png");
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("生图完成")).not.toBeInTheDocument();
    const progressValue = Number(screen.getByRole("progressbar", { name: "生成进度" }).getAttribute("aria-valuenow"));
    expect(progressValue).toBeLessThan(100);
  });

  it("shows image generation progress that changes while waiting for the model", async () => {
    vi.useFakeTimers();
    callImageGenerationMock.mockReturnValue(new Promise(() => {}));
    const project = createProject("生图进度测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gemini-3.1-flash-preview",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    expect(screen.getByText("模型生图中")).toBeInTheDocument();
    const firstProgress = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));

    await act(async () => {
      vi.advanceTimersByTime(24000);
    });

    const laterProgress = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(laterProgress).toBeGreaterThan(firstProgress);
    expect(laterProgress).toBeGreaterThan(88);
  });

  it("keeps batch image progress below complete until every asset image has finished", async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    callImageGenerationMock
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockReturnValueOnce(new Promise(() => {}));
    const project = createProject("批量生图进度测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【人物】顾玄：黑色战斗长衣，右手持长刀。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市遇见顾玄，顾玄拔刀挡住追兵。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成全部" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveFirst("https://img.example.com/lin-wan.png");
    });

    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toBeInTheDocument();
    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(2));

    expect(screen.getByText("生成 2/2")).toBeInTheDocument();
    expect(screen.queryByText("生图完成")).not.toBeInTheDocument();
    const progressValue = Number(screen.getByRole("progressbar", { name: "生成进度" }).getAttribute("aria-valuenow"));
    expect(progressValue).toBeLessThan(100);
  });

  it("adds generated images to the asset library from the result area", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/asset.png");
    const project = createProject("保存到资产库测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    await screen.findByRole("img", { name: "林晚 生图结果 1" });

    fireEvent.click(screen.getByRole("button", { name: "保存到资产库 1" }));

    expect(screen.getByText("已保存到资产库：林晚")).toBeInTheDocument();
  });

  it("shows a compact asset library with three directories and supports importing images", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "scene.png", { type: "image/png" });
    const project = createProject("资产库测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "资产库" })).toBeInTheDocument();
    expect(screen.queryByText("第六项")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "人物" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "场景" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "物品" })).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: "夜市" } });
    fireEvent.change(screen.getByLabelText("保存目录"), { target: { value: "F:/assets" } });
    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "场景" } });

    const input = screen.getByLabelText("导入图片");
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByLabelText("资产名称 夜市");
    expect(screen.getByText("F:/assets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 夜市" })).toBeInTheDocument();
  });

  it("supports dragging image files directly into the asset library", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "prop.webp", { type: "image/webp" });
    const project = createProject("资产库拖拽测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: "祖传菜刀" } });
    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "物品" } });

    const assetLibraryGrid = screen.getAllByRole("heading", { name: "人物" })[0].closest(".asset-library-columns");
    fireEvent.drop(assetLibraryGrid ?? screen.getByRole("heading", { name: "资产库" }).parentElement!, {
      dataTransfer: { files: [file] },
    });

    await screen.findByRole("button", { name: "删除 祖传菜刀" });
    expect(screen.getByRole("button", { name: "删除 祖传菜刀" })).toBeInTheDocument();
  });

  it("shows only four assets per page and lets the user page through them", async () => {
    const project = createProject("资产库分页测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "人物" } });
    for (let index = 1; index <= 5; index += 1) {
      fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: `人物${index}` } });
      fireEvent.change(screen.getByLabelText("导入图片"), {
        target: {
          files: [new File([new Uint8Array([137, 80, 78, 71])], `p${index}.png`, { type: "image/png" })],
        },
      });
    }

    expect(await screen.findByRole("button", { name: "删除 人物5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 人物2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 人物1" })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "下一页" })[0]);

    expect(await screen.findByRole("button", { name: "删除 人物1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 人物5" })).not.toBeInTheDocument();
  });

  it("filters assets by name across the library", async () => {
    const project = createProject("资产库搜索测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "场景" } });
    fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: "夜市霓虹" } });
    fireEvent.change(screen.getByLabelText("导入图片"), {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71])], "scene.png", { type: "image/png" })],
      },
    });

    fireEvent.change(screen.getByLabelText("搜索名称"), { target: { value: "夜市" } });

    expect(await screen.findByRole("button", { name: "删除 夜市霓虹" })).toBeInTheDocument();
    expect(screen.queryByText("暂无人物资产。")).toBeInTheDocument();
  });

  it("opens the asset library image preview when clicking an image", async () => {
    const project = createProject("资产库预览测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "场景" } });
    fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: "夜市街口" } });
    fireEvent.change(screen.getByLabelText("导入图片"), {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71])], "scene.png", { type: "image/png" })],
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "预览 夜市街口" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "图片高清预览" })).toBeInTheDocument());
    expect(screen.getByRole("img", { name: "高清预览：夜市街口" })).toBeInTheDocument();
  });

  it("closes the asset library preview when clicking the backdrop", async () => {
    const project = createProject("资产库预览关闭测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "场景" } });
    fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: "夜市街口" } });
    fireEvent.change(screen.getByLabelText("导入图片"), {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71])], "scene.png", { type: "image/png" })],
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "预览 夜市街口" }));
    await screen.findByRole("dialog", { name: "图片高清预览" });

    fireEvent.click(screen.getByRole("dialog", { name: "图片高清预览" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "图片高清预览" })).not.toBeInTheDocument());
  });

  it("keeps asset library preview buttons clickable without closing the preview", async () => {
    const project = createProject("资产库预览按钮测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "场景" } });
    fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: "夜市街口" } });
    fireEvent.change(screen.getByLabelText("导入图片"), {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71])], "scene.png", { type: "image/png" })],
      },
    });

    const previewButtons = await screen.findAllByRole("button", { name: "预览 夜市街口" });
    fireEvent.click(previewButtons[0]);
    const preview = await screen.findByRole("dialog", { name: "图片高清预览" });

    fireEvent.click(screen.getByRole("button", { name: "预览放大" }));

    expect(preview).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "高清预览：夜市街口" })).toHaveStyle({ transform: "scale(2)" });
  });

  it("renames asset library items inline and persists the change", async () => {
    const project = createProject("资产库重命名测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "物品" } });
    fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: "旧菜刀" } });
    fireEvent.change(screen.getByLabelText("导入图片"), {
      target: {
        files: [new File([new Uint8Array([137, 80, 78, 71])], "prop.png", { type: "image/png" })],
      },
    });

    const nameInput = await screen.findByLabelText("资产名称 旧菜刀");
    fireEvent.change(nameInput, { target: { value: "新菜刀" } });
    fireEvent.blur(nameInput);

    expect(await screen.findByLabelText("资产名称 新菜刀")).toBeInTheDocument();
    expect(screen.queryByText("旧菜刀")).not.toBeInTheDocument();
  });

  it("resets asset library pagination when searching by name", async () => {
    const project = createProject("资产库搜索翻页测试");
    project.currentStep = "asset-library";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("导入类型"), { target: { value: "人物" } });
    for (let index = 1; index <= 5; index += 1) {
      fireEvent.change(screen.getByLabelText("资产名称"), { target: { value: `角色${index}` } });
      fireEvent.change(screen.getByLabelText("导入图片"), {
        target: {
          files: [new File([new Uint8Array([137, 80, 78, 71])], `c${index}.png`, { type: "image/png" })],
        },
      });
    }

    fireEvent.click(screen.getAllByRole("button", { name: "下一页" })[0]);
    expect(await screen.findByRole("button", { name: "删除 角色1" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("搜索名称"), { target: { value: "角色5" } });

    expect(await screen.findByRole("button", { name: "删除 角色5" })).toBeInTheDocument();
    expect(screen.getAllByText("第 1 / 1 页")).toHaveLength(3);
  });

  it("clears the current result draft and image previews from the result actions", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/asset.png");
    const project = createProject("清除结果测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gemini-3.1-flash-preview",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    const onProjectChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={onProjectChange}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "一键清除" }));

    expect(screen.queryByRole("img", { name: "林晚 生图结果 1" })).not.toBeInTheDocument();
    expect(onProjectChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        steps: expect.objectContaining({
          "asset-extraction": expect.objectContaining({ draft: "" }),
        }),
      }),
    );
    expect(screen.getByText("已清空当前结果区")).toBeInTheDocument();
  });

  it("deletes one generated image without clearing the other image results", async () => {
    callImageGenerationMock
      .mockResolvedValueOnce("https://img.example.com/lin-wan.png")
      .mockResolvedValueOnce("https://img.example.com/gu-xuan.png");
    const project = createProject("单图删除测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【人物】顾玄：黑色战斗长衣，右手持长刀。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市遇见顾玄。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成全部" }));

    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "顾玄 生图结果 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除图片 1" }));

    expect(screen.queryByRole("img", { name: "林晚 生图结果 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "顾玄 生图结果 1" })).toBeInTheDocument();
    expect(screen.getByText("已删除图片")).toBeInTheDocument();
  });

  it("revokes only the desktop drag URL owned by removed generated images", async () => {
    callImageGenerationMock
      .mockResolvedValueOnce("data:image/png;base64,bGluLXdhbg==")
      .mockResolvedValueOnce("data:image/png;base64,Z3UteHVhbg==");
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValueOnce("blob:lin-wan").mockReturnValueOnce("blob:gu-xuan");
    URL.revokeObjectURL = vi.fn();
    const project = createProject("单图拖拽地址释放测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【人物】顾玄：黑色战斗长衣，右手持长刀。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市遇见顾玄。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    try {
      render(
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={project}
          onAiSettingsChange={() => undefined}
          onProjectChange={() => undefined}
          onSaveVersion={() => undefined}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "生成全部" }));
      await screen.findByRole("img", { name: "林晚 生图结果 1" });
      await screen.findByRole("img", { name: "顾玄 生图结果 1" });
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));

      fireEvent.click(screen.getByRole("button", { name: "删除图片 1" }));
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:lin-wan"));
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:gu-xuan");

      fireEvent.click(screen.getByRole("button", { name: "清除资产图片" }));
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:gu-xuan"));
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
    }
  });

  it("deletes one extracted asset from the result draft and removes its generated images", async () => {
    callImageGenerationMock
      .mockResolvedValueOnce("https://img.example.com/lin-wan.png")
      .mockResolvedValueOnce("https://img.example.com/gu-xuan.png");
    const project = createProject("资产删除测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【人物】顾玄：黑色战斗长衣，右手持长刀。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚在夜市遇见顾玄。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    const onProjectChange = vi.fn();

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={onProjectChange}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成全部" }));
    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "顾玄 生图结果 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除 林晚" }));

    expect(onProjectChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        steps: expect.objectContaining({
          "asset-extraction": expect.objectContaining({
            draft: "【人物】顾玄：黑色战斗长衣，右手持长刀。",
          }),
        }),
      }),
    );
    expect(screen.queryByRole("img", { name: "林晚 生图结果 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "顾玄 生图结果 1" })).toBeInTheDocument();
    expect(screen.getByText("已删除资产：林晚")).toBeInTheDocument();
  });

  it("keeps the old custom image prompt controls out of asset extraction", () => {
    const project = createProject("第3项不显示自定义出图测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("前置提示词")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清空提示词" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "按提示词出图" })).not.toBeInTheDocument();
    expect(screen.getByText("林晚")).toBeInTheDocument();
  });

  it("clears the custom-image workspace without touching its prompt", () => {
    const project = createProject("第9项清空测试");
    project.currentStep = "custom-image";
    project.steps["custom-image"].inputs = {
      referencePrompt: "@参考图片 1 夜市摊前的白衬衫少女。",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
      imageCount: "1",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "一键清空" }));

    expect(screen.getByLabelText("主提示词")).toHaveValue("@参考图片 1 夜市摊前的白衬衫少女。");
    expect(screen.getByText("已清空第9项参考图片和生图结果")).toBeInTheDocument();
  });

  it("hides the generic result paste area in custom-image step", () => {
    const project = createProject("第9项隐藏通用结果区测试");
    project.currentStep = "custom-image";

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.queryByText("当前步骤")).not.toBeInTheDocument();
    expect(screen.queryByText("生成结果 / 外部粘贴区")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("把 AI 输出粘贴到这里，或点击“调用 AI 生成”。确认后点击“保存结果”。")).not.toBeInTheDocument();
    expect(screen.getByText("第9项：自定义参考图出图")).toBeInTheDocument();
    expect(screen.queryByText("生成结果 / 外部粘贴区")).not.toBeInTheDocument();
  });

  it("renders asset dropdowns, calls the selected image model and ratio, then previews the image", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/asset.png");
    const project = createProject("资产生图测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gemini-3.1-flash-preview",
      imageRatio: "21:9",
      imageResolution: "2K",
    };

    render(
      <Workspace
        aiSettings={{
          endpoint: "https://timeai.chat/v1",
          apiKey: "sk-test",
          model: "gpt-5.5",
          geminiImageEndpoint: "https://gemini.example/v1",
          geminiImageApiKey: "sk-gemini",
          geminiImageModel: "gemini-3.1-flash-preview",
        }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox", { name: /提取类型/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "人物" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "场景" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "物品" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /画风锚点/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /生图模型/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /生图比例/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /分辨率/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "16:9" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "9:16" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "21:9" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1K" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2K" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalled());
    const imagePrompt = callImageGenerationMock.mock.calls[0][1] as string;
    expect(imagePrompt).toContain("白衬衫，站在夜市摊前");
    expect(imagePrompt).toContain("像服装设计总监一样");
    expect(imagePrompt).toContain("不要把所有人物默认生成西装");
    expect(imagePrompt).toContain("不得撞脸当红网红、明星、艺人、博主");
    expect(imagePrompt).not.toContain("完整原文背景：林晚穿白衬衫站在夜市摊前");
    expect(imagePrompt).toContain("林晚");
    expect(imagePrompt).toContain("人物");
    expect(imagePrompt).toContain("3D国漫风格");
    expect(imagePrompt).toContain("21:9");
    expect(imagePrompt).toContain("2K");
    expect(imagePrompt).not.toContain("# Role");
    expect(imagePrompt).not.toContain("输出格式");
    expect(imagePrompt).not.toContain("<source_text>");
    expect(callImageGenerationMock).toHaveBeenCalledWith(
      {
        endpoint: "https://gemini.example/v1",
        apiKey: "sk-gemini",
        model: "gemini-3.1-flash-preview",
        geminiImageEndpoint: "https://gemini.example/v1",
        geminiImageApiKey: "sk-gemini",
        geminiImageModel: "gemini-3.1-flash-preview",
      },
      imagePrompt,
      "gemini-3.1-flash-preview",
      "21:9",
      "2K",
      undefined,
    );
    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toHaveAttribute(
      "src",
      "https://img.example.com/asset.png",
    );
    expect(screen.getByRole("button", { name: "下载图片 1" })).toBeInTheDocument();
  });

  it("keeps the selected asset image model during normal 2K image generation", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/pro-asset.png");
    const project = createProject("Gemini Pro 生图测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】顾玄：黑色战斗长衣，右手持长刀，站在破碎祭坛中央。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "顾玄站在破碎祭坛中央，右手持长刀。",
      assetType: "人物",
      visualStyle: "影视写实古风",
      imageModel: "gemini-3-pro-image-preview",
      imageRatio: "16:9",
      imageResolution: "2K",
    };

    render(
      <Workspace
        aiSettings={{
          endpoint: "https://timeai.chat/v1",
          apiKey: "sk-test",
          model: "gpt-5.5",
          geminiImageEndpoint: "https://gemini.example/v1",
          geminiImageApiKey: "sk-gemini",
          geminiImageModel: "gemini-3.1-flash-preview",
        }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 顾玄" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalled());
    expect(callImageGenerationMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        endpoint: "https://gemini.example/v1",
        apiKey: "sk-gemini",
        model: "gemini-3-pro-image-preview",
      }),
    );
    expect(callImageGenerationMock.mock.calls[0][2]).toBe("gemini-3-pro-image-preview");
  });

  it("keeps user-selected 4K asset image settings for gpt-image-2", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/gpt-image.png");
    const project = createProject("资产gpt-image分辨率保护测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前，神情警觉。",
      assetType: "人物",
      visualStyle: "影视写实现代",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "4K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    const resolutionSelect = screen.getByRole("combobox", { name: "分辨率" }) as HTMLSelectElement;
    expect(resolutionSelect.value).toBe("4K");
    expect(within(resolutionSelect).getByRole("option", { name: "2K" })).toBeInTheDocument();
    expect(within(resolutionSelect).getByRole("option", { name: "4K" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(callImageGenerationMock.mock.calls[0][4]).toBe("4K");
  });

  it("normalizes removed gpt-image-2-all asset settings before image generation", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/gpt-image.png");
    const project = createProject("资产旧模型清理测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2-all",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    const imageModelSelect = screen.getByRole("combobox", { name: "生图模型" }) as HTMLSelectElement;
    expect(imageModelSelect.value).toBe("gpt-image-2");

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(callImageGenerationMock.mock.calls[0][2]).toBe("gpt-image-2");
  });

  it("lets the user edit extracted character info before image generation", async () => {
    callImageGenerationMock.mockResolvedValue("https://img.example.com/edited-asset.png");
    const project = createProject("人物信息可编辑测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。\n【场景】夜市：霓虹灯，摊位，冷雨。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前，神情警觉。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    function Shell() {
      const [currentProject, setCurrentProject] = useState(project);

      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    render(<Shell />);

    fireEvent.change(screen.getByLabelText("林晚 人物信息"), {
      target: { value: "女性，黑色风衣" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));

    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    const prompt = callImageGenerationMock.mock.calls[0][1] as string;
    expect(prompt).toContain("女性，黑色风衣");
    expect(prompt).toContain("人物统一后缀：人物三视图生产参考图，纯白背景。");
    expect(prompt).toContain("上方三分之一为正面脸部近景头像");
    expect(prompt).toContain("下方三分之二严格分成三个等比例竖向面板");
    expect(prompt).toContain("颈部以下到脚部的正面、侧面、背面身体视图");
    expect(prompt).toContain("下方三块不出现头部和五官");
    expect(prompt).toContain("双手自然下垂");
    expect(prompt).toContain("双脚完整可见");
    expect(prompt).toContain("优先遵循“该资产的提取内容”中的人物外貌、整体风格、人物身份和图片结构");
    expect(prompt).not.toContain("人物统一后缀：2x2同一人角色设定图");
    expect(prompt).not.toContain("FULL BODY NECK DOWN, NO FACE");
    expect(prompt).not.toContain("Top-left");
    expect(prompt).toContain("不要表格，不要信息图，不要教育海报，不要英文单词排版");
    expect(await screen.findByRole("img", { name: "林晚 生图结果 1" })).toHaveAttribute(
      "src",
      "https://img.example.com/edited-asset.png",
    );
  });

  it("does not show 2K or 4K upscale controls in image result cards or preview dialog", async () => {
    callImageGenerationMock.mockResolvedValueOnce("https://img.example.com/preview.png");
    const project = createProject("预览内高清放大测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前，神情警觉。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚穿白衬衫站在夜市摊前。",
      assetType: "人物",
      visualStyle: "影视写实风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    const originalImage = await screen.findByRole("img", { name: "林晚 生图结果 1" });
    expect(screen.queryByRole("button", { name: "2K放大" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "4K放大" })).not.toBeInTheDocument();

    fireEvent.click(originalImage);
    expect(await screen.findByRole("dialog", { name: "图片高清预览" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2K高清" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "4K高清" })).not.toBeInTheDocument();
    expect(callImageGenerationMock).toHaveBeenCalledTimes(1);
  });

  it("marks generated asset images as draggable for ZZDH empty image slots", async () => {
    const imageSrc = "data:image/png;base64,aGVsbG8=";
    callImageGenerationMock.mockResolvedValue(imageSrc);
    const project = createProject("拖拽图片测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    const image = await screen.findByRole("img", { name: "林晚 生图结果 1" });
    expect(image).toHaveAttribute("draggable", "true");

    const dataTransfer = {
      effectAllowed: "",
      items: { add: vi.fn() },
      setData: vi.fn(),
    };
    fireEvent.dragStart(image, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "application/x-xiaotu-asset-image",
      expect.stringContaining('"assetName":"林晚"'),
    );
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "图片：拖拽图片测试-剧本资产提取-林晚-image-1.png");
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      "DownloadURL",
      "image/png:拖拽图片测试-剧本资产提取-林晚-image-1.png:拖拽图片测试-剧本资产提取-林晚-image-1.png",
    );
    expect(dataTransfer.setData).not.toHaveBeenCalledWith("text/uri-list", imageSrc);
    expect(dataTransfer.items.add).not.toHaveBeenCalled();
  });

  it("drags base64 generated images from thumbnails and previews to the desktop as PNG files", async () => {
    const imageSrc = "data:image/png;base64,aGVsbG8=";
    callImageGenerationMock.mockResolvedValue(imageSrc);
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:generated-image-drag");
    URL.revokeObjectURL = vi.fn();
    const project = createProject("拖拽图片测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    try {
      render(
        <StrictMode>
          <Workspace
            aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
            project={project}
            onAiSettingsChange={() => undefined}
            onProjectChange={() => undefined}
            onSaveVersion={() => undefined}
          />
        </StrictMode>,
      );

      fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
      const thumbnail = await screen.findByRole("img", { name: "林晚 生图结果 1" });
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));

      const thumbnailTransfer = {
        effectAllowed: "",
        items: { add: vi.fn() },
        setData: vi.fn(),
      };
      fireEvent.dragStart(thumbnail, { dataTransfer: thumbnailTransfer });

      expect(thumbnailTransfer.setData).toHaveBeenCalledWith(
        "DownloadURL",
        "image/png:拖拽图片测试-剧本资产提取-林晚-image-1.png:blob:generated-image-drag",
      );
      expect(thumbnailTransfer.setData).toHaveBeenCalledWith("text/uri-list", "blob:generated-image-drag");
      expect(thumbnailTransfer.setData).toHaveBeenCalledWith(
        "application/x-xiaotu-asset-image",
        expect.stringContaining('"assetName":"林晚"'),
      );

      fireEvent.click(thumbnail);
      const preview = await screen.findByRole("img", { name: "高清预览：林晚 生图结果 1" });
      expect(preview).toHaveAttribute("draggable", "true");
      const previewTransfer = {
        effectAllowed: "",
        items: { add: vi.fn() },
        setData: vi.fn(),
      };
      fireEvent.dragStart(preview, { dataTransfer: previewTransfer });

      expect(previewTransfer.setData).toHaveBeenCalledWith(
        "DownloadURL",
        "image/png:拖拽图片测试-剧本资产提取-林晚-image-1.png:blob:generated-image-drag",
      );
      expect(previewTransfer.setData).toHaveBeenCalledWith("text/uri-list", "blob:generated-image-drag");
      expect(previewTransfer.setData).toHaveBeenCalledWith(
        "application/x-xiaotu-asset-image",
        expect.stringContaining('"assetName":"林晚"'),
      );
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
    }
  });

  it("keeps large data-url image drags lightweight so previews remain clickable", async () => {
    const imageSrc = `data:image/png;base64,${"A".repeat(2_100_000)}`;
    callImageGenerationMock.mockResolvedValue(imageSrc);
    const project = createProject("大图拖拽预览测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };
    const originalAtob = globalThis.atob;
    globalThis.atob = vi.fn(() => {
      throw new Error("large data url should not be decoded during drag");
    });

    try {
      render(
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={project}
          onAiSettingsChange={() => undefined}
          onProjectChange={() => undefined}
          onSaveVersion={() => undefined}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
      const image = await screen.findByRole("img", { name: "林晚 生图结果 1" });
      const dataTransfer = {
        effectAllowed: "",
        items: { add: vi.fn() },
        setData: vi.fn(),
      };
      fireEvent.dragStart(image, { dataTransfer });

      expect(globalThis.atob).not.toHaveBeenCalled();
      expect(dataTransfer.items.add).not.toHaveBeenCalled();
      expect(dataTransfer.setData).toHaveBeenCalledWith(
        "application/x-xiaotu-asset-image",
        expect.stringContaining('"filename":"大图拖拽预览测试-剧本资产提取-林晚-image-1.png"'),
      );
      expect(dataTransfer.setData).not.toHaveBeenCalledWith("text/uri-list", imageSrc);
      expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "图片：大图拖拽预览测试-剧本资产提取-林晚-image-1.png");
      expect(dataTransfer.setData).toHaveBeenCalledWith(
        "DownloadURL",
        "image/png:大图拖拽预览测试-剧本资产提取-林晚-image-1.png:大图拖拽预览测试-剧本资产提取-林晚-image-1.png",
      );
      fireEvent.click(image);
      expect(screen.getByRole("dialog", { name: "图片高清预览" })).toBeInTheDocument();
    } finally {
      globalThis.atob = originalAtob;
    }
  });

  it("recognizes multiple character output formats from asset extraction", async () => {
    const project = createProject("人物格式识别测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = [
      "1. 【人物】林晚：夜市摊前，神情警觉。",
      "人物名称：刘婶：豆腐坊摊主，说话直接。",
      "角色3：老赵：卤味摊主，动作谨慎。",
      "配角：陈伯：街坊老人，站在摊位旁。",
    ].join("\n");
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚、刘婶、老赵、陈伯都出现在夜市。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    expect(screen.getByText("林晚")).toBeInTheDocument();
    expect(screen.getByText("刘婶")).toBeInTheDocument();
    expect(screen.getByText("老赵")).toBeInTheDocument();
    expect(screen.getByText("陈伯")).toBeInTheDocument();
  });

  it("keeps large data-url previews on the original source without refetching them", async () => {
    const imageSrc = `data:image/png;base64,${"A".repeat(2_100_000)}`;
    callImageGenerationMock.mockResolvedValue(imageSrc);
    const project = createProject("大图预览直显测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，站在夜市摊前。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 林晚" }));
    const image = await screen.findByRole("img", { name: "林晚 生图结果 1" });
    fireEvent.click(image);

    expect(await screen.findByRole("dialog", { name: "图片高清预览" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "高清预览：林晚 生图结果 1" })).toHaveAttribute("src", imageSrc);
  });

  it("sends edited extracted assets to ZZDH entity managers", async () => {
    sendAssetsToZzdhMock.mockResolvedValue({
      created: [{ name: "林晚", type: "人物", description: "女性，黑色风衣", entityType: "character", entityId: "char-1" }],
      skippedExisting: [],
      failed: [],
    });
    const project = createProject("资产发送测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫。\n【场景】夜市：霓虹灯。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "林晚站在夜市摊前。",
      assetType: "人物",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={project}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("林晚 人物信息"), {
      target: { value: "女性，黑色风衣" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送到字字动画" }));

    await waitFor(() => expect(sendAssetsToZzdhMock).toHaveBeenCalledTimes(1));
    expect(sendAssetsToZzdhMock).toHaveBeenCalledWith([
      expect.objectContaining({ name: "林晚", type: "人物", description: "女性，黑色风衣" }),
    ]);
    expect(await screen.findByText("已发送到字字动画：新建 1 个，跳过同名 0 个")).toBeInTheDocument();
  });

  it("lets the user edit extracted scene and prop info before image generation", async () => {
    callImageGenerationMock
      .mockResolvedValueOnce("https://img.example.com/scene.png")
      .mockResolvedValueOnce("https://img.example.com/prop.png");
    const project = createProject("场景物品可编辑测试");
    project.currentStep = "asset-extraction";
    project.steps["asset-extraction"].draft =
      "【场景】夜市：霓虹灯，摊位，冷雨。\n【物品】长刀：黑色刀柄，银白刀刃。";
    project.steps["asset-extraction"].inputs = {
      sourceText: "夜市里有霓虹灯和一把长刀。",
      assetType: "场景",
      visualStyle: "3D国漫风格",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    function Shell({ initialProject }: { initialProject: typeof project }) {
      const [currentProject, setCurrentProject] = useState(initialProject);

      return (
        <Workspace
          aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
          project={currentProject}
          onAiSettingsChange={() => undefined}
          onProjectChange={setCurrentProject}
          onSaveVersion={() => undefined}
        />
      );
    }

    const { unmount } = render(<Shell initialProject={project} />);

    fireEvent.change(screen.getByLabelText("夜市 场景信息"), {
      target: { value: "夜景霓虹，雨后反光地面" },
    });
    await waitFor(() => expect(screen.getByLabelText("夜市 场景信息")).toHaveValue("夜景霓虹，雨后反光地面"));

    fireEvent.click(screen.getByRole("button", { name: "生成 夜市" }));
    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("夜景霓虹，雨后反光地面");
    unmount();

    const propProject = createProject("物品可编辑测试");
    propProject.currentStep = "asset-extraction";
    propProject.steps["asset-extraction"].draft = project.steps["asset-extraction"].draft;
    propProject.steps["asset-extraction"].inputs = {
      ...project.steps["asset-extraction"].inputs,
      assetType: "物品",
    };

    render(<Shell initialProject={propProject} />);

    fireEvent.change(screen.getByLabelText("长刀 物品信息"), {
      target: { value: "金属长刀，刀身反光" },
    });
    await waitFor(() => expect(screen.getByLabelText("长刀 物品信息")).toHaveValue("金属长刀，刀身反光"));
    fireEvent.click(screen.getByRole("button", { name: "生成 长刀" }));
    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(2));
    expect(callImageGenerationMock.mock.calls[1][1]).toContain("金属长刀，刀身反光");
  });

  it("adds same-scene four-angle and white-background product constraints to image prompts", async () => {
    callImageGenerationMock
      .mockResolvedValueOnce("https://img.example.com/scene.png")
      .mockResolvedValueOnce("https://img.example.com/prop.png");
    const sceneProject = createProject("场景物品出图约束测试");
    sceneProject.currentStep = "asset-extraction";
    sceneProject.steps["asset-extraction"].draft = "【场景】夜市：当前剧情时间：夜晚；同场景四视角设定图；核心主体：旧码头夜市。";
    sceneProject.steps["asset-extraction"].inputs = {
      sourceText: "夜晚，旧码头夜市冷雨未停，摊位灯牌亮起。",
      assetType: "场景",
      visualStyle: "影视写实现代",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    const { rerender } = render(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={sceneProject}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 夜市" }));
    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(1));
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("同场景四视角设定图");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("四个画面都必须展示整体场景");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("1.左上：正面全景");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("2.右上：侧向全景");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("3.左下：俯视全景");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("4.右下：反向全景");
    expect(callImageGenerationMock.mock.calls[0][1]).toContain("不要只拍单个物品");

    const propProject = createProject("物品出图约束测试");
    propProject.currentStep = "asset-extraction";
    propProject.steps["asset-extraction"].draft = "【物品】长刀：黑色刀柄，银白刀刃。";
    propProject.steps["asset-extraction"].inputs = {
      sourceText: "长刀放在案台上。",
      assetType: "物品",
      visualStyle: "影视写实现代",
      imageModel: "gpt-image-2",
      imageRatio: "16:9",
      imageResolution: "1K",
    };

    rerender(
      <Workspace
        aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
        project={propProject}
        onAiSettingsChange={() => undefined}
        onProjectChange={() => undefined}
        onSaveVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成 长刀" }));
    await waitFor(() => expect(callImageGenerationMock).toHaveBeenCalledTimes(2));
    expect(callImageGenerationMock.mock.calls[1][1]).toContain("电商纯白色背景强约束");
    expect(callImageGenerationMock.mock.calls[1][1]).toContain("纯白背景");
    expect(callImageGenerationMock.mock.calls[1][1]).toContain("不要人物");
    expect(callImageGenerationMock.mock.calls[1][1]).toContain("不要场景环境");
  });
});


