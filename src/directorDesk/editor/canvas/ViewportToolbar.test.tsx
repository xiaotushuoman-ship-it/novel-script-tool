import { fireEvent, render, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";
import { ViewportToolbar } from "./ViewportToolbar";

function resetDirectorStore() {
  useDirectorStore.setState({
    ...createInitialDirectorState(),
    clipboard: [],
    clipboardPasteCount: 0,
    undoStack: [],
    undoBatchDepth: 0,
    undoBatchSnapshot: null,
    undoBatchHasTrackedChanges: false,
  });
}

describe("ViewportToolbar", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDirectorStore();
  });

  it("renders the viewport tool group inside a dedicated horizontal scroll shell", () => {
    const { container, unmount } = render(<ViewportToolbar />);
    const toolbarShell = container.querySelector(".viewport-toolbar-shell");
    const toolbar = container.querySelector(".viewport-toolbar") as HTMLDivElement | null;
    expect(toolbarShell).not.toBeNull();
    expect(toolbar).not.toBeNull();
    expect(toolbarShell?.contains(toolbar as Node)).toBe(true);

    unmount();
  });

  it("keeps the character menu open for shadow DOM retargeted pointerdown events until the body type click adds a character", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.appendChild(container);

    const { unmount } = render(<ViewportToolbar />, { container });
    const shadowScreen = within(container);

    fireEvent.click(shadowScreen.getByRole("button", { name: "添加角色" }));
    const menu = shadowScreen.getByRole("menu", { name: "选择角色体型" });
    const menuItem = shadowScreen.getByRole("menuitem", { name: "男性素体" });
    const initialCharacterCount = useDirectorStore
      .getState()
      .project.objects.filter((item) => item.kind === "character").length;

    fireEvent.pointerDown(menuItem);

    expect(container.contains(menu)).toBe(true);

    fireEvent.click(menuItem);

    const state = useDirectorStore.getState();
    const characters = state.project.objects.filter((item) => item.kind === "character");
    expect(characters).toHaveLength(initialCharacterCount + 1);
    expect(state.selectedObjectId).toMatch(/^char_preset_/);
    expect(shadowScreen.queryByRole("menu", { name: "选择角色体型" })).not.toBeInTheDocument();

    unmount();
    host.remove();
  });
});
