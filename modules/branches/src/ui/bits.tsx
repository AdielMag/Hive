/** Small shared pieces for the branches tool window. */
import React, { useCallback, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Cloud, GitBranch, Tag } from "lucide-react";

export const initials = (name: string): string => {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "")).toUpperCase();
};

const AVATAR_COLORS = ["#4f9cf9", "#5fb865", "#e0a43a", "#b88cf2", "#ee74b0", "#3dc4d0", "#f0786e", "#9ec5fa"];
export const avatarColor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
};

export const Avatar: React.FC<{ name: string; large?: boolean }> = ({ name, large }) => (
  <span className={`bw__avatar${large ? " bw__avatar--lg" : ""}`} style={{ background: avatarColor(name) }} aria-hidden>
    {initials(name)}
  </span>
);

export type RefKind = "head" | "local" | "remote" | "tag";

export const RefChip: React.FC<{ kind: RefKind; label: string }> = ({ kind, label }) => (
  <span className={`bw__ref bw__ref--${kind}`} title={label}>
    {kind === "tag" ? <Tag size={9} /> : kind === "remote" ? <Cloud size={9} /> : <GitBranch size={9} />}
    <span>{label}</span>
  </span>
);

export const SyncBadges: React.FC<{ ahead: number; behind: number; hideOnHover?: boolean }> = ({ ahead, behind, hideOnHover }) => {
  if (!ahead && !behind) return null;
  return (
    <span className={`bw__badges${hideOnHover ? " has-actions" : ""}`}>
      {ahead > 0 && (
        <span className="bw__badge-up" title={`${ahead} commit(s) to push`}>
          <ArrowUp size={10} />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="bw__badge-down" title={`${behind} commit(s) to pull`}>
          <ArrowDown size={10} />
          {behind}
        </span>
      )}
    </span>
  );
};

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}
export type MenuEntry = MenuItem | "sep";

/** Floating context menu; closes on outside click, Escape, scroll or blur. */
export const ContextMenu: React.FC<{ x: number; y: number; title?: string; items: MenuEntry[]; onClose(): void }> = ({ x, y, title, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ left: x, top: y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const away = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", away, true);
    window.addEventListener("wheel", onClose, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", away, true);
      window.removeEventListener("wheel", onClose, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="bw__menu" style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {title && <div className="bw__menu-title">{title}</div>}
      {items.map((it, i) =>
        it === "sep" ? (
          <hr key={`s${i}`} />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={it.danger ? "is-danger" : ""}
            style={it.disabled ? { opacity: 0.45, cursor: "default" } : undefined}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            {it.icon}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
};

/** Horizontal drag-resize for a column. `dir` = +1 when growing as the pointer moves right. */
export function useColResize(get: () => number, set: (w: number) => void, dir: 1 | -1, commit?: (w: number) => void) {
  const setRef = useRef(set);
  setRef.current = set;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = get();
      let last = w0;
      const move = (ev: MouseEvent) => {
        last = w0 + (ev.clientX - x0) * dir;
        setRef.current(last);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
        commitRef.current?.(last);
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [get, dir],
  );
}
