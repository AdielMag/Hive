# Implementation Plan: Integrated Chromium Hive Browser with Smart RAM Management

<!-- SUMMARY -->
### Executive Summary

We will integrate an intelligent, Chromium-powered built-in browser into Hive ("Hive Browser") that seamlessly handles web browsing inside the IDE workbench while strictly guarding system RAM.

#### Key Outcomes:
1. **Integrated Chromium Browser Tabs**: Embedded `<webview>` tabs running inside Hive's content card with a sleek address bar (omnibox), navigation controls (back/forward/reload), security indicators, and external browser escape hatch.
2. **Default Link Opening**: All links clicked inside Hive—markdown transcripts, app title bar help menus, release notes, documentation, settings, and webview popup links—open inside Hive browser tabs by default.
3. **Smart RAM & Resource Guardian**:
   - **Tab Hibernation (Sleeping)**: Background tabs automatically hibernate after inactivity (default 5 minutes), completely unmounting their guest webview to release 100% of guest renderer RAM to the OS.
   - **LRU Concurrency Cap**: Strict limit on concurrent live background tabs (default: 2 live tabs). Oldest tabs automatically sleep when the budget is exceeded.
   - **Background Throttling & Audio Muting**: Live background tabs are muted and throttled by Chromium to prevent background media or CPU drain.
   - **Instant Sleep & Memory Controls**: One-click "Sleep tab" button, "Hibernate all background tabs" action, and configurable settings in Settings.

---

<!-- FULL -->

## 1. Architecture & Design

### 1.1 Webview vs WebContentsView
In Electron 35, `<webview>` tags run in isolated guest renderer processes. When a `<webview>` element is unmounted from the DOM, Electron disposes of the guest WebContents and Chromium terminates the guest renderer process, releasing all allocated RAM immediately.

Using `<webview>` with `webviewTag: true` in the main window allows the browser view to sit naturally within Hive's React card layout, respect window resizing, maintain clean z-ordering with modals and menus, and achieve true zero-RAM hibernation via React unmounting while preserving tab metadata in Zustand.

```
+-----------------------------------------------------------------------------------+
| Hive Shell                                                                        |
| +-------------------------------------------------------------------------------+ |
| | TabStrip: [ Session 1 ] [ Session 2 ] [ (o) Pi Docs ] [ (zzz) GitHub (Sleep) ]| |
| +-------------------------------------------------------------------------------+ |
| | Content Card                                                                  | |
| | +---------------------------------------------------------------------------+ | |
| | | BrowserToolbar: [<-] [->] [R] [ https://pi.dev/docs ] [Sleep] [Popout]   | | |
| | +---------------------------------------------------------------------------+ | |
| | | <webview src="https://pi.dev/docs" partition="persist:hive-browser" />    | | |
| | | (Or "Tab Sleeping to save RAM" card when hibernated - webview unmounted)  | | |
| | +---------------------------------------------------------------------------+ | |
| +-------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

### 1.2 Smart Tab Lifecycle & RAM Saver State Machine
Each browser tab has states:
- `Active`: Currently viewed by user. `<webview>` mounted, audible if playing, active.
- `Warm Background`: Not currently viewed, but recently active and within `maxLiveTabs` cap. Muted, background throttled.
- `Sleeping`: Exceeded inactivity threshold or LRU budget, or manually put to sleep. `<webview>` unmounted, 0 MB guest RAM used. Tab strip shows sleeping indicator.
- `Waking`: On user click, transitions back to `Active`, remounts webview, and restores URL/title.

```
[ New URL / Link Click ]
         |
         v
     ( ACTIVE ) <-------------------------+
         |                                |
   Switch away                            | Click / Switch Tab
         |                                |
         v                                |
( WARM BACKGROUND )                       |
  Muted & Throttled                       |
         |                                |
   Inactivity timeout (>5m)               |
   OR LRU budget exceeded                 |
   OR User clicks "Sleep"                 |
         |                                |
         v                                |
    ( SLEEPING ) -------------------------+
  Unmounted: 0 RAM
```

---

## 2. Proposed Changes

### Phase 1: Protocol & IPC Layer
- **`packages/protocol/src/projects.ts`**:
  - Extend `TabItem` to include `kind?: "session" | "file" | "diff" | "usage" | "library" | "browser"`.
  - Add browser metadata fields: `url?: string`, `favicon?: string`, `isSleeping?: boolean`, `lastActiveAt?: number`.
- **`packages/protocol/src/ipc.ts`**:
  - Add `IPC.openSystemBrowser` (`"shell:open-system-browser"`).
  - Add `IPC.evtOpenBrowserTab` (`"browser:open-tab"`).
  - Update `StudioApi` interface with `openSystemBrowser(url: string)` and `onOpenBrowserTab(listener: (data: { url: string; title?: string }) => void)`.

### Phase 2: Electron Main Process & Preload
- **`apps/desktop/src/main/window.ts`**:
  - Add `webviewTag: true` to `webPreferences`.
  - Add `win.webContents.on("will-attach-webview", ...)` to enforce sandboxing (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, stripping preloads).
  - Add `app.on("web-contents-created", ...)`: intercept webview popup requests (`setWindowOpenHandler`) so `<a target="_blank">` inside webviews opens as new Hive browser tabs.
  - Intercept main window navigation & `setWindowOpenHandler` to route external links to `IPC.evtOpenBrowserTab`.
- **`apps/desktop/src/main/ipc/app.ts`**:
  - Handle `IPC.openSystemBrowser` via `shell.openExternal(url)`.
  - Update `IPC.openExternal`: by default route to `win.webContents.send(IPC.evtOpenBrowserTab, { url })`, unless `{ external: true }` is specified.
- **`apps/desktop/src/preload/index.ts`**:
  - Implement and expose `openSystemBrowser` and `onOpenBrowserTab`.

### Phase 3: Browser Tab Manager & Session Store (Renderer)
- **`apps/desktop/src/renderer/lib/browser/browser-store.ts`**:
  - Create browser settings store: `autoSleepMinutes` (default: 5), `maxLiveTabs` (default: 2), `autoWakeOnSelect` (default: true), `openExternalInHive` (default: true), `searchEngine` ("duckduckgo" | "google" | "bing").
  - Implement smart LRU tab evaluator: scans tabs, calculates age since `lastActiveAt`, sleeps tabs that exceed timeout or LRU cap.
  - URL normalizer: resolves bare domains (`localhost:3000`, `example.com`), protocols (`https://`), and web searches.
- **`apps/desktop/src/renderer/store/session-store.ts`**:
  - Add `openBrowserTab(url: string, title?: string): void`.
  - Add `setTabSleeping(tabId: string, isSleeping: boolean): void`.
  - Add `updateBrowserTab(tabId: string, patch: Partial<TabItem>): void`.
  - In `init()`: subscribe to `window.studio.onOpenBrowserTab(...)`.
  - In `switchTab()`: update `lastActiveAt`, wake target tab if sleeping, run LRU checks.

### Phase 4: UI Components
- **`apps/desktop/src/renderer/components/browser/BrowserTab.tsx`**:
  - Omnibox address bar with lock icon, input submit, back/forward/reload/home buttons.
  - Memory status pill ("Live" / "Sleeping") and manual "Put tab to sleep" button.
  - Action buttons: Copy URL, Open in System Browser.
  - Progress bar for loading state.
  - Sleeping state card (rendered when sleeping, webview unmounted).
  - Webview lifecycle events (`did-start-loading`, `did-stop-loading`, `page-title-updated`, `page-favicon-updated`, `did-fail-load`).
- **`apps/desktop/src/renderer/components/browser/BrowserSettingsContent.tsx`**:
  - Settings panel section for auto-sleep threshold, max concurrent tabs, manual "Hibernate all background tabs" button.
- **`apps/desktop/src/renderer/components/TabStrip.tsx`**:
  - Render Globe / Favicon icon for browser tabs.
  - Render subtle sleep badge (Moon icon / tooltip: "Sleeping to save RAM").
  - Middle click to close, click to switch/wake.
  - Quick action to open new browser tab.
- **`apps/desktop/src/renderer/components/WorkbenchLayout.tsx`**:
  - Add Browser navigation rail button (`<Globe size={18} />`).
  - Render `BrowserTab` when `activeTab?.kind === "browser"`.
- **`apps/desktop/src/renderer/components/code/Markdown.tsx`**:
  - Route all clicked links to `openBrowserTab(href)`.
- **`apps/desktop/src/renderer/components/AppTitleBar.tsx`**:
  - Add "New Browser Tab" (Ctrl+Shift+B) to File menu.
  - Help menu links (Pi docs, GitHub, Release notes) open in Hive browser tabs.
- **`apps/desktop/src/renderer/components/SettingsModal.tsx`**:
  - Add "Browser" tab in settings.
  - Changelog and release links open in Hive browser tabs.

### Phase 5: Verification & Testing
- Unit tests for:
  - Smart LRU background tab eviction.
  - Inactivity sleep timeout calculations.
  - URL normalization and search engine routing.
  - `openBrowserTab` and tab switching behavior in session store.
- Typecheck (`npm run typecheck`).
- Vitest suite (`npm test`).

---

## 3. Plan Reviewer Status
status: pending_approval
