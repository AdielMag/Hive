<div align="center">

<img src="apps/desktop/build/icon.png" width="96" alt="Hive icon" />

# Hive

**A fast, beautiful desktop workbench for the [Pi coding agent](https://pi.dev).**
Multi-session tabs, IDE-grade code rendering, live subscription limits, usage analytics and an Arc-browser-style theme engine — all driving the Pi CLI you already have installed.

[![Release](https://github.com/AdielMag/pi-studio/actions/workflows/release.yml/badge.svg)](https://github.com/AdielMag/pi-studio/actions/workflows/release.yml)
[![CI](https://github.com/AdielMag/pi-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/AdielMag/pi-studio/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/AdielMag/pi-studio?sort=semver)](https://github.com/AdielMag/pi-studio/releases/latest)

![Hive workbench](docs/screenshots/workbench.png)

</div>

---

## Contents

- [Features](#features)
- [Install](#install)
- [Using Hive](#using-hive)
  - [Subscription limits](#subscription-limits)
  - [Usage analytics](#usage-analytics)
  - [Appearance (Arc-style themes)](#appearance-arc-style-themes)
  - [Code rendering](#code-rendering)
  - [Keyboard shortcuts](#keyboard-shortcuts)
- [Configuration](#configuration)
- [Development](#development)
- [Architecture](#architecture)
- [Testing](#testing)
- [Releases & CI/CD](#releases--cicd)
- [Troubleshooting](#troubleshooting)
- [Privacy & security](#privacy--security)

## Features

| | |
|---|---|
| 🗂 **Projects & sessions** | Color-coded projects, every Pi session on disk in one sidebar, resume any CLI session, multiple live sessions in tabs. |
| 💬 **Rich transcript** | GitHub-flavoured Markdown, collapsible thinking, tool cards (read / edit / write / bash / grep…) with highlighted output and edit diffs, per-turn model / token / cost footer, smart scroll-pinning. |
| 🎨 **Rider-style code** | Every code block, file, diff and tool result is highlighted with JetBrains **Rider Dark / Light** colours, line numbers, soft-wrap toggle and exact one-click copy. |
| 📈 **Subscription limits** | Live 5-hour and weekly windows for every connected subscription (Claude, Google Antigravity, ChatGPT/Codex), with precise reset countdowns. Mini meters in the status bar. |
| 📊 **Usage analytics** | Spend, tokens, requests, sessions and cache-hit rate for Today / 7 / 30 / 90 days; stacked per-model chart; breakdowns by model, provider and project; period-over-period deltas. |
| 🌈 **Arc-style themes** | Hue/saturation colour pad with up to 3 colours, light / dark / auto, intensity and film grain, 10 presets, live window preview. WCAG contrast is solved automatically. |
| 🧰 **Workbench tools** | File explorer + viewer, Git panel (stage, commit, AI commit messages, branches, diffs), integrated terminal, context-window breakdown, model manager, extension & MCP marketplace. |
| 🔄 **Auto-updates** | Checks GitHub Releases and installs new versions in one click. |

<table>
<tr>
<td width="50%"><img src="docs/screenshots/limits.png" alt="Subscription limits" /></td>
<td width="50%"><img src="docs/screenshots/usage.png" alt="Usage analytics" /></td>
</tr>
<tr>
<td align="center"><em>Subscription limits</em></td>
<td align="center"><em>Usage analytics</em></td>
</tr>
</table>

## Install

1. **Install Pi** (Hive drives your local Pi; it does not bundle one):
   ```bash
   npm install -g @earendil-works/pi-coding-agent
   pi            # sign in to your providers once
   ```
   Pi needs Node.js **22.19+**.
2. **Download Hive** from the [latest release](https://github.com/AdielMag/pi-studio/releases/latest):

   | Platform | File |
   |---|---|
   | Windows | `Hive-Setup-<version>.exe` (installer) or `Hive-<version>-portable.exe` |
   | macOS | `Hive-<version>-mac-<arch>.dmg` |
   | Linux | `Hive-<version>-linux-x86_64.AppImage` |

   Builds are currently **unsigned**: on Windows choose *More info → Run anyway*; on macOS right-click → *Open* the first time.
3. Launch Hive, click **Open a Project Folder**, and start a session.

## Using Hive

### Subscription limits

Open with the **gauge** icon on the right rail, `Ctrl+Shift+L`, or by clicking the meters in the status bar.

For every account you are signed in to, Hive shows each rate-limit window — the rolling **5-hour** window and the **weekly** window (plus model-specific windows such as *Weekly · Opus* when the provider reports them) — with % used, % left, a live **"resets in 2h 14m · Today 17:00"** countdown, and colour-coded severity (green < 70 %, amber < 90 %, red ≥ 90 %).

| Provider | Source |
|---|---|
| Anthropic (Claude Pro/Max OAuth) | `api.anthropic.com/api/oauth/usage` |
| Google Antigravity | `cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary` (per model group: *Gemini* and *Claude & GPT*) |
| ChatGPT / Codex | `chatgpt.com/backend-api/wham/usage` |
| API-key providers | Listed as *pay-as-you-go* (no windows) |

Credentials are resolved by Pi itself (including OAuth token refresh) through a tiny helper run under Pi's own Node runtime, so Hive never re-implements auth. If a live request fails (offline, `429`), the panel falls back to the last good value or the [`pi-quota-status`](https://github.com/hafiezul/pi-quota-status) cache and marks the card **cached**. Rate-limited providers back off for 5 minutes. Data refreshes every 2 minutes while visible.

### Usage analytics

Open with the **bar-chart** icon (left rail / status bar) or `Ctrl+Shift+U`. It opens as a tab.

Everything is computed locally from your Pi session files (`~/.pi/agent/sessions/**/*.jsonl`):

- **KPIs** – spend (API-equivalent USD as recorded by Pi), tokens (prompt vs. output), requests, sessions, cache-hit rate, top model — each with a delta vs. the previous period.
- **Chart** – stacked per-model columns per day (or **per hour** for *Today*), switchable between cost and tokens, with a hover breakdown.
- **Token mix** – input / output / cache-read / cache-write split.
- **Breakdown table** – by model, provider or project, with requests, tokens, cost and share.

Session files are parsed once and cached by modification time/size (`<userData>/hive/usage-cache.json`), so re-opening the view takes milliseconds even with hundreds of MB of history.

### Appearance (Arc-style themes)

**Settings → Appearance** (`Ctrl+,`).

![Appearance settings](docs/screenshots/appearance.png)

- **Colour pad** – angle = hue, distance from centre = saturation. Add up to **3** colours for a gradient; dragging the large dot moves the whole palette together (keeps the harmony), smaller dots move independently. Arrow keys work too.
- **Mode** – Light, Dark, or Auto (follows the OS).
- **Intensity** – from a soft tint to a deep, saturated frame.
- **Grain** – film-grain texture over the window frame.
- **Presets** – Midnight, Ember, Lagoon, Matcha, Aurora, Rosé, Graphite, Sunrise, Glacier, Paper.
- **Code** – font size, ligatures, soft-wrap.

Like Arc, the *frame* (title bar, rails, side panels, status bar) is painted with your gradient while the editor floats above it as a calm content card. Text colours are contrast-solved against both surfaces (≥ 7:1 for body text) for every preset and intensity — this is enforced by unit tests. Themes persist and are applied before first paint (no flash).

### Code rendering

- Highlighting uses [shiki](https://shiki.style) with custom **Rider Dark / Rider Light** TextMate themes (blue keywords, purple types, teal methods, cyan fields, tan strings, pink numbers, green comments). Theme switches are instant — tokens carry both palettes as CSS variables.
- 40+ languages load lazily on first use (TypeScript, C#, Python, Rust, Go, C/C++, Java, Kotlin, Swift, shell, PowerShell, SQL, YAML, JSON, HTML/CSS, HLSL/GLSL, Razor, …).
- **Copy** copies the exact source (no line numbers, no trailing whitespace changes). Code and messages are text-selectable.
- Long blocks collapse with *Show all N lines*; long files render in chunks with `content-visibility` for smooth scrolling.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New session in the current project |
| `Ctrl+O` | Open project folder |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+B` | Toggle projects sidebar |
| `Ctrl+Shift+E` / `Ctrl+Shift+G` | Files / Source control |
| `Ctrl+Shift+L` | Subscription limits |
| ``Ctrl+` `` | Terminal |
| `Ctrl+Shift+U` | Usage analytics |
| `Ctrl+,` | Settings |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Enter` / `Shift+Enter` | Send / newline in the composer |
| `Enter` / `Ctrl+Enter` while Pi is working | Queue a follow-up / steer immediately |
| `Esc` while Pi is working | Stop the current turn |

(`Cmd` instead of `Ctrl` on macOS.)

## Configuration

| Variable | Purpose |
|---|---|
| `HIVE_PI_CLI` | Path to Pi's `cli.js`, package root or install dir (skip auto-detection). |
| `HIVE_NODE` | Node.js binary used to run Pi (must be ≥ 22.19). |
| `HIVE_PROJECT` | Folder to open on first launch. |
| `PI_CODING_AGENT_DIR` | Pi's agent dir (default `~/.pi/agent`); honoured like Pi itself does. |
| `HIVE_USER_DATA` | Use a separate profile directory (testing). |
| `HIVE_CAPTURE`, `HIVE_CAPTURE_DELAY`, `HIVE_CAPTURE_SCRIPT` | Screenshot automation: write a PNG after load (optionally running a script first) and exit. |

The legacy `PI_STUDIO_*` names are still accepted as fallbacks.

Pi auto-detection order: `HIVE_PI_CLI` → `pi` launchers on `PATH` → known install locations (`%LOCALAPPDATA%\pi-node\current`, global npm, Homebrew, …).

Settings that belong to Pi (enabled models, default model, auth) are read from and written to Pi's own files, so the CLI and Studio stay in sync.

## Development

Requirements: Node.js 22.19+, npm 10+, Git, and Pi installed (for running sessions).

```bash
git clone https://github.com/AdielMag/pi-studio.git
cd pi-studio
npm ci --legacy-peer-deps
npm run dev            # Electron + Vite with hot reload
```

| Script | What it does |
|---|---|
| `npm run dev` | Run the app in development mode. |
| `npm run build` | Production build of main, preload and renderer into `apps/desktop/out`. |
| `npm run typecheck` | Strict TypeScript over every package, main/preload and renderer. |
| `npm test` | Unit tests (Vitest). |
| `npm run test:contract` | Contract tests against a real Pi process. |
| `npm run dist` | Build installers for the current OS into `apps/desktop/dist-release`. |
| `npm run screenshots` | Regenerate `docs/screenshots` from the built app (account e-mails are blurred). |
| `npm run release:preview` | Show the version and changelog the next merge to `main` would produce. |

## Architecture

```
pi-studio/
├─ apps/desktop/                 Electron app
│  ├─ src/main/                  main process
│  │  ├─ index.ts                lifecycle only (single instance, shutdown)
│  │  ├─ context.ts              AppContext: owns every service
│  │  ├─ window.ts               BrowserWindow, navigation guards, capture hooks
│  │  ├─ paths.ts                resource paths (asar-unpacked aware)
│  │  ├─ ipc/                    one module per domain: app, sessions, workspace, accounts
│  │  ├─ services/               session-manager, catalog, git, files, terminal, auth,
│  │  │  │                       models, marketplace, updater, usage
│  │  │  └─ quota/               credentials helper, provider fetchers, pure parsers, service
│  │  ├─ bridge-server/          local socket to the Studio bridge extension running inside Pi
│  │  └─ store/                  GUI state (projects, session meta)
│  ├─ src/preload/               the narrow `window.studio` API (contextIsolation)
│  ├─ src/renderer/
│  │  ├─ components/             workbench UI (shell, transcript, composer, panels…)
│  │  │  └─ code/                CodeBlock, Markdown, DiffView, highlighted lines
│  │  ├─ features/appearance/    Arc theme editor, colour pad, appearance store
│  │  ├─ features/insights/      limits panel, usage view, charts, insights store
│  │  ├─ lib/highlight/          shiki highlighter, Rider themes, language registry
│  │  ├─ store/                  session store (Pi state) + UI/layout store
│  │  ├─ hooks/                  global shortcuts
│  │  └─ styles/                 tokens, primitives, shell, transcript, settings
│  └─ resources/                 shipped to Pi: bridge extension, credential helper
├─ packages/
│  ├─ protocol/                  shared types: IPC contract, bridge protocol, insights
│  ├─ pi-adapter/                the only coupling to Pi: RPC, locator, transcript, usage parsing
│  ├─ theme-engine/              Arc theme tokens + WCAG contrast solver (pure)
│  └─ test-provider/             deterministic fake model provider for tests
└─ scripts/release/              conventional-commit versioning + changelog
```

Key design points:

- **Pi is the engine.** Each tab runs `pi --mode rpc` as a child process; Studio talks JSON-RPC over stdio and loads a small bridge extension for things RPC doesn't cover (linked projects, status). Nothing is re-implemented that Pi already does.
- **Strict process boundary.** The renderer has no Node access; everything goes through the typed `StudioApi` in `@hive/protocol`, implemented by the preload and handled by `ipc/*` modules.
- **Services are injectable.** `AppContext` constructs services once; IPC modules receive it. Pure logic (quota parsers, usage aggregation, theme tokens, release versioning) lives in side-effect-free modules with unit tests.
- **Performance.** Store subscriptions use shallow selectors so streaming only re-renders what changed; settled transcript rows are memoized; highlighting is async, cached (LRU) and debounced while streaming; heavy views (terminal, settings, usage, viewers) are code-split; session events are batched every 50 ms in main.

## Testing

```bash
npm test                 # 90+ unit tests: parsers, usage aggregation, theme contrast for every preset,
                         # release versioning, asar path mapping, git/files/terminal/models services
npm run test:contract    # spawns real Pi processes against the deterministic test provider
```

CI runs typecheck, tests and a production build on Ubuntu and Windows for every pull request.

## Releases & CI/CD

Releases are fully automatic. **Every merge to `main`** runs [`release.yml`](.github/workflows/release.yml):

1. **Verify** – `npm ci`, typecheck, unit tests, production build.
2. **Version & changelog** – [`scripts/release/prepare.mjs`](scripts/release/prepare.mjs) reads the commits since the last `v*` tag and picks the next [SemVer](https://semver.org):
   - a breaking change (`feat!:` / `BREAKING CHANGE:`) → **major** (→ minor while < 1.0),
   - any `feat:` → **minor**,
   - anything else → **patch**.
   It bumps `package.json` versions, prepends a grouped section to [`CHANGELOG.md`](CHANGELOG.md) (Features, Fixes, Performance, …, with commit links and a compare link), commits `chore(release): vX.Y.Z [skip ci]`, and pushes an annotated tag.
3. **Package** – Windows (NSIS installer + portable), macOS (dmg + zip) and Linux (AppImage) are built in parallel from the tag.
4. **Publish** – a GitHub Release is created with the changelog section as release notes and all installers attached. The in-app updater picks it up.

Use [Conventional Commits](https://www.conventionalcommits.org) for PR titles / squash messages (`feat(insights): …`, `fix: …`) so the changelog reads well. Run `npm run release:preview` to see what the next release will contain.

> If `main` is branch-protected against bot pushes, the version-bump commit push is skipped with a warning; the tag (and therefore the release) is still published.

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Pi CLI not found"** | Install Pi globally, or set `HIVE_PI_CLI`. The screen lists every path searched. |
| **Session fails to start** | The error banner shows Pi's stderr. Run `pi` in a terminal in the same folder to see the same error; check Node ≥ 22.19. |
| **Limits card says "cached"** | The provider rate-limited or was unreachable; Studio shows the last good data and retries automatically. Hover the badge for the reason. |
| **No subscription windows for a provider** | API-key accounts are billed per token and have no windows; only OAuth subscriptions report limits. |
| **Usage looks empty** | Usage is read from `~/.pi/agent/sessions` (or `PI_CODING_AGENT_DIR`). Press the refresh button to force a rescan. |
| **Windows SmartScreen / macOS Gatekeeper warning** | Builds are unsigned; allow the app once as described in [Install](#install). |

## Privacy & security

- Everything runs locally. Usage analytics never leave your machine.
- Subscription-limit requests go **only** to each provider's own usage endpoint, using the credentials Pi already stores in `~/.pi/agent/auth.json`.
- The renderer is context-isolated with a strict Content-Security-Policy; external links open in your browser, and in-app navigation away from the app is blocked.

## License

See the repository for license details. Pi and its SDK are © their respective authors.
