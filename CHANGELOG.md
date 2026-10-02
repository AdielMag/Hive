# Changelog

All notable changes to Hive are documented here. This file is generated on every merge to `main`.

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
