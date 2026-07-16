# Topic Trends And Desktop Auto Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make step 1 recommend current 2026 topics and matching prose styles by selected genre, then publish self-updating Windows installers whenever `main` is synchronized.

**Architecture:** A new `topicTrends` domain module owns genre definitions, style mappings, local fallback recommendations, prompt construction, and AI result validation. `Workspace` only coordinates selection and rendering. A dependency-injected Electron updater module wraps `electron-updater`, while a GitHub Actions workflow builds and publishes versioned NSIS releases from pushes to `main`.

**Tech Stack:** React 19, TypeScript, Vitest, Electron, electron-updater, electron-builder, GitHub Actions

---

### Task 1: Topic trend domain model

**Files:**
- Create: `src/domain/topicTrends.ts`
- Create: `src/domain/topicTrends.test.ts`
- Modify: `src/domain/templates.ts`

- [x] Write tests proving each genre has matching styles and at least four local 2026 fallback recommendations.
- [x] Run `npx vitest run src/domain/topicTrends.test.ts` and confirm the missing-module failure.
- [x] Implement genre definitions, style mappings, fallback pools, date-aware prompt construction, and strict AI result normalization.
- [x] Move `TopicRecommendation` ownership out of `templates.ts` and keep the full main form style list unchanged.
- [x] Run the focused domain tests and confirm they pass.

### Task 2: Step 1 recommendation controls

**Files:**
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/Workspace.test.tsx`

- [x] Add component tests for genre selection, filtered style options, default-style switching, date-and-genre prompt content, fallback filtering, and applying both outline and style.
- [x] Run the focused Workspace tests and confirm the new expectations fail.
- [x] Add the genre control and connect it to the domain module.
- [x] Update refresh messaging to distinguish online current-trend output from local 2026 fallback data.
- [x] Run the focused Workspace tests and confirm they pass.

### Task 3: Desktop update controller

**Files:**
- Create: `electron/autoUpdate.mjs`
- Create: `electron/autoUpdate.test.js`
- Modify: `electron/main.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Write tests proving development builds skip checks, packaged builds check after startup, and downloaded updates only restart-install after user confirmation.
- [x] Run `npx vitest run electron/autoUpdate.test.js` and confirm the missing-module failure.
- [x] Install `electron-updater` as a runtime dependency and implement the dependency-injected update controller.
- [x] Start update checks after the BrowserWindow becomes ready without blocking startup.
- [x] Configure the GitHub provider and ASCII installer artifact name.
- [x] Run the focused updater tests and confirm they pass.

### Task 4: Automated Windows release workflow

**Files:**
- Create: `.github/workflows/release-desktop.yml`
- Create: `src/domain/desktopReleaseConfig.test.js`
- Modify: `package.json`

- [x] Write configuration tests for the public GitHub provider, ASCII artifact name, updater metadata, workflow trigger, permissions, tests, versioning, and release publishing.
- [x] Run `npx vitest run src/domain/desktopReleaseConfig.test.js` and confirm the workflow/config expectations fail.
- [x] Add a Windows GitHub Actions workflow triggered by pushes to `main`.
- [x] Generate CI versions as `year.month.run_number`, run tests, build NSIS, and publish installer, blockmap, and `latest.yml` through electron-builder.
- [x] Run the focused configuration tests and confirm they pass.

### Task 5: Verification, commit, and synchronization

**Files:**
- Modify: `docs/superpowers/plans/2026-07-17-topic-trends-desktop-auto-update.md`
- Output: `release/*.exe`

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run build` and require a successful production build.
- [ ] Run `npm run desktop:dist` and verify installer plus `latest.yml` are generated.
- [ ] Install the newly generated installer into a temporary directory, launch it, confirm a responsive window, then uninstall it.
- [ ] Commit only the intended application, installer, tests, workflow, and plan files; leave unrelated untracked files untouched.
- [ ] Push `main`, verify the GitHub Actions desktop release run, verify the GitHub Release assets, and verify the Vercel production deployment URL.
