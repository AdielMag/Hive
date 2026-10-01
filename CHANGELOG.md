# Changelog

All notable changes to Pi Studio are documented here. This file is generated on every merge to `main`.

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
