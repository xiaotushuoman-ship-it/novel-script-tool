import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { addVersion, createProject } from "../domain/projects";
import { FlowNav } from "./FlowNav";

describe("FlowNav", () => {
  it("shows step production status badges", () => {
    let project = createProject("流程状态测试");
    project.steps["outline-expansion"].draft = "大纲扩写草稿";
    project = addVersion(project, "novel-to-script", "剧本版本");
    const onSelectStep = vi.fn();

    render(
      <FlowNav
        activeProjectId={project.id}
        activeStep={project.currentStep}
        projects={[project]}
        onCreateProject={() => undefined}
        onOpenSettings={() => undefined}
        onSelectProject={() => undefined}
        onSelectStep={onSelectStep}
      />,
    );

    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(screen.getAllByText("空白").length).toBeGreaterThan(0);
    expect(screen.getByText("一键小说正文生成")).toBeInTheDocument();
    expect(screen.queryByText("章节拆分")).not.toBeInTheDocument();
    expect(screen.queryByText("正文生成")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /小说改剧本/ }));
    expect(onSelectStep).toHaveBeenCalledWith("novel-to-script");
  });

  it("shows the one-click script polish entry as step 10", () => {
    const project = createProject("洗稿导航测试");
    const onSelectStep = vi.fn();

    render(
      <FlowNav
        activeProjectId={project.id}
        activeStep={project.currentStep}
        projects={[project]}
        onCreateProject={() => undefined}
        onOpenSettings={() => undefined}
        onSelectProject={() => undefined}
        onSelectStep={onSelectStep}
      />,
    );

    const button = screen.getByRole("button", { name: /剧本一键洗稿/ });
    expect(button).toHaveTextContent("10");

    fireEvent.click(button);
    expect(onSelectStep).toHaveBeenCalledWith("script-polish");
  });
});
