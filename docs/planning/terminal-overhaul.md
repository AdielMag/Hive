# Terminal overhaul: real PTY and standard terminal features

The terminal module spawns shells with plain pipes (`child_process.spawn`, `stdio: pipe`), not a PTY. That is why it feels broken: no echo or line editing, Ctrl+C and arrow keys misbehave, tab completion and TUIs (`pi`, `vim`, `less`) fail, and `resize` is a no-op. The fix swaps in a real PTY and adds the features you would expect from a basic terminal. Size: medium, mostly in `modules/terminal`.

## Approach
- **Real PTY in main.** Rewrite `TerminalManager` on a PTY library (ConPTY on Windows, forkpty elsewhere). `resize` actually resizes. Drop the fake `COLUMNS`/`LINES` env vars and set `TERM_PROGRAM=Hive`.
- **Sessions survive panel close and reload.** Today the xterm instances live in component refs, so closing the panel orphans the shells and opening it spawns a new one. Move them to a module-level registry. Main keeps a ~256 KB scrollback ring per session so a renderer reload can replay it.
- **Batched output.** Main coalesces PTY data (~8 ms or 64 KB) before each IPC emit. This stops the UI stalling on `npm install` or big logs.
- **Standard behaviors.**
  - Copy/paste: Ctrl+C copies when text is selected and sends SIGINT otherwise. Ctrl+V and Ctrl+Shift+C/V work, and right-click gives a Copy/Paste/Select All/Clear menu.
  - Find in terminal (Ctrl+F) with next/prev and case toggle.
  - Clickable URLs, 10k-line scrollback, Unicode 11 widths, WebGL renderer with automatic fallback.
  - Font zoom (Ctrl+=, Ctrl+-, Ctrl+0, Ctrl+wheel), persisted.
  - Colors follow the active Hive theme instead of hardcoded hex.
  - Drag a file onto the terminal to paste its quoted path.
- **Tabs.**
  - Tab title follows the shell (OSC 0/2), and double-click renames it.
  - A split "+" button lets you pick the shell: pwsh, Windows PowerShell, cmd, Git Bash, WSL, or the default.
  - Ctrl+Shift+` opens a new tab.
  - When a shell exits, the tab stays and shows the exit code with "press any key to restart" (no more silent dead tabs).
- **Remove the "Quick: pi / git status / npm test" bar.** It is hardcoded clutter.
- **Keybindings.** `useKeybindings.ts` lets any Shift/Alt chord bypass the terminal guard. Tighten it so terminal-owned chords (Ctrl+Shift+C/V/F and similar) are never stolen.

## Decisions

> [!CHOICE] PTY library
> **Question**: Which package provides the PTY?
> - (x) **@lydell/node-pty**: prebuilt binaries for win/mac/linux (x64+arm64), no compiler or `electron-rebuild`, works with Electron N-API [Recommended]
> - ( ) **node-pty (Microsoft)**: the canonical package, but Windows build tools and a rebuild step are needed for Electron, and Linux has no prebuilds

> [!CHOICE] Quick-command bar
> **Question**: What happens to the `pi` / `git status` / `npm test` bar?
> - (x) **Remove it**: simple terminal, more room for output [Recommended]
> - ( ) **Keep it**: same as today, no behavior change

## Changes
| File | Change |
|---|---|
| `modules/terminal/src/service.ts` | `[MODIFY]` PTY-backed `TerminalManager`: spawn, resize, kill, output batching, scrollback ring, shell discovery |
| `modules/terminal/src/main.ts` | `[MODIFY]` new IPC: `attach` (replay), `shells`, `rename`; exit payload carries code |
| `modules/terminal/src/shared.ts` | `[MODIFY]` new methods and types (`TerminalShellOption`, attach result) |
| `modules/terminal/src/ui/TerminalPanel.tsx` | `[MODIFY]` slim down to layout and tabs, drop the quick bar and inline-style buttons |
| `modules/terminal/src/ui/terminal-registry.ts` | `[NEW]` module-level xterm instances, addons, resize and focus logic |
| `modules/terminal/src/ui/terminal-theme.ts` | `[NEW]` map Hive CSS vars to xterm theme, live on theme change |
| `modules/terminal/src/ui/TerminalSearch.tsx` | `[NEW]` find bar |
| `modules/terminal/src/ui/terminal.css` | `[NEW]` tab bar, find bar, context menu styles |
| `modules/terminal/src/service.test.ts` | `[MODIFY]` real PTY tests: echo, resize, exit code, kill |
| `modules/terminal/package.json` | `[MODIFY]` add `@xterm/addon-search`, `-web-links`, `-unicode11`, `-webgl` |
| `apps/desktop/package.json` | `[MODIFY]` add PTY dep (so `externalizeDepsPlugin` keeps it out of the bundle), `asarUnpack` the native files |
| `apps/desktop/src/renderer/features/commands/useKeybindings.ts` | `[MODIFY]` do not steal terminal-owned chords |

## Risks

> [!WARNING]
> The native PTY binary must be unpacked from the asar in packaged builds. I will verify with `electron-builder --dir` on this machine. If packaging fails, dev mode still works and I will report it.

## Verify
- `npm run typecheck` and `npm test`.
- Manual in `npm run dev`:
  - Type, arrow through history, Tab-complete, and Ctrl+C a running `ping`.
  - Run `pi` and `vim` or `less`.
  - Resize the panel and check `$Host.UI.RawUI.WindowSize` or `tput cols`.
  - Close and reopen the panel and confirm the sessions are still there.
  - Copy/paste, find, font zoom, and the shell picker.
