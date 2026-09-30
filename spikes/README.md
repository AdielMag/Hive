# Slice 0 spikes (run 2026-09-30 on Windows, Pi 0.87.1)

All scripts run with the Node that ships with the installed Pi:

```bash
"C:/Users/Adiel/AppData/Local/pi-node/current/node.exe" <script>
```

| Script | What it proves | Result |
|---|---|---|
| `spike.mjs` | `pi --mode rpc` handshake, model list, commands, stats, memory | First `get_state` response in **2.1–2.9 s**; idle process **~106 MB** working set; **37 models** (anthropic 16, antigravity 14 via `pi-antigravity` extension, zai 7); **40 commands** (extension/prompt/skill); extension `setStatus`/`setWidget` requests arrive at startup; stdin close exits in ~0.4 s |
| `bridge.ts` + `bridge-spike.mjs` | Injected GUI bridge extension (`-e bridge.ts`) + named-pipe side channel + `pi.events` forwarding + command via RPC `prompt` | Bridge loads in RPC mode; `hello` arrives over `\\.\pipe\...` with `mode:"rpc"`, `hasUI:true`, `trusted`; `studio:*` events forwarded; `/studio-ping` runs with command context (`isIdle`, `getContextUsage`, `getSystemPrompt`) |
| `sessions-spike.mjs` | Pi SDK loaded **from the installed Pi** for read-only session catalog + token estimation | `SessionManager.listAll()` = 99 sessions / 11 cwds in **382–564 ms**; `parseSessionEntries` + `estimateTokens` give per-category split (system 6k, toolResult:read 45.6k, toolResult:bash 46.6k, assistant 20.3k); system message sections = `preamble, tools, rules, docs, project_context, skills, cwd` |
| (inline) | Which SDK entry to import | `dist/bundle/index.js` imports in **240 ms**; unbundled `dist/index.js` 1.1 s warm / 13.5 s cold → use the bundle |
| `auth-spike.mjs` | Native login feasibility without the TUI | `createAgentSessionServices` loads user packages → **42 providers** incl. extension provider `antigravity` (auth kinds `oauth`); `ModelRuntime.login()` present; stored creds listed without secrets |
| `test-provider.ts` + `e2e-spike.mjs` | Deterministic offline E2E + linked-projects injection | Pi's built-in `fauxProvider` registered from an extension; full event stream (thinking/text deltas → `agent_settled`) in **152–168 ms**; `before_agent_start` → `sections.linked_projects` is **persisted in the session system message** and visible to the model; extension commands add **0** transcript entries |

Still open (fold into Slice 1): auth refresh inside an already-running RPC process after an external login; `ctx.navigateTree` through the bridge command; process-tree kill on Windows; macOS unix-socket path length.
