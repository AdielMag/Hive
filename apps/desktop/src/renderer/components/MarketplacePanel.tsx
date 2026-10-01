import React, { useEffect, useState } from "react";
import { ShoppingBag, Search, Download, Check } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../store/session-store.ts";

export const MarketplacePanel: React.FC = () => {
  const { setPromptText } = useSessionStore(useShallow((s) => ({ setPromptText: s.setPromptText })));
  const [activeKind, setActiveKind] = useState<"pi-npm" | "claude" | "mcp">("pi-npm");
  const [query, setQuery] = useState("");
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});

  const search = async (q = query, k = activeKind) => {
    setLoading(true);
    try {
      const items = await window.studio.searchMarketplace(q, k);
      setPackages(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void search();
  }, [activeKind]);

  const handleInstall = (pkg: any) => {
    // Stage prompt for installing package via Pi CLI or prompt
    setInstalledMap((s) => ({ ...s, [pkg.id]: true }));
    setPromptText(`/install ${pkg.source}`);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 12,
        gap: 12,
        fontSize: 12,
        userSelect: "none",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ShoppingBag size={15} color="var(--accent-base)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Marketplace</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
        <button
          onClick={() => setActiveKind("pi-npm")}
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: "none",
            background: activeKind === "pi-npm" ? "var(--accent-subtle)" : "transparent",
            color: activeKind === "pi-npm" ? "var(--accent-hover)" : "var(--text-muted)",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: activeKind === "pi-npm" ? 600 : 400,
          }}
        >
          Pi Packages
        </button>
        <button
          onClick={() => setActiveKind("claude")}
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: "none",
            background: activeKind === "claude" ? "var(--accent-subtle)" : "transparent",
            color: activeKind === "claude" ? "var(--accent-hover)" : "var(--text-muted)",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: activeKind === "claude" ? 600 : 400,
          }}
        >
          Claude Plugins
        </button>
        <button
          onClick={() => setActiveKind("mcp")}
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: "none",
            background: activeKind === "mcp" ? "var(--accent-subtle)" : "transparent",
            color: activeKind === "mcp" ? "var(--accent-hover)" : "var(--text-muted)",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: activeKind === "mcp" ? 600 : 400,
          }}
        >
          MCP Registry
        </button>
      </div>

      {/* Search Bar */}
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
        <Search size={13} color="var(--text-muted)" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
          placeholder="Search extensions, skills, MCP..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 11,
          }}
        />
      </div>

      {/* Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Searching marketplace...</div>}
        {!loading && packages.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>No packages found.</div>
        )}

        {packages.map((pkg) => (
          <div
            key={pkg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: 10,
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12 }}>{pkg.name}</div>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                v{pkg.version}
              </span>
            </div>

            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>{pkg.description}</div>

            {/* Chips */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              {pkg.capabilities?.map((cap: string) => (
                <span
                  key={cap}
                  style={{
                    fontSize: 9,
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(var(--fg-rgb), 0.06)",
                    color: "var(--accent-hover)",
                    fontWeight: 600,
                  }}
                >
                  {cap}
                </span>
              ))}

              <div style={{ flex: 1 }} />

              <button
                onClick={() => handleInstall(pkg)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: "none",
                  background: installedMap[pkg.id] ? "var(--bg-elevated)" : "var(--accent-base)",
                  color: installedMap[pkg.id] ? "var(--success)" : "#fff",
                  fontSize: 10,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {installedMap[pkg.id] ? (
                  <>
                    <Check size={10} /> Added
                  </>
                ) : (
                  <>
                    <Download size={10} /> Install
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
