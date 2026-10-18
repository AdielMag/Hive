import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { File as FileIcon, Sparkles } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { fuzzyMatch } from "../features/commands/fuzzy.ts";
import "../styles/mention-textarea.css";

interface MentionItem {
  kind: "file" | "command";
  /** Text inserted into the prompt (without the trigger char). */
  insert: string;
  label: string;
  detail: string;
}

const MAX_RESULTS = 40;
const fileCache = new Map<string, string[]>();
const fileLoads = new Map<string, Promise<string[]>>();

function loadProjectFiles(root: string): Promise<string[]> {
  const cached = fileCache.get(root);
  if (cached) return Promise.resolve(cached);
  let p = fileLoads.get(root);
  if (!p) {
    p = window.studio
      .listFiles(root)
      .then((tree: any[]) => {
        const out: string[] = [];
        const walk = (nodes: any[]) => {
          for (const n of nodes ?? []) {
            if (n.isDirectory) walk(n.children ?? []);
            else out.push(n.relativePath || n.name);
          }
        };
        walk(tree);
        fileCache.set(root, out);
        return out;
      })
      .catch(() => [] as string[])
      .finally(() => fileLoads.delete(root));
    fileLoads.set(root, p);
  }
  return p;
}

export interface Trigger {
  char: "@" | "/";
  start: number; // index of the trigger char
  query: string;
}

export function findTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)([@/])([^\s]*)$/.exec(before);
  if (!m) return null;
  const start = before.length - m[3]!.length - 1;
  return { char: m[2] as "@" | "/", start, query: m[3]! };
}

export type MentionSegment = string | { char: "@" | "/"; token: string };

/** Splits text into plain strings and known `@file` / `/command` tokens (to be drawn as chips). */
export function segmentMentions(value: string, files: ReadonlySet<string>, commands: ReadonlySet<string>): MentionSegment[] {
  const out: MentionSegment[] = [];
  const re = /(^|\s)([@/])([^\s]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    const char = m[2] as "@" | "/";
    if (!(char === "@" ? files : commands).has(m[3]!)) continue;
    const tokenStart = m.index + m[1]!.length;
    out.push(value.slice(last, tokenStart), { char, token: m[3]! });
    last = tokenStart + 1 + m[3]!.length;
  }
  out.push(value.slice(last));
  return out;
}

export function splitPath(p: string): { name: string; dir: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { name: p, dir: "" } : { name: p.slice(i + 1), dir: p.slice(0, i) };
}

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

/**
 * Textarea with `@file` and `/command` autocomplete. Completed tokens are highlighted as small chips by a
 * mirrored backdrop (same metrics, transparent text), so the text itself stays plain and editable.
 */
export const MentionTextarea: React.FC<Props> = ({ value, onValueChange, textareaRef, onKeyDown, style, className, ...rest }) => {
  const activeKey = useSessionStore((s) => s.activeKey);
  const projectPath = useSessionStore((s) => s.activeProject?.path ?? null);
  const [caret, setCaret] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const trigger = useMemo(() => findTrigger(value, caret), [value, caret]);
  const triggerChar = trigger?.char ?? null;

  // Lazy-load the project's files the first time `@` is typed.
  useEffect(() => {
    if (triggerChar !== "@" || !projectPath) return;
    let cancelled = false;
    void loadProjectFiles(projectPath).then((f) => !cancelled && setFiles(f));
    return () => {
      cancelled = true;
    };
  }, [triggerChar, projectPath]);

  // Skills come from the session's Pi registry; refresh whenever `/` starts a token.
  useEffect(() => {
    if (triggerChar !== "/" || !activeKey) return;
    let cancelled = false;
    window.studio
      .getSessionRegistry(activeKey)
      .then((r) => !cancelled && setSkills((r?.skills ?? []).map((s) => ({ name: s.name, description: s.description }))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [triggerChar, activeKey]);

  const fileSet = useMemo(() => new Set(files), [files]);
  const commandSet = useMemo(() => new Set(skills.map((s) => `skill:${s.name}`)), [skills]);

  const items = useMemo<MentionItem[]>(() => {
    if (!trigger || dismissed === trigger.start) return [];
    const q = trigger.query;
    const scored: Array<{ item: MentionItem; score: number }> = [];
    if (trigger.char === "@") {
      for (const p of files) {
        const { name, dir } = splitPath(p);
        const m = q ? fuzzyMatch(q, p) : { score: 0 };
        if (!m) continue;
        // Prefer matches on the file name over matches buried in the directory.
        const nameBoost = q && name.toLowerCase().includes(q.toLowerCase()) ? 50 : 0;
        scored.push({ item: { kind: "file", insert: p, label: name, detail: dir }, score: m.score + nameBoost });
      }
    } else {
      for (const s of skills) {
        const full = `skill:${s.name}`;
        const m = q ? fuzzyMatch(q, `${full} ${s.description}`) : { score: 0 };
        if (!m) continue;
        scored.push({ item: { kind: "command", insert: full, label: `/${full}`, detail: s.description }, score: m.score });
      }
    }
    if (q) scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map((s) => s.item);
  }, [trigger, dismissed, files, skills]);

  const open = items.length > 0;

  useEffect(() => setIndex(0), [trigger?.start, trigger?.query, trigger?.char]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  // Keep the chip backdrop scrolled with the textarea.
  const syncScroll = () => {
    const ta = textareaRef.current;
    if (ta && backdropRef.current) backdropRef.current.scrollTop = ta.scrollTop;
  };
  useLayoutEffect(syncScroll, [value]);

  const choose = (item: MentionItem) => {
    if (!trigger) return;
    const ta = textareaRef.current;
    const end = caret;
    const text = `${trigger.char}${item.insert} `;
    const next = value.slice(0, trigger.start) + text + value.slice(end);
    const pos = trigger.start + text.length;
    onValueChange(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && !e.nativeEvent.isComposing) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        choose(items[index]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(trigger!.start);
        return;
      }
    }
    onKeyDown?.(e);
  };

  // Backdrop: same text, transparent, with completed tokens wrapped in chip marks.
  const backdrop = useMemo(() => {
    return segmentMentions(value, fileSet, commandSet).map((seg, i) =>
      typeof seg === "string" ? (
        seg
      ) : (
        <mark key={i} className={`mention-chip mention-chip--${seg.char === "@" ? "file" : "command"}`}>
          {seg.char}
          {seg.token}
        </mark>
      ),
    );
  }, [value, fileSet, commandSet]);

  return (
    <div className="mention-wrap" style={{ flex: 1, minHeight: 44 }}>
      <div ref={backdropRef} className="mention-backdrop" aria-hidden="true">
        {backdrop}
        {"\n"}
      </div>
      <textarea
        {...rest}
        ref={textareaRef}
        className={`mention-input${className ? ` ${className}` : ""}`}
        value={value}
        style={style}
        onChange={(e) => {
          onValueChange(e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onScroll={syncScroll}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />

      {open && (
        <div className="mention-menu" role="listbox" ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          <div className="mention-menu__head">{trigger!.char === "@" ? "Files" : "Commands"}</div>
          {items.map((it, i) => (
            <div
              key={`${it.kind}:${it.insert}`}
              role="option"
              aria-selected={i === index}
              className={`mention-item${i === index ? " is-active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(it)}
            >
              <span className={`mention-item__icon mention-item__icon--${it.kind}`}>
                {it.kind === "file" ? <FileIcon size={13} /> : <Sparkles size={13} />}
              </span>
              <span className="mention-item__label">{it.label}</span>
              {it.detail && <span className="mention-item__detail">{it.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
