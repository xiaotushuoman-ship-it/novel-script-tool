import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { addVersion, createProject } from "../domain/projects";
import { SidePanel } from "./SidePanel";

describe("SidePanel project markdown actions", () => {
  it("shows project markdown copy and download actions by default", () => {
    const project = addVersion(createProject("导出显示测试"), "outline-expansion", "第一版内容");

    render(<SidePanel project={project} onDeleteVersion={() => undefined} onRestoreVersion={() => undefined} />);

    expect(screen.getByText("历史版本")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制项目 Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载 Markdown" })).toBeInTheDocument();
  });

  it("copies project markdown", () => {
    const clipboardWriteMock = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWriteMock,
      },
    });
    const project = addVersion(createProject("复制导出测试"), "outline-expansion", "第一版内容");

    render(<SidePanel project={project} onDeleteVersion={() => undefined} onRestoreVersion={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "复制项目 Markdown" }));

    expect(clipboardWriteMock).toHaveBeenCalledWith(expect.stringContaining("复制导出测试"));
  });
});
