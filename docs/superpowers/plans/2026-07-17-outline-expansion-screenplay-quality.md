# Outline Expansion Screenplay Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Step 1 generate only complete, high-retention chapter scripts with natural dialogue and no political, military, religious, or legal content.

**Architecture:** Strengthen the Step 1 template with explicit content boundaries, a scene-level drama engine, retention beats, and character dialogue fingerprints. Add a Step 1-only output sanitizer at the Workspace streaming boundary so model prefaces and production specifications never reach the result area.

**Tech Stack:** React, TypeScript, Vitest, Vite

---

### Task 1: Lock the prompt contract

**Files:**
- Modify: `src/domain/templates.test.ts`
- Modify: `src/domain/templates.ts`

- [ ] Add a failing test that builds the `outline-expansion` prompt and asserts it contains the four prohibited domains, target-obstacle-value-change scene rules, late-entry/early-exit guidance, 20-character dialogue limits, and direct chapter-only output.
- [ ] Run `npx vitest run src/domain/templates.test.ts` and confirm the new assertion fails.
- [ ] Rewrite only the `outline-expansion` prompt contract, retaining the existing input fields and chapter count behavior.
- [ ] Run `npx vitest run src/domain/templates.test.ts` and confirm it passes.

### Task 2: Keep only chapter screenplay output

**Files:**
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] Add a failing streaming test whose model response begins with production specifications and analysis before `第1章`.
- [ ] Assert every partial and final Step 1 result removes those prefaces while preserving chapter content.
- [ ] Run the focused Workspace test and confirm it fails for the unwanted preface.
- [ ] Add a Step 1-only sanitizer that returns an empty partial until a chapter heading appears, then returns content from that heading onward.
- [ ] Apply the sanitizer to streamed partials, final output, continuation, and selected-chapter optimization without changing other workflow steps.
- [ ] Run the focused Workspace tests and confirm they pass.

### Task 3: Verify the full application

**Files:**
- Verify: all changed source and test files

- [ ] Run `npm test` and confirm all test files pass.
- [ ] Run `npm run build` and confirm TypeScript and Vite production builds succeed.
- [ ] Run `git diff --check` and confirm there are no whitespace errors.
