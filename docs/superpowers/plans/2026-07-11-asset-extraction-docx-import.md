# Asset Extraction DOCX Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let step 3 import readable text from `.docx` files locally in the browser while preserving existing text imports and leaving other workflow steps text-only.

**Architecture:** Add a focused document-import domain module that routes plain-text files through the existing text-reading behavior and DOCX files through `mammoth.extractRawText`. `Workspace` decides whether DOCX is allowed for the current field, updates the input only after successful non-empty parsing, and reports failures without overwriting existing content.

**Tech Stack:** TypeScript, React, Mammoth, Vitest, Testing Library, Vite

---

### Task 1: Add the DOCX parser dependency and domain contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/domain/documentImport.test.ts`
- Create: `src/domain/documentImport.ts`

- [ ] **Step 1: Install Mammoth**

Run: `npm install mammoth`

Expected: `mammoth` appears in runtime dependencies and the lockfile is updated.

- [ ] **Step 2: Write failing domain tests**

Create `src/domain/documentImport.test.ts` with a mocked Mammoth extraction function and tests for these behaviors:

```ts
const extractRawTextMock = vi.fn();

vi.mock("mammoth", () => ({
  extractRawText: (...args: unknown[]) => extractRawTextMock(...args),
}));

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
```

Reset the mock after each test. The tests must import `readImportedDocument` from `./documentImport`.

- [ ] **Step 3: Run the domain test and verify RED**

Run: `npm test -- src/domain/documentImport.test.ts`

Expected: FAIL because `documentImport.ts` does not exist.

- [ ] **Step 4: Implement the document reader**

Create `src/domain/documentImport.ts` with:

```ts
import { extractRawText } from "mammoth";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function readImportedDocument(file: File, options: { allowDocx: boolean }): Promise<string> {
  if (!isDocxFile(file)) return readTextFile(file);
  if (!options.allowDocx) throw new Error("当前功能不支持 DOCX 文档");

  const result = await extractRawText({ arrayBuffer: await readArrayBuffer(file) });
  const text = result.value.trim();
  if (!text) throw new Error("DOCX 文档中没有可读取的文字");
  return text;
}

function isDocxFile(file: File) {
  return file.name.toLowerCase().endsWith(".docx") || file.type === DOCX_MIME_TYPE;
}
```

Add `readTextFile` and `readArrayBuffer` helpers that prefer `file.text()` / `file.arrayBuffer()` and use `FileReader.readAsText()` / `FileReader.readAsArrayBuffer()` as fallbacks. Reject if the array-buffer fallback does not produce an `ArrayBuffer`.

- [ ] **Step 5: Run the domain test and verify GREEN**

Run: `npm test -- src/domain/documentImport.test.ts`

Expected: all document-import tests PASS.

### Task 2: Route DOCX only through step 3

**Files:**
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Mock the document reader in Workspace tests**

Add:

```ts
const readImportedDocumentMock = vi.fn();

vi.mock("../domain/documentImport", () => ({
  readImportedDocument: (...args: unknown[]) => readImportedDocumentMock(...args),
}));
```

Reset the mock with the other mocks after each test. Give it a default implementation that returns `file.text()` so existing text-import tests retain their behavior.

- [ ] **Step 2: Write failing Workspace tests**

Add tests covering:

```ts
it("advertises and imports DOCX only for asset extraction", async () => {
  readImportedDocumentMock.mockResolvedValue("第一幕\n\n顾玄进入祭坛。");
  // Render step 3 and assert the import input accept attribute contains .docx.
  // Import assets.docx and assert readImportedDocument receives { allowDocx: true }.
  // Assert the sourceText update contains the extracted text.
});

it("keeps other document import controls text-only", () => {
  // Render novel-to-script and assert its accept attribute does not contain .docx.
});

it("keeps existing asset text when DOCX parsing fails", async () => {
  readImportedDocumentMock.mockRejectedValue(new Error("DOCX 文档解析失败"));
  // Start with sourceText set to 旧内容, import broken.docx,
  // assert no project update replaces sourceText and status shows 导入失败：DOCX 文档解析失败.
});
```

Also update the step 3 helper-text assertion to expect `支持 DOCX / TXT / MD / CSV / JSON / SRT 等文档，也可以拖拽到这里。` while keeping the existing generic helper text expectation for another step.

- [ ] **Step 3: Run focused Workspace tests and verify RED**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: FAIL because `Workspace` still uses its local text-only reader and all import controls share the same accepted extensions.

- [ ] **Step 4: Integrate the domain reader**

In `Workspace.tsx`:

```ts
import { readImportedDocument } from "../domain/documentImport";
```

Remove the local `readTextFile` helper. Change `importTextFile` to accept an `allowDocx` option, catch errors, and only call `updateInput` after a successful non-empty result:

```ts
async function importTextFile(file: File | undefined, targetField = "scriptText", allowDocx = false) {
  if (!file) return;
  try {
    const content = await readImportedDocument(file, { allowDocx });
    updateInput(targetField, content);
    setStatus(`已导入：${file.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    setStatus(`导入失败：${message}`);
  }
}
```

Inside `renderFieldControl`, calculate:

```ts
const supportsDocx = project.currentStep === "asset-extraction" && field.key === "sourceText";
```

Use it for file selection and drag/drop:

```tsx
accept={supportsDocx
  ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,.csv,.json,.srt,.vtt,.log,.text"
  : ".txt,.md,.csv,.json,.srt,.vtt,.log,.text"}
```

Pass `supportsDocx` to `importTextFile` in both handlers. Show the DOCX helper text only when `supportsDocx` is true; preserve the current helper text otherwise.

- [ ] **Step 5: Run focused Workspace tests and verify GREEN**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: all Workspace tests PASS.

### Task 3: Verify the complete application

**Files:**
- Create: `src/domain/documentImport.ts`
- Create: `src/domain/documentImport.test.ts`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/Workspace.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite production build PASS with Mammoth bundled for browser use.

- [ ] **Step 3: Inspect scope**

Run: `git diff --check` and inspect diffs for the files above.

Expected: only step 3 advertises DOCX; other document import controls remain text-only; existing pending step 1 and character-layout changes remain intact.

- [ ] **Step 4: Leave changes local**

Do not commit or push. Synchronize only when the user explicitly says `同步更新`.
