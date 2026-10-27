import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, Download, ExternalLink, Search, Users, X } from "lucide-react";
import type { ModuleHost } from "@hive/module-sdk/renderer";
import { MarketplaceMethods, type MarketplacePackage, type MarketplaceSourceKind } from "../shared.ts";

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_COUNT = 6;

const TABS: Array<{ kind: MarketplaceSourceKind; label: string }> = [
  { kind: "pi-npm", label: "Pi Packages" },
  { kind: "claude", label: "Claude Plugins" },
  { kind: "mcp", label: "MCP Registry" },
];

const SOURCE_LABEL: Record<MarketplaceSourceKind, string> = {
  "pi-npm": "npm",
  claude: "Claude",
  mcp: "MCP",
};

export const MarketplacePanel: React.FC<{ host: ModuleHost }> = ({ host }) => {
  const [activeKind, setActiveKind] = useState<MarketplaceSourceKind>("pi-npm");
  const [query, setQuery] = useState("");
  // `committed` is what we actually searched for: updated after a debounce or on Enter.
  const [committed, setCommitted] = useState("");
  const [packages, setPackages] = useState<MarketplacePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [stagedMap, setStagedMap] = useState<Record<string, boolean>>({});
  const searchSeqRef = useRef(0);

  const load = useCallback(
    async (q: string, k: MarketplaceSourceKind, force = false) => {
      const seq = ++searchSeqRef.current;
      setLoading(true);
      setError(null);
      try {
        const items = await host.ipc.invoke<MarketplacePackage[]>(MarketplaceMethods.search, {
          query: q,
          kind: k,
          force,
        });
        if (seq !== searchSeqRef.current) return;
        setPackages(items ?? []);
        setLimit(PAGE_SIZE);
      } catch (err: any) {
        if (seq !== searchSeqRef.current) return;
        setError(err?.message || "Couldn't reach marketplace");
        setPackages([]);
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    },
    [host],
  );

  // Debounce typing: commit the query 300 ms after the last keystroke.
  useEffect(() => {
    if (query === committed) return;
    const handle = window.setTimeout(() => setCommitted(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, committed]);

  // Tab switch or committed query change → fetch (the service cache makes repeats cheap).
  useEffect(() => {
    void load(committed, activeKind);
  }, [committed, activeKind, load]);

  const handleInstall = useCallback(
    (pkg: MarketplacePackage) => {
      const key = pkg.source;
      setStagedMap((s) => ({ ...s, [key]: true }));
      host.sessions.setPrompt(`/install ${pkg.source}`);
      host.toast({ message: "Staged in composer — press Enter to install", kind: "info" });
    },
    [host],
  );

  const handleOpen = useCallback((url: string) => void host.openExternal(url), [host]);

  const visible = packages.slice(0, limit);
  const remaining = packages.length - visible.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 12,
        gap: 10,
        fontSize: 12,
        overflowY: "auto",
      }}
    >
      {/* Source tabs */}
      <div
        role="tablist"
        aria-label="Marketplace sources"
        style={{
          display: "flex",
          gap: 2,
          padding: 2,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          alignSelf: "flex-start",
        }}
      >
        {TABS.map((tab) => {
          const active = activeKind === tab.kind;
          return (
            <button
              key={tab.kind}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveKind(tab.kind)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: active ? "var(--accent-subtle)" : "transparent",
                color: active ? "var(--accent-hover)" : "var(--text-muted)",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: active ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--bg-input)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          padding: "6px 8px",
        }}
      >
        <Search size={13} color="var(--text-muted)" aria-hidden />
        <input
          type="text"
          aria-label="Search marketplace"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setCommitted(query);
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="Search packages, plugins, MCP servers…"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 11,
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex" }}
          >
            <X size={12} color="var(--text-muted)" />
          </button>
        )}
      </div>

      {/* Status line */}
      {!error && !loading && packages.length > 0 && (
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {packages.length} {packages.length === 1 ? "result" : "results"} · {SOURCE_LABEL[activeKind]}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            color: "var(--danger)",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>{error.startsWith("Couldn't reach marketplace") ? error : `Couldn't reach marketplace: ${error}`}</span>
          <button
            type="button"
            onClick={() => void load(committed, activeKind, true)}
            style={retryButtonStyle}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {loading && packages.length === 0 && (
        <div style={gridStyle} aria-busy="true" aria-label="Loading marketplace">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={i} style={{ ...cardStyle, gap: 10 }}>
              <div style={{ height: 14, width: "60%", background: "var(--bg-elevated)", borderRadius: 3 }} />
              <div style={{ height: 10, width: "90%", background: "var(--bg-elevated)", borderRadius: 3 }} />
              <div style={{ height: 10, width: "70%", background: "var(--bg-elevated)", borderRadius: 3 }} />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && packages.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic", padding: "8px 2px" }}>
          {committed ? `Nothing matches “${committed}”.` : "No packages found."}
        </div>
      )}

      {packages.length > 0 && (
        <div style={{ ...gridStyle, opacity: loading ? 0.6 : 1 }}>
          {visible.map((pkg) => (
            <MarketplaceCard
              key={`${pkg.sourceKind}:${pkg.id}`}
              pkg={pkg}
              staged={!!stagedMap[pkg.source]}
              onInstall={handleInstall}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          style={{ ...retryButtonStyle, alignSelf: "center", padding: "4px 12px", marginTop: 2 }}
        >
          Show {Math.min(PAGE_SIZE, remaining)} more · {remaining} left
        </button>
      )}
    </div>
  );
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 8,
  alignItems: "stretch",
};

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  minWidth: 0,
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
};

const retryButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border-subtle)",
  borderRadius: 4,
  color: "var(--text-primary)",
  padding: "2px 8px",
  fontSize: 10,
  cursor: "pointer",
};

const chipStyle: React.CSSProperties = {
  fontSize: 9,
  padding: "1px 5px",
  borderRadius: 3,
  background: "rgba(var(--fg-rgb), 0.06)",
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
};

function initialsOf(name: string): string {
  const base = name.replace(/^@/, "").split("/").pop() ?? name;
  return base.charAt(0).toUpperCase() || "?";
}

function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

function timeAgo(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 3600) return `${Math.max(1, Math.floor(sec / 60))}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 60) return `${Math.floor(sec / 86400)}d ago`;
  if (sec < 86400 * 730) return `${Math.floor(sec / (86400 * 30))}mo ago`;
  return `${Math.floor(sec / (86400 * 365))}y ago`;
}

const MarketplaceCard = memo(function MarketplaceCard({
  pkg,
  staged,
  onInstall,
  onOpen,
}: {
  pkg: MarketplacePackage;
  staged: boolean;
  onInstall: (pkg: MarketplacePackage) => void;
  onOpen: (url: string) => void;
}) {
  const hue = hueOf(pkg.name);
  const ago = timeAgo(pkg.updatedAt);
  const link = pkg.homepage || pkg.repository;
  const deprecated = pkg.status && pkg.status !== "active" && pkg.status !== "latest";
  const chips = [...(pkg.transports ?? []), ...(pkg.category ? [pkg.category] : [])];
  const scorePct = typeof pkg.score === "number" ? Math.round(pkg.score * 100) : null;

  return (
    <article style={cardStyle} aria-label={pkg.name}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 12,
            background: `hsl(${hue} 55% 45% / 0.18)`,
            color: `hsl(${hue} 65% 68%)`,
          }}
        >
          {initialsOf(pkg.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            title={pkg.name}
            style={{
              fontWeight: 600,
              color: "var(--text-primary)",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pkg.name}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "var(--text-muted)", minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>v{pkg.version}</span>
            {pkg.author && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {pkg.author}</span>}
          </div>
        </div>
        {deprecated && (
          <span style={{ ...chipStyle, color: "var(--warning)", flexShrink: 0 }}>{pkg.status}</span>
        )}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {pkg.description}
      </div>

      {pkg.keywords && pkg.keywords.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {pkg.keywords.slice(0, 3).map((k) => (
            <span key={k} style={{ ...chipStyle, color: "var(--text-muted)" }}>
              #{k}
            </span>
          ))}
        </div>
      )}

      {/* Metadata row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 10, color: "var(--text-muted)", flexWrap: "wrap" }}>
        {ago && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} title={pkg.updatedAt}>
            <Clock size={10} aria-hidden /> {ago}
          </span>
        )}
        {typeof pkg.maintainers === "number" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <Users size={10} aria-hidden /> {pkg.maintainers}
          </span>
        )}
        {pkg.license && <span>{pkg.license}</span>}
      </div>

      {scorePct !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-muted)" }}>
          <span>Score {scorePct}</span>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ width: `${scorePct}%`, height: "100%", background: "var(--accent-base)" }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "auto", display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minWidth: 0, flex: 1 }}>
          {pkg.capabilities?.slice(0, 2).map((cap) => (
            <span key={cap} style={{ ...chipStyle, textTransform: "uppercase", color: "var(--accent-hover)", fontWeight: 600 }}>
              {cap}
            </span>
          ))}
          {chips.slice(0, 1).map((c) => (
            <span key={c} style={chipStyle}>
              {c}
            </span>
          ))}
        </div>

        {link && (
          <button
            type="button"
            aria-label={`Open ${pkg.name} homepage`}
            title="Open homepage"
            onClick={() => onOpen(link)}
            style={{ ...iconButtonStyle }}
          >
            <ExternalLink size={11} />
          </button>
        )}

        <button
          type="button"
          onClick={() => onInstall(pkg)}
          title={staged ? "Staged in composer — press Enter to install" : `Install ${pkg.name}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 4,
            border: "none",
            background: staged ? "var(--bg-elevated)" : "var(--accent-base)",
            color: staged ? "var(--success)" : "#fff",
            fontSize: 10,
            cursor: "pointer",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {staged ? (
            <>
              <Check size={10} /> Staged
            </>
          ) : (
            <>
              <Download size={10} /> Install
            </>
          )}
        </button>
      </div>
    </article>
  );
});

const iconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  borderRadius: 4,
  border: "1px solid var(--border-subtle)",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
};
