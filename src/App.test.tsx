import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the workflow and result actions", () => {
    render(<App />);
    expect(screen.getAllByText("一键小说正文生成").length).toBeGreaterThan(0);
    expect(screen.queryByText("章节拆分")).not.toBeInTheDocument();
    expect(screen.queryByText("正文生成")).not.toBeInTheDocument();
    expect(screen.getAllByText("小说改剧本").length).toBeGreaterThan(0);
    expect(screen.getAllByText("剧本资产提取").length).toBeGreaterThan(0);
    expect(screen.getByText("生成结果 / 外部粘贴区")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制提示词" })).toBeInTheDocument();
  });
});
