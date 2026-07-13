import { afterEach, expect, it, vi } from "vitest";
import { readImportedDocument } from "./documentImport";

const { extractRawTextMock } = vi.hoisted(() => ({
  extractRawTextMock: vi.fn(),
}));

vi.mock("mammoth", () => ({
  extractRawText: (...args: unknown[]) => extractRawTextMock(...args),
}));

afterEach(() => {
  extractRawTextMock.mockReset();
});

it("reads existing text formats without invoking Mammoth", async () => {
  const file = new File(["顾玄持刀站在祭坛中央。"], "assets.txt", { type: "text/plain" });

  await expect(readImportedDocument(file, { allowDocx: false })).resolves.toBe("顾玄持刀站在祭坛中央。");
  expect(extractRawTextMock).not.toHaveBeenCalled();
});

it("extracts raw text from an allowed DOCX file", async () => {
  extractRawTextMock.mockResolvedValue({ value: "第一段\n\n第二段", messages: [] });
  const file = new File([new Uint8Array([80, 75, 3, 4])], "assets.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await expect(readImportedDocument(file, { allowDocx: true })).resolves.toBe("第一段\n\n第二段");
  expect(extractRawTextMock).toHaveBeenCalledWith({ arrayBuffer: expect.any(ArrayBuffer) });
});

it("rejects DOCX outside the enabled workflow", async () => {
  const file = new File([new Uint8Array([80, 75, 3, 4])], "assets.docx");

  await expect(readImportedDocument(file, { allowDocx: false })).rejects.toThrow("当前功能不支持 DOCX 文档");
});

it("rejects DOCX files with no readable text", async () => {
  extractRawTextMock.mockResolvedValue({ value: "  \n ", messages: [] });
  const file = new File([new Uint8Array([80, 75, 3, 4])], "empty.docx");

  await expect(readImportedDocument(file, { allowDocx: true })).rejects.toThrow("DOCX 文档中没有可读取的文字");
});
