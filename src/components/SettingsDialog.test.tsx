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
});
