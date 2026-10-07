/**
 * Renderer-side owner of every terminal. xterm instances live here (module scope), not in React, so closing
 * the panel never loses a shell: the panel just re-parents each instance's element when it mounts again.
 * After a renderer reload the sessions are rediscovered through `list` + `attach` (scrollback replay).
 */
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import {
  TerminalEvents,
  TerminalMethods,
  type TerminalAttachResult,
  type TerminalCreateOptions,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type TerminalSessionInfo,
  type TerminalShellOption,
} from "../shared.ts";
import { TERMINAL_FONT, resolveTerminalTheme, type ResolvedTerminalTheme } from "./terminal-theme.ts";

export interface TerminalTabState {
  id: string;
  title: string;
  shellLabel: string;
  /** Non-null once the shell process ended with a failure code (tab stays so the output can be read). */
  exitCode: number | null;
}

export interface TerminalStoreState {
  tabs: TerminalTabState[];
  activeId: string | null;
  fontSize: number;
  shells: TerminalShellOption[];
  /** True once the first sync finished (so the UI can tell "loading" from "no terminals"). */
  ready: boolean;
}

interface Entry {
  id: string;
  info: TerminalSessionInfo;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  /** Persistent wrapper; the panel appends it into whichever container is currently mounted. */
  element: HTMLDivElement;
  opened: boolean;
  customTitle: boolean;
  exitCode: number | null;
  /** Highest `seq` already written (drops duplicates between scrollback replay and live events). */
  seq: number;
  sentCols: number;
  sentRows: number;
}

const FONT_KEY = "terminal.fontSize";
const MIN_FONT = 8;
const MAX_FONT = 32;
const DEFAULT_FONT = 13;
const MAX_ORPHAN_CHUNKS = 500;

const entries = new Map<string, Entry>();
const orphanData = new Map<string, TerminalDataEvent[]>();
const orphanExit = new Map<string, TerminalExitEvent>();
const listeners = new Set<() => void>();

let host: ModuleHost | null = null;
let unsubscribeIpc: (() => void) | null = null;
let starting: Promise<void> | null = null;
let currentTheme: ResolvedTerminalTheme | null = null;
let lastDims = { cols: 80, rows: 24 };
const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

let state: TerminalStoreState = { tabs: [], activeId: null, fontSize: DEFAULT_FONT, shells: [], ready: false };

function setState(patch: Partial<TerminalStoreState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getSnapshot(): TerminalStoreState {
  return state;
}

function invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  if (!host) return Promise.reject(new Error("terminal module not bound"));
  return host.ipc.invoke<T>(method, ...args);
}

function updateTab(id: string, patch: Partial<TerminalTabState>): void {
  setState({ tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

/** "C:\Program Files\PowerShell\7\pwsh.exe" -> "pwsh". Other titles (e.g. "user@host: ~/dir") are kept. */
function prettyTitle(raw: string): string {
  const t = raw.trim();
  if (/\.exe$/i.test(t)) return (t.split(/[/\\]/).pop() ?? t).replace(/\.exe$/i, "");
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
}

// ---------------------------------------------------------------- binding / startup

/** Bind to the module host (idempotent) and make sure existing main-side sessions have tabs. */
export function ensureStarted(h: ModuleHost): Promise<void> {
  if (host !== h) {
    unsubscribeIpc?.();
    host = h;
    const offData = h.ipc.on<TerminalDataEvent>(TerminalEvents.data, onData);
    const offExit = h.ipc.on<TerminalExitEvent>(TerminalEvents.exit, onExit);
    unsubscribeIpc = () => {
      offData();
      offExit();
    };
    const stored = Number(h.storage.get(FONT_KEY));
    if (Number.isFinite(stored) && stored >= MIN_FONT && stored <= MAX_FONT) state = { ...state, fontSize: stored };
    starting = null;
  }
  starting ??= sync().finally(() => {
    starting = null;
  });
  return starting;
}

async function sync(): Promise<void> {
  const [sessions, shells] = await Promise.all([
    invoke<TerminalSessionInfo[]>(TerminalMethods.list),
    invoke<TerminalShellOption[]>(TerminalMethods.shells).catch(() => [] as TerminalShellOption[]),
  ]);
  const alive = new Set(sessions.map((s) => s.id));

  // Entries whose shell vanished from main (module disabled/re-enabled) are stale, unless they are showing an exit message.
  for (const e of [...entries.values()]) if (!alive.has(e.id) && e.exitCode === null) disposeEntry(e);

  for (const info of sessions) {
    if (entries.has(info.id)) continue;
    const attached = await invoke<TerminalAttachResult | null>(TerminalMethods.attach, { id: info.id });
    if (attached) addEntry(attached.info, { scrollback: attached.scrollback, seq: attached.seq });
  }

  setState({ shells });
  if (entries.size === 0) await newTerminal();
  syncTabs();
  setState({ ready: true });
}

function syncTabs(): void {
  const tabs: TerminalTabState[] = [...entries.values()].map((e) => ({
    id: e.id,
    title: e.info.title,
    shellLabel: e.info.shellLabel,
    exitCode: e.exitCode,
  }));
  // Preserve user-visible order of existing tabs.
  const order = new Map(state.tabs.map((t, i) => [t.id, i]));
  tabs.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  const activeId = state.activeId && entries.has(state.activeId) ? state.activeId : (tabs[tabs.length - 1]?.id ?? null);
  setState({ tabs, activeId });
}

// ---------------------------------------------------------------- IPC events

function onData(ev: TerminalDataEvent): void {
  const e = entries.get(ev.id);
  if (!e) {
    const q = orphanData.get(ev.id) ?? [];
    if (q.length < MAX_ORPHAN_CHUNKS) q.push(ev);
    orphanData.set(ev.id, q);
    return;
  }
  if (ev.seq <= e.seq) return;
  e.seq = ev.seq;
  e.term.write(ev.data);
}

function onExit(ev: TerminalExitEvent): void {
  const e = entries.get(ev.id);
  if (!e) {
    orphanExit.set(ev.id, ev);
    return;
  }
  handleExit(e, ev.exitCode);
}

function handleExit(e: Entry, exitCode: number): void {
  if (exitCode === 0) {
    // Clean `exit`: close the tab like any other terminal app.
    closeTab(e.id);
    return;
  }
  e.exitCode = exitCode;
  e.term.write(`\r\n\x1b[2m[Process exited with code ${exitCode}. Press any key to restart]\x1b[0m\r\n`);
  updateTab(e.id, { exitCode });
}

// ---------------------------------------------------------------- entries

function applyTheme(): ResolvedTerminalTheme {
  currentTheme = resolveTerminalTheme();
  return currentTheme;
}

function addEntry(info: TerminalSessionInfo, replay?: { scrollback: string; seq: number }): Entry {
  const resolved = currentTheme ?? applyTheme();
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: "bar",
    // xterm measures glyphs on a canvas, so it needs real family names (CSS vars don't resolve).
    fontFamily: TERMINAL_FONT,
    fontSize: state.fontSize,
    lineHeight: 1.2,
    scrollback: 10_000,
    allowProposedApi: true,
    macOptionIsMeta: true,
    rightClickSelectsWord: false,
    drawBoldTextInBrightColors: false,
    theme: resolved.theme,
    windowsPty: info.windowsBuild ? { backend: "conpty", buildNumber: info.windowsBuild } : undefined,
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(
    new WebLinksAddon((_ev, uri) => {
      void host?.openExternal(uri);
    }),
  );
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";

  const element = document.createElement("div");
  element.className = "hive-term-host";

  const entry: Entry = {
    id: info.id,
    info,
    term,
    fit,
    search,
    element,
    opened: false,
    customTitle: false,
    exitCode: null,
    seq: replay?.seq ?? 0,
    sentCols: 0,
    sentRows: 0,
  };
  entries.set(info.id, entry);

  let isReplaying = Boolean(replay?.scrollback);
  term.onBell(() => {
    if (!isReplaying && state.activeId === entry.id) {
      if (host?.sound) host.sound.play("terminal_bell");
      else window.dispatchEvent(new CustomEvent("hive-sound:play", { detail: { sound: "terminal_bell" } }));
    }
  });

  if (replay?.scrollback) {
    term.write(replay.scrollback, () => {
      isReplaying = false;
    });
  }

  term.onData((data) => {
    const e = entry;
    if (e.exitCode !== null) {
      void restartEntry(e);
      return;
    }
    void invoke(TerminalMethods.write, { id: e.id, data });
  });
  term.onTitleChange((raw) => {
    if (entry.customTitle || !raw.trim()) return;
    const title = prettyTitle(raw);
    entry.info = { ...entry.info, title };
    updateTab(entry.id, { title });
    void invoke(TerminalMethods.rename, { id: entry.id, title });
  });
  term.attachCustomKeyEventHandler((e) => handleKey(entry, e));

  // Output that raced ahead of the create/attach reply.
  const queued = orphanData.get(info.id);
  orphanData.delete(info.id);
  for (const ev of queued ?? []) onData(ev);
  const exit = orphanExit.get(info.id);
  orphanExit.delete(info.id);
  if (exit) handleExit(entry, exit.exitCode);

  return entry;
}

function disposeEntry(e: Entry): void {
  entries.delete(e.id);
  try {
    e.term.dispose();
  } catch {
    // already disposed
  }
  e.element.remove();
}

// ---------------------------------------------------------------- keyboard / clipboard

export function copySelection(id: string): boolean {
  const e = entries.get(id);
  const text = e?.term.getSelection();
  if (!e || !text) return false;
  void navigator.clipboard.writeText(text);
  return true;
}

export async function pasteClipboard(id: string): Promise<void> {
  const e = entries.get(id);
  if (!e) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) e.term.paste(text);
  } catch {
    // clipboard permission denied / empty
  }
  e.term.focus();
}

export function selectAll(id: string): void {
  entries.get(id)?.term.selectAll();
}

export function clearBuffer(id: string): void {
  const e = entries.get(id);
  if (!e) return;
  // Drops scrollback and the lines above the cursor; the current prompt line stays.
  e.term.clear();
  e.term.focus();
}

function isWin(): boolean {
  return typeof navigator !== "undefined" && /Win/i.test(navigator.platform);
}

/** Return false to stop xterm from also handling the key. */
function handleKey(entry: Entry, e: KeyboardEvent): boolean {
  if (e.type !== "keydown") return true;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key.toLowerCase();

  // Copy: Ctrl+Shift+C always; Ctrl+C (Cmd+C on mac) only when text is selected, otherwise it is SIGINT.
  if (mod && key === "c" && !e.altKey && (e.shiftKey || isMac || entry.term.hasSelection())) {
    if (entry.term.hasSelection()) {
      copySelection(entry.id);
      entry.term.clearSelection();
      return false;
    }
    return !e.shiftKey;
  }
  // Paste: let the browser fire a native `paste` event so xterm applies bracketed paste.
  if (mod && key === "v" && !e.altKey) return false;
  if (e.shiftKey && !mod && !e.altKey && e.key === "Insert") return false;

  // Find in terminal. Ctrl+F stays with the shell (readline forward-char); Ctrl+Shift+F / Cmd+F opens find.
  if (key === "f" && !e.altKey && ((isMac && e.metaKey) || (!isMac && e.ctrlKey && e.shiftKey))) {
    window.dispatchEvent(new CustomEvent("hive-terminal:find", { detail: { id: entry.id } }));
    return false;
  }
  // New terminal.
  if (mod && e.shiftKey && !e.altKey && e.code === "Backquote") {
    void newTerminal();
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- sizing / mounting

function fitEntry(e: Entry): void {
  if (!e.opened || !e.element.isConnected || e.element.clientWidth < 10 || e.element.clientHeight < 10) return;
  try {
    e.fit.fit();
  } catch {
    return;
  }
  const { cols, rows } = e.term;
  if (cols === e.sentCols && rows === e.sentRows) return;
  e.sentCols = cols;
  e.sentRows = rows;
  lastDims = { cols, rows };
  if (e.exitCode === null) void invoke(TerminalMethods.resize, { id: e.id, cols, rows });
}

/** Re-fit the visible terminal (call on container resize). */
export function fitActive(): void {
  const e = state.activeId ? entries.get(state.activeId) : undefined;
  if (e) fitEntry(e);
}

/** Put a terminal's persistent element into `container` and size it. Safe to call repeatedly. */
export function mountEntry(id: string, container: HTMLElement): void {
  const e = entries.get(id);
  if (!e) return;
  if (e.element.parentElement !== container) container.appendChild(e.element);
  if (!e.opened) {
    e.term.open(e.element);
    e.opened = true;
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      e.term.loadAddon(gl);
    } catch {
      // WebGL unavailable: xterm keeps its DOM renderer.
    }
    // The bundled web font may not be ready on first open; re-measure once it is.
    void document.fonts.load(`12px "JetBrains Mono Variable"`).then(() => {
      e.term.options.fontFamily = TERMINAL_FONT;
      fitEntry(e);
    });
  }
  e.element.style.display = "block";
  fitEntry(e);
  e.term.refresh(0, e.term.rows - 1);
}

export function unmountEntry(id: string): void {
  const e = entries.get(id);
  if (!e) return;
  e.element.style.display = "none";
}

export function focusTerminal(id: string | null): void {
  if (id) entries.get(id)?.term.focus();
}

export function getTerminal(id: string): { term: Terminal; search: SearchAddon; decorations: ResolvedTerminalTheme["searchDecorations"] } | null {
  const e = entries.get(id);
  if (!e) return null;
  return { term: e.term, search: e.search, decorations: (currentTheme ?? applyTheme()).searchDecorations };
}

/** Re-read the app theme (call when Hive's theme changes). */
export function refreshTheme(): string {
  const resolved = applyTheme();
  for (const e of entries.values()) e.term.options.theme = resolved.theme;
  return resolved.background;
}

export function themeBackground(): string {
  return (currentTheme ?? applyTheme()).background;
}

// ---------------------------------------------------------------- font size

export function setFontSize(size: number): void {
  const next = Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(size)));
  if (next === state.fontSize) return;
  setState({ fontSize: next });
  host?.storage.set(FONT_KEY, String(next));
  for (const e of entries.values()) {
    e.term.options.fontSize = next;
    fitEntry(e);
  }
}
export const zoomFont = (delta: number) => setFontSize(state.fontSize + delta);
export const resetFont = () => setFontSize(DEFAULT_FONT);

// ---------------------------------------------------------------- tab operations

export async function newTerminal(opts: { shellId?: string; cwd?: string } = {}): Promise<string | null> {
  if (!host) return null;
  const cwd = opts.cwd ?? host.sessions.activeProject()?.path;
  const create: TerminalCreateOptions = { cwd, shellId: opts.shellId, cols: lastDims.cols, rows: lastDims.rows };
  try {
    const info = await invoke<TerminalSessionInfo>(TerminalMethods.create, create);
    addEntry(info);
    syncTabs();
    setState({ activeId: info.id });
    return info.id;
  } catch (err) {
    host.toast({ message: `Could not start terminal: ${err instanceof Error ? err.message : String(err)}`, kind: "error" });
    return null;
  }
}

/** Replace a dead shell with a fresh one in the same tab. */
async function restartEntry(e: Entry): Promise<void> {
  if (e.exitCode === null) return;
  const oldId = e.id;
  const failedCode = e.exitCode;
  e.exitCode = null; // swallow further keystrokes' restarts while the new session spins up
  try {
    const info = await invoke<TerminalSessionInfo>(TerminalMethods.create, {
      cwd: e.info.cwd,
      shell: e.info.shell,
      cols: e.term.cols,
      rows: e.term.rows,
    });
    entries.delete(oldId);
    e.id = info.id;
    e.info = { ...info, title: e.customTitle ? e.info.title : info.title };
    e.seq = 0;
    e.sentCols = e.sentRows = 0;
    entries.set(info.id, e);
    e.term.reset();
    // Re-key the tab in place.
    setState({
      tabs: state.tabs.map((t) => (t.id === oldId ? { ...t, id: info.id, exitCode: null, shellLabel: info.shellLabel } : t)),
      activeId: state.activeId === oldId ? info.id : state.activeId,
    });
    const queued = orphanData.get(info.id);
    orphanData.delete(info.id);
    for (const ev of queued ?? []) onData(ev);
    fitEntry(e);
  } catch (err) {
    e.exitCode = failedCode;
    e.term.write(`\r\n\x1b[31m[Restart failed: ${err instanceof Error ? err.message : String(err)}]\x1b[0m\r\n`);
  }
}

export function closeTab(id: string): void {
  const e = entries.get(id);
  void invoke(TerminalMethods.kill, { id }).catch(() => undefined);
  if (e) disposeEntry(e);
  const idx = state.tabs.findIndex((t) => t.id === id);
  const tabs = state.tabs.filter((t) => t.id !== id);
  let activeId = state.activeId;
  if (activeId === id) activeId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
  setState({ tabs, activeId });
}

export function selectTab(id: string): void {
  if (entries.has(id)) setState({ activeId: id });
}

export function cycleTab(delta: number): void {
  const { tabs, activeId } = state;
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  selectTab(tabs[(i + delta + tabs.length) % tabs.length]!.id);
}

export function renameTab(id: string, title: string): void {
  const e = entries.get(id);
  const next = title.trim();
  if (!e || !next) return;
  e.customTitle = true;
  e.info = { ...e.info, title: next };
  updateTab(id, { title: next });
  void invoke(TerminalMethods.rename, { id, title: next });
}

/** Restart the shell of the active tab: kill it and open a replacement next to it. */
export async function restartActive(): Promise<void> {
  const id = state.activeId;
  const e = id ? entries.get(id) : undefined;
  if (!e) return;
  const { cwd, shell } = e.info;
  const idx = state.tabs.findIndex((t) => t.id === e.id);
  closeTab(e.id);
  const created = await invoke<TerminalSessionInfo>(TerminalMethods.create, { cwd, shell, cols: lastDims.cols, rows: lastDims.rows }).catch(() => null);
  if (!created) return;
  addEntry(created);
  const tabs = [...state.tabs.filter((t) => t.id !== created.id)];
  tabs.splice(Math.min(idx, tabs.length), 0, { id: created.id, title: created.title, shellLabel: created.shellLabel, exitCode: null });
  setState({ tabs, activeId: created.id });
}

/** `terminal.run`: type a command into the active shell (creating one when needed). */
export async function runCommand(h: ModuleHost, command: string, cwd?: string): Promise<void> {
  await ensureStarted(h);
  let id = state.activeId && entries.get(state.activeId)?.exitCode === null ? state.activeId : null;
  id ??= [...entries.values()].find((e) => e.exitCode === null)?.id ?? null;
  id ??= await newTerminal({ cwd });
  if (!id) return;
  setState({ activeId: id });
  if (h?.sound) h.sound.play("terminal_command");
  else window.dispatchEvent(new CustomEvent("hive-sound:play", { detail: { sound: "terminal_command" } }));
  await invoke(TerminalMethods.write, { id, data: command + "\r" });
}

/** Paste file paths (quoted when they contain spaces) as typed input. */
export function pastePaths(id: string, paths: string[]): void {
  const e = entries.get(id);
  if (!e || paths.length === 0) return;
  const quoted = paths.map((p) => (/[\s"'&()]/.test(p) ? (isWin() ? `"${p}"` : `'${p.replace(/'/g, `'\\''`)}'`) : p));
  e.term.paste(quoted.join(" ") + " ");
  e.term.focus();
}
