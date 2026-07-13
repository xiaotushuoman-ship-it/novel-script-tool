# Generated Image Desktop Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated images in steps 3, 6, and 9 draggable to the desktop as real PNG files while retaining ZZDH dragging and responsive previews.

**Architecture:** Extend the shared generated-image result path in `Workspace` with cached drag object URLs for inline images. Both result thumbnails and the full-size preview use one drag-data builder, while a lifecycle effect owns and revokes only the object URLs created for active results.

**Tech Stack:** React 19, TypeScript, browser Drag and Drop API, Blob/Object URL APIs, Vitest, Testing Library.

---

### Task 1: Specify Desktop Drag Data

**Files:**
- Modify: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Write failing tests for base64 and preview desktop dragging**

Add focused tests beside the existing generated-image drag tests. Stub `URL.createObjectURL` as `blob:generated-image-drag`, generate a base64 result, and assert that thumbnail and preview drags both set:

```ts
expect(dataTransfer.setData).toHaveBeenCalledWith(
  "DownloadURL",
  "image/png:拖拽图片测试-剧本资产提取-林晚-image-1.png:blob:generated-image-drag",
);
expect(dataTransfer.setData).toHaveBeenCalledWith("text/uri-list", "blob:generated-image-drag");
expect(dataTransfer.setData).toHaveBeenCalledWith(
  "application/x-xiaotu-asset-image",
  expect.stringContaining('"assetName":"林晚"'),
);
```

Open the image preview and repeat `dragStart` against `高清预览：林晚 生图结果 1`. Assert `draggable="true"` and the same filename and Blob URL.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx vitest run src/components/Workspace.test.tsx -t "desktop|draggable"
```

Expected: FAIL because inline results currently set `DownloadURL` to a filename-only placeholder, omit `text/uri-list`, and the preview image is not draggable.

### Task 2: Cache Drag URLs For Active Results

**Files:**
- Modify: `src/components/Workspace.tsx`
- Test: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Add the result source collection and object URL cache**

Create a `Map<string, string>` ref owned by `Workspace`. Derive the currently active generated-image sources from `imageResults`, `storyboardImageResults`, and `customImageResults`. In an effect, create missing object URLs only for `data:image/...;base64,...` sources:

```ts
const generatedImageDragUrlsRef = useRef(new Map<string, string>());

useEffect(() => {
  const activeSources = new Set(
    [...imageResults, ...storyboardImageResults, ...customImageResults].map((image) => image.src),
  );

  for (const src of activeSources) {
    if (!isInlineImageDataUrl(src) || generatedImageDragUrlsRef.current.has(src)) continue;
    const blob = dataUrlToBlob(src);
    generatedImageDragUrlsRef.current.set(src, URL.createObjectURL(blob));
  }

  for (const [src, objectUrl] of generatedImageDragUrlsRef.current) {
    if (activeSources.has(src)) continue;
    URL.revokeObjectURL(objectUrl);
    generatedImageDragUrlsRef.current.delete(src);
  }
}, [imageResults, storyboardImageResults, customImageResults]);
```

Use a small local `dataUrlToBlob` helper that extracts the MIME type, decodes the payload with `atob`, and returns a Blob. Catch conversion failures per source so the remaining results stay usable.

- [ ] **Step 2: Add unmount cleanup**

Add a cleanup effect that revokes every URL still in `generatedImageDragUrlsRef.current` and clears the map when `Workspace` unmounts.

- [ ] **Step 3: Run the focused tests**

Run:

```powershell
npx vitest run src/components/Workspace.test.tsx -t "desktop|draggable"
```

Expected: base64 Blob preparation assertions pass; the preview drag test still fails until Task 3.

### Task 3: Unify Thumbnail And Preview Dragging

**Files:**
- Modify: `src/components/Workspace.tsx:1542`
- Modify: `src/components/Workspace.tsx:2985`
- Modify: `src/components/Workspace.tsx:3175`
- Modify: `src/components/Workspace.tsx:4141`
- Test: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Resolve a downloadable drag URL**

Update `prepareImageDrag` to read the cached object URL for inline images and otherwise use the HTTP source:

```ts
const dragUrl = /^https?:\/\//i.test(image.src)
  ? image.src
  : generatedImageDragUrlsRef.current.get(image.src);

if (dragUrl) {
  event.dataTransfer.setData("text/uri-list", dragUrl);
  event.dataTransfer.setData("text/plain", dragUrl);
  event.dataTransfer.setData("DownloadURL", `image/png:${filename}:${dragUrl}`);
  return;
}
```

Keep the existing lightweight filename fallback when conversion has not completed or failed. Do not decode data URLs inside `prepareImageDrag`.

- [ ] **Step 2: Make full-size preview images draggable**

For both preview render branches, add `draggable`, the desktop/ZZDH tooltip, and an `onDragStart` handler when `previewImage.image` exists:

```tsx
draggable={Boolean(previewImage.image)}
title="左键预览，右键下载，可拖到电脑桌面或字字动画图片位"
onDragStart={(event) => {
  if (previewImage.image) prepareImageDrag(event, previewImage.image, previewImage.filename);
}}
```

Update the thumbnail tooltip to use the same wording.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```powershell
npx vitest run src/components/Workspace.test.tsx -t "desktop|draggable|large data-url"
```

Expected: PASS. Existing large data URL tests confirm no decoding occurs during `dragstart`.

### Task 4: Verify URL Cleanup

**Files:**
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/components/Workspace.tsx` only if cleanup assertions reveal a lifecycle defect

- [ ] **Step 1: Write cleanup regression tests**

Generate two images, delete one, and assert only its owned Blob URL is revoked. Clear the remaining generated results and assert its URL is then revoked. Also unmount a workspace with an active image and assert cleanup runs once.

- [ ] **Step 2: Run cleanup tests and verify behavior**

Run:

```powershell
npx vitest run src/components/Workspace.test.tsx -t "revoke|clears only asset image previews|deletes one generated image"
```

Expected: PASS without revoking unrelated URLs or breaking preview close.

### Task 5: Full Verification

**Files:**
- Verify: `src/components/Workspace.tsx`
- Verify: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Run the complete test suite**

Run:

```powershell
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 3: Verify manually in the local browser**

Reload `http://127.0.0.1:5173/`, generate or reuse one image result, then verify:

1. Dragging the thumbnail to the desktop creates a PNG file.
2. Dragging the full-size preview to the desktop creates the same PNG file.
3. Dragging the thumbnail to a ZZDH image slot still works.
4. Clicking, closing, reopening, and dragging a large image does not freeze the page.

Do not commit, push, or deploy unless the user explicitly requests `同步更新`.
