# 15S Storyboard Streaming Result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 15S storyboard generation result appear incrementally in the result area while generation is still running.

**Architecture:** Add a streaming text path for AI calls used by the 15S storyboard step, then append partial chunks into the current draft as they arrive. Keep the existing non-streaming flow for all other steps so the rest of the app remains unchanged. Finish by normalizing the final text and confirming the UI stays responsive.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, fetch streaming / SSE parsing

---

### Task 1: Add a streaming AI text helper

**Files:**
- Modify: `F:/视频素材/novel-script-tool/src/domain/aiClient.ts`
- Test: `F:/视频素材/novel-script-tool/src/domain/aiClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("streams chat completion text chunks to a callback before finishing", async () => {
  // Mock a response body that yields SSE data chunks and assert the callback sees partial text.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/aiClient.test.ts`
Expected: fail because the streaming helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function callAiStream(
  settings: AiSettings,
  prompt: string,
  onChunk: (chunk: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  // POST with stream:true, read SSE chunks, emit delta text to onChunk, return full text.
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/domain/aiClient.test.ts`
Expected: PASS.

### Task 2: Use streaming only for 15S storyboard generation

**Files:**
- Modify: `F:/视频素材/novel-script-tool/src/components/Workspace.tsx`
- Test: `F:/视频素材/novel-script-tool/src/components/Workspace.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("appends 15S storyboard output to the result area while generation is still running", async () => {
  // Make the AI stream two chunks and assert the textarea updates after the first chunk.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Workspace.test.tsx -t "appends 15S storyboard output"`
Expected: fail because the draft only updates after the full response.

- [ ] **Step 3: Write minimal implementation**

```ts
if (runStepId === "storyboard-15s") {
  let liveDraft = "";
  const result = await callAiStream(aiSettings, runPrompt, (chunk) => {
    liveDraft += chunk;
    writeDraftForStep(runProjectId, runStepId, liveDraft);
  });
  writeDraftForStep(runProjectId, runStepId, cleanAiTextOutput(result));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Workspace.test.tsx -t "appends 15S storyboard output"`
Expected: PASS.

### Task 3: Verify app build and prevent regressions

**Files:**
- Modify: none
- Test: `npm run build`

- [ ] **Step 1: Run the build**

Run: `npm run build`
Expected: TypeScript and Vite build succeed.

- [ ] **Step 2: Spot-check existing storyboard tests**

Run: `npm test -- src/components/Workspace.test.tsx -t "storyboard"`
Expected: Existing storyboard panel tests still pass.

