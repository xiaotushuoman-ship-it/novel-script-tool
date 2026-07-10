import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";
import { ObjectTreePanel } from "./ObjectTreePanel";

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

describe("ObjectTreePanel", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDirectorStore();
  });

  it("shows a delete action for scene objects and removes that object", () => {
    render(<ObjectTreePanel />);

    expect(screen.getByRole("treeitem", { name: "角色01" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除 角色01" }));

    expect(screen.queryByRole("treeitem", { name: "角色01" })).not.toBeInTheDocument();
    expect(
      useDirectorStore.getState().project.objects.some((object) => object.id === "char_default_a")
    ).toBe(false);
  });

  it("deletes a camera object together with its linked camera shot", () => {
    const cameraObject = useDirectorStore
      .getState()
      .project.objects.find((object) => object.kind === "camera" && object.linkedCameraId);
    expect(cameraObject).toBeTruthy();

    render(<ObjectTreePanel />);

    fireEvent.click(screen.getByRole("button", { name: `删除 ${cameraObject?.name}` }));

    const state = useDirectorStore.getState();
    expect(state.project.objects.some((object) => object.id === cameraObject?.id)).toBe(false);
    expect(state.project.cameras.some((camera) => camera.id === cameraObject?.linkedCameraId)).toBe(false);
  });
});
