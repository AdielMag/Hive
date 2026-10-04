# Changelog

All notable changes to Hive are documented here. This file is generated on every merge to `main`.

## v0.15.0 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.14.0...v0.15.0)

### ✨ Features

- **limits:** status-bar meters follow the active model's quota pool ([`4280a3c`](https://github.com/AdielMag/Hive/commit/4280a3c5895fa97cef6cdd12445bfe34d0b7cb13))
- **modules:** extract git, branches, files and diff-viewer into modules (M4) ([`30bbb9c`](https://github.com/AdielMag/Hive/commit/30bbb9c0809fad2a8fecb7ca3e7d95c854e5f5ba))
- **modules:** add Jev module (smart compaction hint, ask_jev tool) ([`f90e3a5`](https://github.com/AdielMag/Hive/commit/f90e3a59d79860193b5d0c754f81530e26275e57))
- **desktop:** add Pi CLI updater and git branch graph view ([`b02395f`](https://github.com/AdielMag/Hive/commit/b02395fe30a97e8ed1220201155a929bbbaafc8e))
- **transcript:** Cursor-style edit/retry/regenerate message actions ([`b500f56`](https://github.com/AdielMag/Hive/commit/b500f565ffc342bbb66944bf5a537280c61bb88f))

### 📝 Documentation

- milestone 4 handoff notes ([`8d06d44`](https://github.com/AdielMag/Hive/commit/8d06d443fc3cb38d0b7bac2b24d014b8693b5021))

### 🧹 Other changes

- Merge branch 'feat/modules-m4': extract git, branches, files, diff-viewer (M4) ([`3a60274`](https://github.com/AdielMag/Hive/commit/3a602746f1d699427e2ce4071f27e47b2837c526))
- Merge origin/main into feat/modules-m4 ([`0c1a408`](https://github.com/AdielMag/Hive/commit/0c1a408d8c422941305f30002c6f44e7f54b9057))
- Merge branch 'main' of https://github.com/AdielMag/Hive ([`52b39d8`](https://github.com/AdielMag/Hive/commit/52b39d82123abefd5566ebc75a654a94d726d3ad))

## v0.14.0 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.13.1...v0.14.0)

### ✨ Features

- **auth:** reconnect flow for expired Claude/Antigravity logins ([`d44fb60`](https://github.com/AdielMag/Hive/commit/d44fb6068630570a239388d176f81033cf294cbb))
- **modules:** extract Arc Theme Studio module ([`cacf0b1`](https://github.com/AdielMag/Hive/commit/cacf0b1b36a46ea29bfa0b13e65d8f29a459096d))
- **modules:** extract context window breakdown module ([`558892d`](https://github.com/AdielMag/Hive/commit/558892de426d8c1e78aa6fa6909d687ba3efd576))
- **modules:** extract tools inspector module ([`4126066`](https://github.com/AdielMag/Hive/commit/41260663cbacf13383c0254191ac2cd99e677cee))
- **modules:** extract analytics module (usage, cost telemetry, AI insights) ([`3128888`](https://github.com/AdielMag/Hive/commit/3128888a92c51826600b15bb2df73a950d248163))
- **plan-previewer:** declutter and redesign preview tab and skills ([`d751fda`](https://github.com/AdielMag/Hive/commit/d751fdaf34e1df6bea7d5923b18e10fad23a7ed6))
- **modules:** extract limits module (quota service + status-bar meters) ([`f64cfcb`](https://github.com/AdielMag/Hive/commit/f64cfcbc181a09fac0c09028d71866a5d68e26e3))

### 🧹 Other changes

- Merge origin/main (v0.13.1) ([`b6bffe1`](https://github.com/AdielMag/Hive/commit/b6bffe1c030f1e211432074a82296716df937d92))
- sync lockfile with module workspaces ([`6670e3c`](https://github.com/AdielMag/Hive/commit/6670e3cfc535452aacec7fb89247ddf29b076387))
- remove stray temp script ([`e14718c`](https://github.com/AdielMag/Hive/commit/e14718c7afb4c14c8553f4273e96d7fe52334a11))
- Merge feat/modules-m3: limits, analytics, tools, context-breakdown, theme-studio modules ([`d0c4ec7`](https://github.com/AdielMag/Hive/commit/d0c4ec79d9568f388e175d838d8785bdecadd1c8))

## v0.13.1 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.13.0...v0.13.1)

### 🧹 Other changes

- Yes ([`168c107`](https://github.com/AdielMag/Hive/commit/168c10772d1bbd50644e13eea4a03b6651c81711))

## v0.13.0 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.12.1...v0.13.0)

### ✨ Features

- **sessions:** subagent activity bridge, deferred model/thinking change markers, cache-switch bar updates ([`68e1223`](https://github.com/AdielMag/Hive/commit/68e1223ad61e3756763f4433f577130ae8c08ba7))
- **modules:** extract terminal module; commands accept args so modules can call each other ([`e15ba6d`](https://github.com/AdielMag/Hive/commit/e15ba6d8397269d57f4b2d9d7e3fec8d3d7bfd43))
- **modules:** extract browser module into modules/browser ([`1efa1e9`](https://github.com/AdielMag/Hive/commit/1efa1e9d6ee1b43ad125737f5287892818f44232))
- **modules:** extract library module into modules/library ([`4775b8a`](https://github.com/AdielMag/Hive/commit/4775b8af6d7eeca43e7603835eafba4e72c0081b))
- **modules:** extract marketplace module into modules/marketplace ([`52b1c70`](https://github.com/AdielMag/Hive/commit/52b1c70807f240222c41787218b8138ac667c826))
- **modules:** renderer registry, module host, shell wiring, Modules settings and first-run picker ([`0e540da`](https://github.com/AdielMag/Hive/commit/0e540daa89e28a50a767f6f1d964f898fa8a07e9))
- **modules:** wire main module host, generic module IPC and preload bridge ([`d61b30a`](https://github.com/AdielMag/Hive/commit/d61b30a7fd494c5f7b0b9c5218488a46ad8d5018))

### 🐛 Fixes

- **modules:** route links through core link-bus and move browser RAM-saver logic into the module ([`cf1cba0`](https://github.com/AdielMag/Hive/commit/cf1cba0ed6d344c6fafbbc76d8434e62504abf77))
- **modules:** repair protocol import and plan service test path ([`5aee047`](https://github.com/AdielMag/Hive/commit/5aee04777fef5f6a5f84ca3297903dd05022eb61))

### 🧹 Other changes

- Merge feat/modules: lean core + module system (plan-previewer, marketplace, library, browser, terminal) ([`77738b7`](https://github.com/AdielMag/Hive/commit/77738b79079b76e1a0a880e7e7ebcc01b5dbf42e))
- Merge origin/main (v0.12.1) ([`5b5f3f9`](https://github.com/AdielMag/Hive/commit/5b5f3f918237c8604fdc7e194e69af7fce7bbbba))
- **modules:** add unit tests for host, agent-assets, presets, registry, codegen and boundaries ([`b192a65`](https://github.com/AdielMag/Hive/commit/b192a65efe275d8f17a909d6f2e0025a3b5f4806))
- Merge branch 'main' into feat/modules ([`54fd2d1`](https://github.com/AdielMag/Hive/commit/54fd2d1290013afe41b6551191e7699bc8d4c5d3))
- pi-agent: Milestone 1 module foundation ([`334acdc`](https://github.com/AdielMag/Hive/commit/334acdc6ed9cf3e3e9520f9150fd9e2368d4e90f))

## v0.12.1 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.12.0...v0.12.1)

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`be581a8`](https://github.com/AdielMag/Hive/commit/be581a82c788bda26f0512e93f0639bf838327b9))
- **insights:** make quota popover opaque and accent-tinted ([`c447630`](https://github.com/AdielMag/Hive/commit/c447630a1135bc900b40d29a32483552840efb5c))

## v0.12.0 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.11.1...v0.12.0)

### ✨ Features

- **desktop:** enhance context breakdown, model switching, and composer ([`79d0c76`](https://github.com/AdielMag/Hive/commit/79d0c76dbedda4329c220535610ab2f96bd4c5d7))

### 🐛 Fixes

- **statusbar:** give quota/cost popover an opaque background ([`df75281`](https://github.com/AdielMag/Hive/commit/df7528196bb910e284e132c239b6a7350b21eeae))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`3d48d03`](https://github.com/AdielMag/Hive/commit/3d48d0318f5d351daa84713d8d4eebeb35015ed7))

## v0.11.1 — 2026-10-03 · [diff](https://github.com/AdielMag/Hive/compare/v0.11.0...v0.11.1)

### 🐛 Fixes

- **updater:** retry release lookup with page fallback and surface check failures ([`409f47e`](https://github.com/AdielMag/Hive/commit/409f47e9a52fed2f41ea754018a5481914072129))

### 🧹 Other changes

- point repository links and update source at AdielMag/Hive ([`660dffe`](https://github.com/AdielMag/Hive/commit/660dffe10f1ca49ebea9b2f3845cb70243766e7a))

## v0.11.0 — 2026-10-03 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.10.0...v0.11.0)

### ✨ Features

- **transcript:** add immediate run action for queued messages ([`8a038f6`](https://github.com/AdielMag/pi-studio/commit/8a038f69e235a2c847477a2b6abba7d6c4ccc1f2))

## v0.10.0 — 2026-10-03 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.9.0...v0.10.0)

### ✨ Features

- redesign README, add visual tour assets, and plan previewer workbench support ([`68775bf`](https://github.com/AdielMag/pi-studio/commit/68775bf83514a3065f7addd77ae87c578b254ece))
- add session image preview lightbox, browser tabs, and command palette ([`c9be800`](https://github.com/AdielMag/pi-studio/commit/c9be80075ed7a67a1f635f7d42c7df211186a92c))
- **statusbar:** add hover/pin session cost popover ([`ab81b58`](https://github.com/AdielMag/pi-studio/commit/ab81b5864fb5ad8bc222e19b86f866a775e3b128))
- **git:** move fetch/pull/push into branch header row ([`95dbe0f`](https://github.com/AdielMag/pi-studio/commit/95dbe0f3e0bd53f8b286067e1f754ec1518ad263))

## v0.9.0 — 2026-10-02 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.8.0...v0.9.0)

### ✨ Features

- **git:** add fetch, pull and push buttons to Git panel ([`d588d69`](https://github.com/AdielMag/pi-studio/commit/d588d693989806445ac7e9d741f9612250efb5bf))
- **ui:** multi-question form for extensions over the Studio bridge ([`15fca79`](https://github.com/AdielMag/pi-studio/commit/15fca79188b18250d23434f72a6c4620753b212c))
- **usage:** per-session usage breakdown and scoping ([`b6cc017`](https://github.com/AdielMag/pi-studio/commit/b6cc017cf70a7974d6c0d700f273606bff0a4267))
- finish Hive rebrand (name, icon, data paths) ([`88e34be`](https://github.com/AdielMag/pi-studio/commit/88e34be4062d0b7d6debad29bbb267df6bdb143c))
- **sidebar:** show session activity state on project session rows ([`38d70ef`](https://github.com/AdielMag/pi-studio/commit/38d70ef833160b5726fcec5c2037c323a241a3f6))
- **context:** open context breakdown in right side panel with redesigned UI ([`2defe11`](https://github.com/AdielMag/pi-studio/commit/2defe111a0fd848e4aae3ef80d7c5e4add84be96))

### 🐛 Fixes

- **quota:** restore subscription limits (5h/weekly + resets) after Hive rebrand ([`d5df396`](https://github.com/AdielMag/pi-studio/commit/d5df396d51c143aba21059ffda3862a2d8c3fabc))

### 🧹 Other changes

- **desktop:** refresh tsconfig.node tsbuildinfo ([`a19b0e4`](https://github.com/AdielMag/pi-studio/commit/a19b0e4850d5fdc55989d5d2c4d97abf5861efff))
- Show compact MCP chip with tooltip in status bar ([`e230718`](https://github.com/AdielMag/pi-studio/commit/e2307182478a339058ff10aa11f9e23737be9706))

## v0.8.0 — 2026-10-02 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.7.0...v0.8.0)

### ✨ Features

- rebrand to Hive and redesign sidebar with project management ([`9dfde99`](https://github.com/AdielMag/pi-studio/commit/9dfde999b27a30cbc2b708ea9e9a55acfb38aab8))

### 🐛 Fixes

- update internal package imports from @pi-studio/* to @hive/* ([`b13ca30`](https://github.com/AdielMag/pi-studio/commit/b13ca302901aeeb87558988fa0b8ec434c8932df))

## v0.7.0 — 2026-10-02 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.6.1...v0.7.0)

### ✨ Features

- **tools-panel:** collapsible sections and clearer subagent rows ([`7072ef8`](https://github.com/AdielMag/pi-studio/commit/7072ef86356e15fc04db8ce5bf63ff222cd4bbf8))
- **library:** calmer Skills & Agents view with progressive disclosure ([`63034a7`](https://github.com/AdielMag/pi-studio/commit/63034a798ff39f86eaec3e6d1c8a8a02e0806a4a))

## v0.6.1 — 2026-10-02 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.6.0...v0.6.1)

### 🐛 Fixes

- **context:** breakdown counts live messages + system prompt overhead; redesign panel ([`78fef49`](https://github.com/AdielMag/pi-studio/commit/78fef49eeb333264b7923955b567fc2602e3c9be))

## v0.6.0 — 2026-10-02 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.5.0...v0.6.0)

### ✨ Features

- **updater:** show download/install progress when applying an update ([`57d3f4e`](https://github.com/AdielMag/pi-studio/commit/57d3f4e3b049f09e30c8c9f1747d48aa827199b0))

### 🐛 Fixes

- **main:** app fails to open — __dirname undefined in ESM main bundle ([`773999e`](https://github.com/AdielMag/pi-studio/commit/773999ebac62a89eaf6cea4c28aa08af1a10ddf5))

## v0.5.0 — 2026-10-02 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.4.2...v0.5.0)

### ✨ Features

- Skills & Agents library tab, AI tools panel, subagent transcripts, % compaction ([`16886eb`](https://github.com/AdielMag/pi-studio/commit/16886eb0b29e53aab13df85701a91f6a871c87e9))

## v0.4.2 — 2026-10-01 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.4.1...v0.4.2)

### 🐛 Fixes

- **packaging:** bundle the Pi bridge so packaged sessions don't crash on start ([`ea4d697`](https://github.com/AdielMag/pi-studio/commit/ea4d6973a4415a3ee05e98303339ee602df326b8))

## v0.4.1 — 2026-10-01 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.4.0...v0.4.1)

### 🐛 Fixes

- **renderer:** recover from dead Pi sessions instead of failing model/thinking changes ([`3475c74`](https://github.com/AdielMag/pi-studio/commit/3475c74d16a3c68369a82259637d2317c9c48bb1))

## v0.4.0 — 2026-10-01 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.3.0...v0.4.0)

### ✨ Features

- **ui:** add copyable error banner, dynamic thinking levels, mode picker, branches window, and AI usage insights ([`37780d7`](https://github.com/AdielMag/pi-studio/commit/37780d71310bddfce4ca50f4ecb800f50476a163))

### 🐛 Fixes

- **typecheck:** resolve unused variables and test types for strict typecheck ([`487e14c`](https://github.com/AdielMag/pi-studio/commit/487e14c2f6d45008da2efae55cf6f8a19028f88b))

## v0.3.0 — 2026-10-01 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.2.0...v0.3.0)

### ✨ Features

- **locator:** enhance Pi CLI path locator and environment detection ([`55c4c24`](https://github.com/AdielMag/pi-studio/commit/55c4c240f68949c09fcf0ad801a3d004751fd74f))

### 🐛 Fixes

- **renderer:** resolve model dropdown selection not changing active model ([`bb8b6d1`](https://github.com/AdielMag/pi-studio/commit/bb8b6d16e53e21f51f36144ab67f6d0373f6e476))

## v0.2.0 — 2026-10-01 · [diff](https://github.com/AdielMag/pi-studio/compare/v0.1.0...v0.2.0)

### ✨ Features

- **code:** Rider-style syntax highlighting, markdown transcript, rich tool cards and exact copy ([`71bf2d1`](https://github.com/AdielMag/pi-studio/commit/71bf2d17b433aec23375d106c214750f502082ac))
- **appearance:** Arc-style theme engine with colour pad, intensity, grain, presets and live preview ([`f1d6d9b`](https://github.com/AdielMag/pi-studio/commit/f1d6d9bef2f6e2c0f3b764c923ecfb5b9b392ca5))
- **insights:** subscription limits (5h/weekly + reset times) and usage analytics window ([`287795b`](https://github.com/AdielMag/pi-studio/commit/287795b7e09855bafb5f05b68c983fb4fc0db0a8))
- implement context breakdown drawer, integrated terminal, and models settings ([`4034c8a`](https://github.com/AdielMag/pi-studio/commit/4034c8a0647ae9d6fdd0ffad71d5e5185553b840))

### 🐛 Fixes

- **packaging:** ship resources asar-unpacked so installed builds can start Pi sessions ([`7481e2a`](https://github.com/AdielMag/pi-studio/commit/7481e2a66abf41eb4c8d8f39491303063bec2e83))
- **build:** set executableName for linux AppImage packaging ([`2f7435c`](https://github.com/AdielMag/pi-studio/commit/2f7435cdb74a9f61b526358303becb8ac69cf100))

### ⚡ Performance

- **renderer:** shallow store selectors, single init, memoized rows, lazy-loaded heavy views ([`4349a11`](https://github.com/AdielMag/pi-studio/commit/4349a11fdf60030294a7b20638fe680a60f0fa50))

### ♻️ Refactoring

- **main:** split main process into AppContext, per-domain IPC modules and services ([`67e8f98`](https://github.com/AdielMag/pi-studio/commit/67e8f98dcb00c378726445780dee8f28a79c9404))

### 📝 Documentation

- detailed README, screenshots and screenshot tooling ([`3933782`](https://github.com/AdielMag/pi-studio/commit/39337820fbff85f51ba40464ce95d232b4116787))

### 🔧 CI / build

- automatic semver releases with generated changelog on every merge to main ([`94bbb2d`](https://github.com/AdielMag/pi-studio/commit/94bbb2db27be51fb5685366f7678a78d4f8f55c2))

### 🧹 Other changes

- **packaging:** platform-independent asar path mapping test ([`52f5158`](https://github.com/AdielMag/pi-studio/commit/52f515881deffdfe2b11428f3445ad71f4094800))
- remove stale screenshots and capture scripts ([`501bbe8`](https://github.com/AdielMag/pi-studio/commit/501bbe85773b5d701e4c0218d2081db3940b7d65))
