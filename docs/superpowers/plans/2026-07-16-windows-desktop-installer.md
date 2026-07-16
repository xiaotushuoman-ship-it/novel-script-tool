# Windows Desktop Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows x64 installer for Xiaotu Assistant that runs without a separate Node.js installation.

**Architecture:** Electron opens the existing Vite production build from a loopback HTTP server. The same server forwards TimeAI, AIStartLab, and local ZZDH requests so desktop behavior matches the development app while keeping browser security boundaries intact.

**Tech Stack:** React, Vite, Node.js HTTP, Electron, electron-builder, Vitest

---

### Task 1: Desktop server behavior

**Files:**
- Create: `electron/desktopServer.test.js`
- Create: `electron/desktopServer.mjs`

- [x] Add failing tests for API target routing, SPA fallback, and streaming responses.
- [x] Run the focused tests and confirm the missing implementation failure.
- [x] Implement the loopback static server and proxy handlers.
- [x] Run the focused tests and confirm all desktop server tests pass.

### Task 2: Electron application shell

**Files:**
- Create: `electron/main.mjs`
- Modify: `src/domain/zzdhClient.ts`
- Modify: `src/domain/zzdhClient.test.ts`

- [x] Add a failing expectation for same-origin ZZDH requests.
- [x] Route ZZDH through the desktop/development proxy.
- [x] Add the secure Electron BrowserWindow startup flow.
- [x] Run focused tests for the local bridge.

### Task 3: Installer configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Install Electron and electron-builder.
- [x] Configure the NSIS x64 installer and release output directory.
- [x] Add desktop build and packaging scripts.

### Task 4: Verification and artifact

**Files:**
- Output: `release/*.exe`

- [x] Run the complete Vitest suite.
- [x] Run the production Vite build.
- [x] Build the unpacked Electron application and launch-check it.
- [x] Build the Windows x64 NSIS installer and verify the artifact exists.
