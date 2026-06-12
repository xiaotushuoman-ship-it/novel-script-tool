import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAssetLibraryItem,
  clearAssetLibrary,
  deleteAssetLibraryItem,
  loadAssetLibrary,
  saveAssetLibrary,
  type AssetLibraryItem,
} from "./assetLibrary";

beforeEach(() => {
  localStorage.clear();
});

describe("assetLibrary", () => {
  it("saves and groups generated assets by type", () => {
    const character = addAssetLibraryItem({
      type: "人物",
      name: "林晚",
      src: "https://img.example.com/lin-wan.png",
      prompt: "白衬衫少女角色设定表",
      model: "gpt-image-2",
      ratio: "16:9",
      resolution: "1K",
      saveDirectory: "F:/assets",
    });
    addAssetLibraryItem({
      type: "场景",
      name: "夜市",
      src: "data:image/png;base64,scene",
      prompt: "夜市场景",
      model: "gemini-3.1-flash-preview",
      ratio: "21:9",
      resolution: "2K",
    });

    const library = loadAssetLibrary();
    expect(library).toHaveLength(2);
    expect(library[0]).toMatchObject({ type: "场景", name: "夜市" });
    expect(library[1]).toMatchObject({ id: character.id, type: "人物", saveDirectory: "F:/assets" });
  });

  it("deletes one saved asset without clearing the library", () => {
    const first = addAssetLibraryItem({
      type: "人物",
      name: "林晚",
      src: "https://img.example.com/lin-wan.png",
      prompt: "",
      model: "gpt-image-2",
      ratio: "16:9",
      resolution: "1K",
    });
    const second = addAssetLibraryItem({
      type: "物品",
      name: "长刀",
      src: "https://img.example.com/sword.png",
      prompt: "",
      model: "gpt-image-2",
      ratio: "16:9",
      resolution: "1K",
    });

    deleteAssetLibraryItem(first.id);

    expect(loadAssetLibrary()).toEqual([expect.objectContaining({ id: second.id, name: "长刀" })]);
  });

  it("falls back to an empty library when stored data is invalid", () => {
    localStorage.setItem("novel-script-tool.asset-library", "{bad-json");

    expect(loadAssetLibrary()).toEqual([]);
  });

  it("normalizes legacy or partial items", () => {
    vi.setSystemTime(new Date("2026-06-11T10:00:00.000Z"));
    const partial = {
      id: "asset-old",
      type: "角色",
      name: "",
      src: "https://img.example.com/old.png",
    } as unknown as AssetLibraryItem;

    saveAssetLibrary([partial]);

    expect(loadAssetLibrary()).toEqual([
      expect.objectContaining({
        id: "asset-old",
        type: "人物",
        name: "未命名资产",
        prompt: "",
        createdAt: "2026-06-11T10:00:00.000Z",
      }),
    ]);
    vi.useRealTimers();
  });

  it("clears all saved assets", () => {
    addAssetLibraryItem({
      type: "人物",
      name: "林晚",
      src: "https://img.example.com/lin-wan.png",
      prompt: "",
      model: "gpt-image-2",
      ratio: "16:9",
      resolution: "1K",
    });

    clearAssetLibrary();

    expect(loadAssetLibrary()).toEqual([]);
  });
});
