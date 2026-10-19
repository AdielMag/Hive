# Changelog

All notable changes to Hive are documented here. This file is generated on every merge to `main`.

## v0.34.1 — 2026-10-19 · [diff](https://github.com/AdielMag/Hive/compare/v0.34.0...v0.34.1)

### 🐛 Fixes

- **transcript:** keep tool batch key stable as calls are added ([`ff6e778`](https://github.com/AdielMag/Hive/commit/ff6e778d2639a704f0877e4961f0727e95188b95))

## v0.34.0 — 2026-10-18 · [diff](https://github.com/AdielMag/Hive/compare/v0.33.0...v0.34.0)

### ✨ Features

- **sessions:** add live Archive old tidy tab with progress view ([`773f737`](https://github.com/AdielMag/Hive/commit/773f73731dd2b9ec368d457957ddd10be92785f7))
- **worktree:** show finished state after merging worktree ([`52c6f6b`](https://github.com/AdielMag/Hive/commit/52c6f6b94f183e3016b44ce0090545acebd25abd))
- **composer:** add shell-style up/down message history recall ([`b6d27f3`](https://github.com/AdielMag/Hive/commit/b6d27f344124400a90bd37a0ce1cae86ac5ffda9))
- **sessions:** use feature model config for archive-old tidy action ([`3b1ca62`](https://github.com/AdielMag/Hive/commit/3b1ca62cc2b7ac0e82fc6cfd1851edee8ec833f6))
- **desktop:** stop subagents and reflect them in composer state ([`feb5def`](https://github.com/AdielMag/Hive/commit/feb5def58c900b96b63254aead658b712651c85b))

### 🐛 Fixes

- **transcript:** skip turn, marker and jev-enforce items when finding closing calls ([`22a6b3f`](https://github.com/AdielMag/Hive/commit/22a6b3ff550b67f371eee628940c4f394ff2dfe8))
- **actions:** show GhLoginCard when token source is git ([`77a25c5`](https://github.com/AdielMag/Hive/commit/77a25c54c65a785306dc4bb2876d8118fc20c521))

### 🧹 Other changes

- Merge branch 'hive/the-archive-old-popup-is-very-ugly-i-86b175' ([`f55022a`](https://github.com/AdielMag/Hive/commit/f55022ab2059a4d3d3891a3d5cb75e829305c2e0))
- Merge branch 'hive/after-merging-it-shows-a-small-merge-ca6c94' ([`b8656ad`](https://github.com/AdielMag/Hive/commit/b8656ad1d21851e686858c2d19cb208e7a1c2dad))
- Merge branch 'hive/we-added-a-logic-that-auto-collapses-53a038' ([`a279440`](https://github.com/AdielMag/Hive/commit/a2794405766ccb68bbdd253058a2c39dc741a259))
- Merge branch 'hive/the-archive-old-in-session-window-is-740ad0' ([`934f39e`](https://github.com/AdielMag/Hive/commit/934f39e55ecd350224bafef1825ad1bd46eb299a))
- Merge branch 'hive/in-a-session-the-send-button-should-997c9d' ([`8f522c4`](https://github.com/AdielMag/Hive/commit/8f522c4712399f448ec89c419e9278dd159c3e47))

## v0.33.0 — 2026-10-18 · [diff](https://github.com/AdielMag/Hive/compare/v0.32.0...v0.33.0)

### ✨ Features

- **tidy:** detect squash/rebase-merged worktree branches ([`7248ee4`](https://github.com/AdielMag/Hive/commit/7248ee40f709be67f08d1c896a2a240f3994af48))
- **worktrees:** add AI-assisted merge conflict resolution ([`9831b97`](https://github.com/AdielMag/Hive/commit/9831b9786b5cfa1d1b96e96aed29bda91f25e172))
- **theme-engine:** increase arc frame and tint color intensity ([`f3ed2a4`](https://github.com/AdielMag/Hive/commit/f3ed2a465483237052e6cae783cfb56a7bcaeab4))
- **actions:** add "Fix it" action to open agent session for failed runs ([`5c317d3`](https://github.com/AdielMag/Hive/commit/5c317d326c5448782f424fae1dfeac5bdb825f20))
- **actions:** add in-app gh login flow and signed-out indicator ([`8dad71f`](https://github.com/AdielMag/Hive/commit/8dad71feebe70b83e07ea3046e6c3a71baf68db7))
- **ui:** add design system doc and wrap hover styles in hover media queries ([`9d0a602`](https://github.com/AdielMag/Hive/commit/9d0a6026598a8247ff343287b38ae8b79c130c20))
- **desktop:** extract mention parsing helpers and add tests ([`aaa8dd9`](https://github.com/AdielMag/Hive/commit/aaa8dd962dcf282420226047712dc7f94fe5f0ee))
- **composer:** add @file and /command autocomplete to prompt input ([`e03bd75`](https://github.com/AdielMag/Hive/commit/e03bd75dd2b40895adcbb7add4f20110049132ec))
- **transcript:** collapse closing module-card calls into one row ([`3a647d5`](https://github.com/AdielMag/Hive/commit/3a647d599b2e5be79753885acbb5dccd1babf92e))
- **worktrees:** add tidy dialog to clean unused Hive worktrees ([`135c0ab`](https://github.com/AdielMag/Hive/commit/135c0ab0d9b5c936cb994056a41ac0a749c2044a))
- **worktree:** keep session open after merge ([`fd0bbac`](https://github.com/AdielMag/Hive/commit/fd0bbac0e4348d378124ea6df7850ebf5c48016d))
- **tools:** replace usage chips with ranked bars and error stats ([`4aa64b4`](https://github.com/AdielMag/Hive/commit/4aa64b4de52a9ff88ede033c426e7430dfd0e6ee))
- **sessions:** add LLM-assisted "Archive old" action ([`e62f900`](https://github.com/AdielMag/Hive/commit/e62f900998533aada0911ec9d428336a777b49dd))
- **statusbar:** redesign cost popover with token mix and context meter ([`acc7c9f`](https://github.com/AdielMag/Hive/commit/acc7c9ff9bedbc3ef197a92d90788e30a81f9490))

### 🐛 Fixes

- **actions:** silence no-control-regex lint ([`6033415`](https://github.com/AdielMag/Hive/commit/60334159bac84295ce415beebd0a158f19fde5a5))
- **actions:** replace removed lucide Github icon with LogIn ([`4c8d92e`](https://github.com/AdielMag/Hive/commit/4c8d92ea917c012ac0858d37e92b06d4bfd2ea82))
- **desktop:** drop useless regex escape in stale-sessions (lint) ([`7c2c5e7`](https://github.com/AdielMag/Hive/commit/7c2c5e7cf850cd9cb4ccdc927b56e24ffb9a7072))
- **session:** show pending indicator for warm idle session prompts ([`3e4d886`](https://github.com/AdielMag/Hive/commit/3e4d88660f1fd3fa1d6ac3de627ef2ea20351170))

### 🧹 Other changes

- **worktrees:** compare tidy worktree paths via realpath (Windows 8.3) ([`83c5cd8`](https://github.com/AdielMag/Hive/commit/83c5cd8e1332d64daab6cb89a6d1b01f2cca2552))
- **theme-engine:** loosen arc frame chroma bound ([`b4578bf`](https://github.com/AdielMag/Hive/commit/b4578bf172c467db7b79ba70710596e5a81969e5))
- **theme-engine:** update arc frame chroma bound after intensity increase ([`7081c6a`](https://github.com/AdielMag/Hive/commit/7081c6adb99ceb02baab7db1120fe0fd8466e4a8))
- Merge branch 'hive/the-tidy-up-session-button-and-logic-1ac12c' ([`45f56d6`](https://github.com/AdielMag/Hive/commit/45f56d66ca9d3401b6b5f54bbef3fb4c3f120f17))
- Merge branch 'hive/whever-we-try-to-merge-and-get-a-mer-57b33f' ([`e25cb1d`](https://github.com/AdielMag/Hive/commit/e25cb1d69cb6dbca2f2ffb6cf0e7f79a926f637e))
- Merge origin/main into fix-it branch ([`0391ae5`](https://github.com/AdielMag/Hive/commit/0391ae5c18eea04d2414f986ceac15ba922efc9b))
- Merge branch 'hive/review-hive-with-emil-skills-and-imp-e715a7' ([`40f6f9a`](https://github.com/AdielMag/Hive/commit/40f6f9ad0e2aa301cc9c5f770c8a47aa1bd6e7d9))
- Merge branch 'hive/in-the-message-area-whevenver-we-use-9eb235' ([`3750d34`](https://github.com/AdielMag/Hive/commit/3750d3447f3254737c4f59dba2d9ce4d76274e83))
- Merge branch 'hive/a-lot-of-times-when-an-agent-finshed-10e81d' ([`77b250e`](https://github.com/AdielMag/Hive/commit/77b250e4742a36eeeede7b0a3147e635a54c23cb))
- Merge branch 'hive/whevner-we-merge-a-session-it-closes-68bafd' ([`3ffa6d3`](https://github.com/AdielMag/Hive/commit/3ffa6d30ab193d620681b4314417fab53aec035c))
- Merge branch 'hive/tools-breakdown-looks-bad-imrpvoe-it-7911fb' ([`7797259`](https://github.com/AdielMag/Hive/commit/77972596a764f6554c82ee47a475692661232867))
- Merge branch 'hive/in-the-session-windows-add-a-button-86d41a' ([`46fb9de`](https://github.com/AdielMag/Hive/commit/46fb9de0e8a26b4281e74d6b9161bd58a9468193))
- Merge branch 'hive/improve-session-cost-window-needs-to-28165b' ([`0a854ec`](https://github.com/AdielMag/Hive/commit/0a854ec64732fc858d0b2613d17c17cc263c920b))

## v0.32.0 — 2026-10-18 · [diff](https://github.com/AdielMag/Hive/compare/v0.31.0...v0.32.0)

### ✨ Features

- **desktop:** add shortcuts cheatsheet, retry action, and design critiques ([`2a63343`](https://github.com/AdielMag/Hive/commit/2a63343bb5d3c7dcdfc0ac3a3edb3c0dd0ad6a8a))
- **settings:** grouped nav, clearer labels, token quota colours, plain-language errors ([`0bae421`](https://github.com/AdielMag/Hive/commit/0bae4214d0861edf9f6140126a2130c08b1e05d5))
- **sessions:** nest subagent runs under their parent, empty-state recents and starters ([`10de474`](https://github.com/AdielMag/Hive/commit/10de4749046d238ac1cf62d07b73284fec813789))
- **shell:** styled rail tooltips, theme-accent tabs, no project dot in chrome ([`2271380`](https://github.com/AdielMag/Hive/commit/2271380135d7199d5a9b0194dfbef28160a15323))
- **composer:** labelled context ring with thresholds, reload tooltip, Auto Edit hint ([`eb3868c`](https://github.com/AdielMag/Hive/commit/eb3868c4662e6e9fefdd56003868127341cde20f))
- **ui:** subagent-session grouping helpers, Tooltip component; drop dead Sidebar.tsx ([`887874d`](https://github.com/AdielMag/Hive/commit/887874d948c1e1d0f76e40afd4ace7f5e33a4880))
- **modules:** monotone spend chart, clear quota labels, branch picker width, focus rings ([`81a5e92`](https://github.com/AdielMag/Hive/commit/81a5e92601aba3fbf07c1b84530d511146e4a09d))
- **composer:** neutral chips, loading state, motion and a11y polish ([`704ee33`](https://github.com/AdielMag/Hive/commit/704ee33eca57ab27bcb3ec2be804955496dbe984))
- **modules:** drop side stripes, monotone spend chart, clear quota labels, focus rings ([`9e2109e`](https://github.com/AdielMag/Hive/commit/9e2109ec74edd53a47af48836d2ec516ba5e4816))
- **sidebar:** two-line session rows, short branch labels, safer discard ([`25ec429`](https://github.com/AdielMag/Hive/commit/25ec429772970f9b09fb443b8c6a7358eea063ea))
- **shell:** no onboarding flash, narrow-window layout, quiet update pill, a11y sweep ([`a377f35`](https://github.com/AdielMag/Hive/commit/a377f353238a2d9615d518933f7b9bb761fbf761))
- **theme:** neutral frame and surface ladder, 4.5:1 muted text, press states ([`73b553c`](https://github.com/AdielMag/Hive/commit/73b553cdcdcff7cc5b5bbd3eee6afd3cefc465eb))
- **session:** show startup progress for a new session's first prompt ([`3f1d6da`](https://github.com/AdielMag/Hive/commit/3f1d6da1b9963f71647eb03418a5a75e16222877))

### 🐛 Fixes

- **shell:** overlay never opens on resize; openers exempt from outside-click dismiss ([`688dd79`](https://github.com/AdielMag/Hive/commit/688dd799535467d4ddaf6706faf845b7a9fe9abb))
- **shell:** right-panel overlay follows any opener, safer dismiss; quieter composer focus halo ([`41da4f1`](https://github.com/AdielMag/Hive/commit/41da4f1313e45cefae1f975972806554b7c7a5f7))
- **auth:** release pending login prompts and stop re-prompt spin ([`db35c11`](https://github.com/AdielMag/Hive/commit/db35c11486486b7c6187c8ea4bb672ad551e65a6))

### 🧹 Other changes

- Merge main into hive/use-taste-skills-and-emil-diesi-ecb26b ([`265f1f8`](https://github.com/AdielMag/Hive/commit/265f1f8117b9e1821208408f382f1dfd8ed3a68a))
- Merge branch 'main' of https://github.com/AdielMag/Hive ([`e0d77da`](https://github.com/AdielMag/Hive/commit/e0d77dad6e19347cc8180d9e4d67abb3aa721b3f))
- Merge branch 'pi-agent-c11c4d00-eb4c-4e0' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`3708fc6`](https://github.com/AdielMag/Hive/commit/3708fc65ecdb8ff054e5607d62df7ae40d545fa5))
- Merge branch 'pi-agent-b92e12b0-6f3e-495' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`ba8bb9b`](https://github.com/AdielMag/Hive/commit/ba8bb9b0b17e2a4c35bc6371b4c43c7589572261))
- Merge branch 'pi-agent-6592cd57-1610-4dd' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`1322b94`](https://github.com/AdielMag/Hive/commit/1322b94d10d47a279cf75ec83fc9927f37f31e5f))
- pi-agent: R2 WP-D settings quota errors ([`d5c6d1c`](https://github.com/AdielMag/Hive/commit/d5c6d1c031c83ae1d0ca1dbababf27824a7544c4))
- pi-agent: R2 WP-A nested agent sessions ([`f118830`](https://github.com/AdielMag/Hive/commit/f1188304c105849a18bad1de86c41651c8533d1c))
- pi-agent: R2 WP-C composer ring hint ([`e5ad29a`](https://github.com/AdielMag/Hive/commit/e5ad29aa5de73b049ab48715744b4b87e86d9daf))
- restore tsbuildinfo ([`3d7dad5`](https://github.com/AdielMag/Hive/commit/3d7dad57112c26cf382f7f80a590ccd57cd820e7))
- Merge branch 'pi-agent-b36f856c-2175-46f' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`bf02bb3`](https://github.com/AdielMag/Hive/commit/bf02bb39d06eac39aba7570fd0ffb34ccc631c3f))
- Merge branch 'pi-agent-24763ef7-0bcd-479' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`767a2a7`](https://github.com/AdielMag/Hive/commit/767a2a7031737c53349593666b0f84147036b70b))
- Merge branch 'pi-agent-25d45cea-c014-44c' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`d408563`](https://github.com/AdielMag/Hive/commit/d4085630ddfe6260d95b52b3cb28ed86761eec30))
- Merge branch 'pi-agent-acc9f14d-ff87-408' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`6c105f0`](https://github.com/AdielMag/Hive/commit/6c105f01494383bb7d210eaf179e5b5a2ad14972))
- Merge branch 'pi-agent-9e82f1fa-56e1-4ba' into hive/use-taste-skills-and-emil-diesi-ecb26b ([`196a3a4`](https://github.com/AdielMag/Hive/commit/196a3a4e58b3dc2232ebd3abed8c7626dcf44ef7))
- pi-agent: WP-D composer and transcript ([`5b61e1e`](https://github.com/AdielMag/Hive/commit/5b61e1ed5e030a4f45d3fe6795534fe2c6223c5f))

## v0.31.0 — 2026-10-16 · [diff](https://github.com/AdielMag/Hive/compare/v0.30.0...v0.31.0)

### ✨ Features

- **worktree:** clean up worktrees after merge and recreate on resume ([`4bb196a`](https://github.com/AdielMag/Hive/commit/4bb196af40fb1ef81f8a7438b24db286f303ed52))
- **desktop:** link extra folders to project workspaces ([`9afcbb5`](https://github.com/AdielMag/Hive/commit/9afcbb54145e40abe10edeb925a3ad791057a9f7))
- **worktree-bar:** auto-stage all changes before AI auto-commit ([`bb7fa90`](https://github.com/AdielMag/Hive/commit/bb7fa905a90600e0668a3bfb11b437cbaef58c66))

### 🧹 Other changes

- Merge branch 'hive/worktree-are-not-being-deleted-at-al-0a5094' ([`2b66e7c`](https://github.com/AdielMag/Hive/commit/2b66e7c819bfc293926169b0b080e2160179dd5f))
- Merge branch 'hive/now-in-the-dropdown-there-is-now-way-bc0578' ([`511c2ca`](https://github.com/AdielMag/Hive/commit/511c2ca35f2faf2edff52e4fdc80fa99e7eb3d7f))

## v0.30.0 — 2026-10-16 · [diff](https://github.com/AdielMag/Hive/compare/v0.29.1...v0.30.0)

### ✨ Features

- **worktree:** follow session worktree in git panels, auto commit, topbar redesign ([`5a06372`](https://github.com/AdielMag/Hive/commit/5a063720eb9be3ab00b2e0004ea8d571a78c364b))
- **module-sdk:** add cwd to ToolCardCall interface ([`a590f72`](https://github.com/AdielMag/Hive/commit/a590f725ee27528c66aae4653bc8e5c55ab1d83b))
- **transcript:** batch consecutive tool operations in single row with light data pills ([`17e2302`](https://github.com/AdielMag/Hive/commit/17e23025f40724941d31ca0b3a5ebd7a65422733))
- **renderer:** redesign session usage and cost breakdown panel ([`9d63ca3`](https://github.com/AdielMag/Hive/commit/9d63ca3fb27a92185e79ba2f4ac3b134905c670e))
- **updater:** separate Pi CLI and extensions in Settings Updates ([`135ca0c`](https://github.com/AdielMag/Hive/commit/135ca0c575ace09aeb442dcbfac169cecc7cfdae))
- **branches:** show worktrees in git branches window and use descriptive session branch names ([`26d621c`](https://github.com/AdielMag/Hive/commit/26d621c307378e3fc59d77f526f8399c896da12a))

### 🐛 Fixes

- **desktop:** narrow WorktreeRenameResult in worktrees test ([`876db8e`](https://github.com/AdielMag/Hive/commit/876db8e441fb6bae13d3505bdcbeb9f3fbae3843))
- **module-sdk:** restore worktree on ActiveSessionContext ([`8342333`](https://github.com/AdielMag/Hive/commit/83423332203101648b848415c097506b6ca60931))
- **plan-previewer:** scope plan approval to its own session ([`f3d0cff`](https://github.com/AdielMag/Hive/commit/f3d0cff46a7c320791d53769a2e0165c7c6582d4))
- **cache-bar:** decide auto-compact at send time from live store ([`0fad5c4`](https://github.com/AdielMag/Hive/commit/0fad5c47fff14b30436378e7dacd26a6ed8ac984))
- **workbench:** restore project dropdown interactivity and preserve active project on tab close ([`3a3ba1c`](https://github.com/AdielMag/Hive/commit/3a3ba1c604b48d0ff0fd1bceb94a0c3254c9ebd9))

### ♻️ Refactoring

- **module-sdk:** remove worktree from ActiveSessionContext ([`ce49076`](https://github.com/AdielMag/Hive/commit/ce4907651cbe99a9b374a7dea69a7de919057fbe))

### 🧹 Other changes

- Merge branch 'hive/session-acf623' ([`4b97b52`](https://github.com/AdielMag/Hive/commit/4b97b523ce52e18f95b84fd7f0e984a26597ba06))
- Merge branch 'hive/session-8cbf84' ([`8e90968`](https://github.com/AdielMag/Hive/commit/8e90968d6be5214005b3b6761d5cd1e4cb022aaf))
- Merge branch 'hive/session-71fa15' ([`a74e615`](https://github.com/AdielMag/Hive/commit/a74e61523c56e3f3a1dbb8c889e02a3510f34d9d))
- Merge branch 'hive/session-a74331' ([`8279a03`](https://github.com/AdielMag/Hive/commit/8279a03ee85cc4bed655c6c2522960fc02de631e))
- Merge branch 'hive/session-97e79d' ([`798dee2`](https://github.com/AdielMag/Hive/commit/798dee2fd2a66a4b63b5667c038c7787caa299c4))
- Merge branch 'hive/session-f4ba53' ([`eac27ad`](https://github.com/AdielMag/Hive/commit/eac27adbd0edcfeea1e366cdcf3e86a87a141710))
- Merge branch 'hive/session-944426' ([`adfb662`](https://github.com/AdielMag/Hive/commit/adfb6623a86e8d8751b1bffa29ce483c7227ef58))

## v0.29.1 — 2026-10-15 · [diff](https://github.com/AdielMag/Hive/compare/v0.29.0...v0.29.1)

### 🐛 Fixes

- **renderer:** prevent infinite render loop in ProjectPicker and UsagePanel ([`e97e5d0`](https://github.com/AdielMag/Hive/commit/e97e5d07594b77fd191bc07c4dea1d46f51d54a3))

## v0.29.0 — 2026-10-15 · [diff](https://github.com/AdielMag/Hive/compare/v0.28.0...v0.29.0)

### ✨ Features

- **workspace:** redesign topbar picker, sessions rail, bottom terminal, usage & jev panel, transcript batching ([`02d7bad`](https://github.com/AdielMag/Hive/commit/02d7bad6346afdc5c912cf2de2f1a4c750b00921))

### 🐛 Fixes

- **worktrees:** use realpathSync.native to expand Windows 8.3 short paths ([`ec6d107`](https://github.com/AdielMag/Hive/commit/ec6d107661664b4175c6f20bf23ef4e1fe7934b7))
- **worktrees:** add diagnostics and use realpathSync for path comparisons ([`d067890`](https://github.com/AdielMag/Hive/commit/d067890171f21ba148fb330d25e044fc67d6fe8d))
- **worktrees:** canonicalize paths using realpathSync to handle 8.3 short paths on windows runners ([`5b1533d`](https://github.com/AdielMag/Hive/commit/5b1533d1d8b7fbf929cbf8247c820018fa09253d))
- **ci:** fix eslint prefer-const and adjust unit test timeout for windows ([`cb6c7af`](https://github.com/AdielMag/Hive/commit/cb6c7afb8ad55662f841fd0260072f0e83caf180))

## v0.28.0 — 2026-10-11 · [diff](https://github.com/AdielMag/Hive/compare/v0.27.1...v0.28.0)

### ✨ Features

- **browser,auth:** respect manual sleep and add auth code timeout ([`2fa0061`](https://github.com/AdielMag/Hive/commit/2fa006181e105f214c03f1922e00238213545ba2))

## v0.27.1 — 2026-10-10 · [diff](https://github.com/AdielMag/Hive/compare/v0.27.0...v0.27.1)

### ♻️ Refactoring

- **host:** add openSystemBrowser, refactor openExternal ([`371f6ad`](https://github.com/AdielMag/Hive/commit/371f6ad2849cca20f03c5372a6348d0fce2b6151))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`685223a`](https://github.com/AdielMag/Hive/commit/685223a02ba191aeabd843dd59f87c8ab30ff548))

## v0.27.0 — 2026-10-10 · [diff](https://github.com/AdielMag/Hive/compare/v0.26.0...v0.27.0)

### ✨ Features

- **git:** add background fetch with throttling and backoff ([`2e8aa95`](https://github.com/AdielMag/Hive/commit/2e8aa95731114b3d6814a3a001f65de854df3228))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`e30d11d`](https://github.com/AdielMag/Hive/commit/e30d11d3c7c429588095b997a4453ccc5bf3c015))

## v0.26.0 — 2026-10-10 · [diff](https://github.com/AdielMag/Hive/compare/v0.25.2...v0.26.0)

### ✨ Features

- **actions:** redesign run workflow as full-height sheet ([`e992b2f`](https://github.com/AdielMag/Hive/commit/e992b2f99ce44aa60270133de1194dfda95ee419))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`cdd9094`](https://github.com/AdielMag/Hive/commit/cdd909438dd339b27dd5e70db4910738c6084132))

## v0.25.2 — 2026-10-09 · [diff](https://github.com/AdielMag/Hive/compare/v0.25.1...v0.25.2)

### 📝 Documentation

- **actions:** add GitHub Actions panel UI redesign plan ([`7edeff8`](https://github.com/AdielMag/Hive/commit/7edeff81cd723f54f928165affa3986a134c014a))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`9015115`](https://github.com/AdielMag/Hive/commit/9015115713edee15a64ef07f4902f73f7fac144e))

## v0.25.1 — 2026-10-09 · [diff](https://github.com/AdielMag/Hive/compare/v0.25.0...v0.25.1)

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`8bf6e95`](https://github.com/AdielMag/Hive/commit/8bf6e959e6218012f37e101314037ba06aabd9ea))
- **desktop:** update TypeScript build cache ([`d84022a`](https://github.com/AdielMag/Hive/commit/d84022ad46f0a8cf3b4194b54ed585fdbb49a030))

## v0.25.0 — 2026-10-09 · [diff](https://github.com/AdielMag/Hive/compare/v0.24.0...v0.25.0)

### ✨ Features

- **git:** add fetch button and refactor sync operations ([`2e6b8c2`](https://github.com/AdielMag/Hive/commit/2e6b8c28a09fb9cb70e3b4681e5c70508222f403))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`3c74a39`](https://github.com/AdielMag/Hive/commit/3c74a398f5e895baeb4c090bf46aac6f2fae0364))

## v0.24.0 — 2026-10-09 · [diff](https://github.com/AdielMag/Hive/compare/v0.23.0...v0.24.0)

### ✨ Features

- **desktop:** add GitHub Actions module ([`1c9e643`](https://github.com/AdielMag/Hive/commit/1c9e6433c873c5c0b5d556a0c38b37b37ad3c66f))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`e880f0a`](https://github.com/AdielMag/Hive/commit/e880f0a82e955e10786d8f4a5c64ad036d22736f))

## v0.23.0 — 2026-10-09 · [diff](https://github.com/AdielMag/Hive/compare/v0.22.0...v0.23.0)

### ✨ Features

- **desktop:** Add video attachments and question-asked sound effect ([`3b3d0e0`](https://github.com/AdielMag/Hive/commit/3b3d0e0fc8c8b1090e5b3f14651a9999da5b8507))

## v0.22.0 — 2026-10-07 · [diff](https://github.com/AdielMag/Hive/compare/v0.21.0...v0.22.0)

### ✨ Features

- **desktop:** add target line highlighting and fileManagerLabel ([`78af55f`](https://github.com/AdielMag/Hive/commit/78af55f7b82bc9b5e5cd3f40843ed3431e5c15a8))
- **desktop:** add procedural sound engine, file links, and run timer ([`94fadc1`](https://github.com/AdielMag/Hive/commit/94fadc11bfc306fbeb1ed393ea7326cc2923f0b7))
- **desktop:** add image viewer, file reveal, and tab origin routing ([`bf2ce01`](https://github.com/AdielMag/Hive/commit/bf2ce012a349e305148c4c5e1e291046205e213d))

## v0.21.0 — 2026-10-06 · [diff](https://github.com/AdielMag/Hive/compare/v0.20.0...v0.21.0)

### ✨ Features

- **desktop:** per-session reload button and progress strip in the composer ([`7532cfc`](https://github.com/AdielMag/Hive/commit/7532cfccaea7f389509c0cc937217ce80e47cc37))

## v0.20.0 — 2026-10-06 · [diff](https://github.com/AdielMag/Hive/compare/v0.19.1...v0.20.0)

### ✨ Features

- **desktop:** add Reload Pi action to status bar and command palette ([`2423a4e`](https://github.com/AdielMag/Hive/commit/2423a4e02d6a0f96f65cbb5028ec912d73035d80))
- **desktop:** redesign model-switch cache bar with token delta meter ([`b592f66`](https://github.com/AdielMag/Hive/commit/b592f66a68a7feaea3239c336fb7d938e0749500))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`eafd541`](https://github.com/AdielMag/Hive/commit/eafd5415d73c628de7ebe4d63d044913a461c88d))

## v0.19.1 — 2026-10-05 · [diff](https://github.com/AdielMag/Hive/compare/v0.19.0...v0.19.1)

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`99f9e26`](https://github.com/AdielMag/Hive/commit/99f9e26c978e8c3486562afc31f7ad166a8e4cd1))
- readme changes ([`6761a3b`](https://github.com/AdielMag/Hive/commit/6761a3b2c46454430ba2d78525ccc80a06251a6e))

## v0.19.0 — 2026-10-05 · [diff](https://github.com/AdielMag/Hive/compare/v0.18.0...v0.19.0)

### ✨ Features

- **desktop:** add searchable model picker and surface input-waiting state ([`89c5ed2`](https://github.com/AdielMag/Hive/commit/89c5ed2e1a04a817c0b7642a5d91fbd24c76ca6a))

## v0.18.0 — 2026-10-05 · [diff](https://github.com/AdielMag/Hive/compare/v0.17.0...v0.18.0)

### ✨ Features

- **terminal:** replace pipe shells with a real PTY and add standard terminal features ([`ac4ce44`](https://github.com/AdielMag/Hive/commit/ac4ce44941d7c3910bf7ec0da47783347dc5f638))
- **limits:** compact status bar subscription meters ([`b558f87`](https://github.com/AdielMag/Hive/commit/b558f87fae8866f84a69d08d3d3d1d267cc447f9))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`445eddb`](https://github.com/AdielMag/Hive/commit/445eddbc8d948c7a051b7b642b44e45dcc3cdf3b))

## v0.17.0 — 2026-10-05 · [diff](https://github.com/AdielMag/Hive/compare/v0.16.1...v0.17.0)

### ✨ Features

- **settings:** redesign modules page with icons, search/filters, and card hierarchy ([`61dbd21`](https://github.com/AdielMag/Hive/commit/61dbd21e8e51c97d813e58eb4aa1f064f897c632))

## v0.16.1 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.16.0...v0.16.1)

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`dd8751e`](https://github.com/AdielMag/Hive/commit/dd8751e01d6b3e355e88fc1fd9998c19f1c90ebf))
- Gp ([`ef7be26`](https://github.com/AdielMag/Hive/commit/ef7be26a356a519b0f50684a6289cd6e619f2f5b))

## v0.16.0 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.15.1...v0.16.0)

### ✨ Features

- **desktop:** add settings accounts slot and Jev provider support ([`39ec98e`](https://github.com/AdielMag/Hive/commit/39ec98ec564b2f139e3b3085e614f652d1d5aeee))

### 🧹 Other changes

- Merge branch 'main' of https://github.com/AdielMag/Hive ([`df2d98a`](https://github.com/AdielMag/Hive/commit/df2d98aeae400b786747407c75529c493fc76b04))

## v0.15.1 — 2026-10-04 · [diff](https://github.com/AdielMag/Hive/compare/v0.15.0...v0.15.1)

### 🧹 Other changes

- **git:** make branch listing test hermetic (CI has no local main/master) ([`6725b0f`](https://github.com/AdielMag/Hive/commit/6725b0fd04221aabe77ec039d9bff1d09b96a5af))

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
