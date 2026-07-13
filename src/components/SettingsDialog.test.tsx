import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_SETTINGS } from "../domain/aiSettings";
import { SettingsDialog } from "./SettingsDialog";

describe("SettingsDialog", () => {
  it("shows the default TimeAI endpoint and opens registration from a hidden link button", () => {
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <SettingsDialog
        open
        settings={DEFAULT_AI_SETTINGS}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getAllByDisplayValue("https://timeai.chat/v1").length).toBeGreaterThan(0);
    expect(screen.queryByText("https://timeai.chat/register?aff=k2gn")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    expect(openMock).toHaveBeenCalledWith(
      "https://timeai.chat/register?aff=k2gn",
      "_blank",
      "noopener,noreferrer",
    );

    openMock.mockRestore();
  });

  it("keeps the gemini fallback channel visible while collapsing extra API keys into advanced settings", () => {
    render(
      <SettingsDialog
        open
        settings={DEFAULT_AI_SETTINGS}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("Gemini 生图备用通道")).toBeInTheDocument();
    expect(screen.getByText("高级设置").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("主 API Key")).toBeInTheDocument();
    expect(screen.getByText("当前模型分组")).toBeInTheDocument();
  });

  it("includes the Gemini flash lite image model in fallback image model options", () => {
    render(
      <SettingsDialog
        open
        settings={DEFAULT_AI_SETTINGS}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole("option", { name: "gemini-3.1-flash-lite-image" })).toBeInTheDocument();
  });

  it("includes gpt-5.6-sol while keeping gpt-5.6-sol selected by default", () => {
    render(
      <SettingsDialog
        open
        settings={DEFAULT_AI_SETTINGS}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole("option", { name: "gpt-5.6-sol" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "模型名" })).toHaveValue("gpt-5.5");
  });

  it("shows the Gemini text API key directly below the primary API key", () => {
    render(
      <SettingsDialog
        open
        settings={DEFAULT_AI_SETTINGS}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    const primaryKey = screen.getByText("主 API Key").closest("label")?.querySelector("input");
    const geminiTextKey = screen.getByLabelText("Gemini 文本 API Key");

    expect(primaryKey).not.toBeNull();
    expect(primaryKey!.compareDocumentPosition(geminiTextKey) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("updates the dedicated Gemini text API key", () => {
    const onChange = vi.fn();
    render(
      <SettingsDialog
        open
        settings={DEFAULT_AI_SETTINGS}
        onChange={onChange}
        onClose={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("Gemini 文本 API Key"), {
      target: { value: "sk-gemini-text" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        geminiTextApiKey: "sk-gemini-text",
      }),
    );
  });

  it("selects gemini-3.5-flash without creating a secondary mapping", () => {
    const onChange = vi.fn();
    render(
      <SettingsDialog
        open
        settings={{
          ...DEFAULT_AI_SETTINGS,
          modelApiKeySources: { "deepseek-v4-pro": "secondary" },
        }}
        onChange={onChange}
        onClose={() => undefined}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "模型名" }), {
      target: { value: "gemini-3.5-flash" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.5-flash",
        modelApiKeySources: { "deepseek-v4-pro": "secondary" },
      }),
    );
  });
});
