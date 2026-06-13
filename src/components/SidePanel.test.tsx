import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { addVersion, createProject } from "../domain/projects";
import { SidePanel } from "./SidePanel";

describe("SidePanel owner export actions", () => {
  it("hides project markdown copy and download actions by default", () => {
    const project = addVersion(createProject("隐藏导出测试"), "outline-expansion", "第一版内容");

    render(<SidePanel project={project} onDeleteVersion={() => undefined} onRestoreVersion={() => undefined} />);

    expect(screen.getByText("历史版本")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制项目 Markdown" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载 Markdown" })).not.toBeInTheDocument();
  });

  it("shows project markdown actions in owner export mode", () => {
    const project = addVersion(createProject("本人导出测试"), "outline-expansion", "第一版内容");

    render(
      <SidePanel
        allowOwnerExports
        project={project}
        onDeleteVersion={() => undefined}
        onRestoreVersion={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "复制项目 Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载 Markdown" })).toBeInTheDocument();
  });

  it("copies markdown only when owner export mode is enabled", () => {
    const clipboardWriteMock = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWriteMock,
      },
    });
    const project = addVersion(createProject("复制导出测试"), "outline-expansion", "第一版内容");

    render(
      <SidePanel
        allowOwnerExports
        project={project}
        onDeleteVersion={() => undefined}
        onRestoreVersion={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制项目 Markdown" }));

    expect(clipboardWriteMock).toHaveBeenCalledWith(expect.stringContaining("复制导出测试"));
  });
});
