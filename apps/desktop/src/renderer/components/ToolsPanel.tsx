import React, { useEffect, useMemo, useState } from "react";
import {
  Blocks,
  Bot,
  Box,
  ChevronDown,
  ChevronRight,
  Cpu,
  Network,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";
import { buildTimeline } from "@pi-studio/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { useActiveRegistry, useAiRegistryStore } from "../store/ai-registry-store.ts";
import { availableOnly, collectToolUsage } from "../lib/ai/tool-usage.ts";
import { scrollToToolCall } from "./Transcript.tsx";
import { formatCost } from "../lib/format.ts";
import "../styles/tools-panel.css";

export const ToolsPanel: React.FC = () => {
  const activeKey = useSessionStore((s) => s.activeKey);
  const activeProject = useSessionStore((s) => s.activeProject);
  const transcript = useSessionStore((s) => s.transcript);

  const registry = useActiveRegistry();
  const mcp = useAiRegistryStore((s) => s.mcp);
  const loadingMcp = useAiRegistryStore((s) => s.loadingMcp);
  const refreshMcp = useAiRegistryStore((s) => s.refreshMcp);
  const initRegistry = useAiRegistryStore((s) => s.init);
  const loadRegistry = useAiRegistryStore((s) => s.load);

  const [filter, setFilter] = useState("");
  const [showAvailableSkills, setShowAvailableSkills] = useState(false);
  const [showAvailableMcp, setShowAvailableMcp] = useState(false);
  const [showAvailableExt, setShowAvailableExt] = useState(false);

  useEffect(() => {
    initRegistry();
    if (activeKey) {
      void loadRegistry(activeKey);
    }
  }, [activeKey, initRegistry, loadRegistry]);

  const timeline = useMemo(() => buildTimeline(transcript), [transcript]);

  const report = useMemo(() => {
    const ctx = {
      cwd: activeProject?.path ?? "",
      homeDir: registry?.homeDir ?? "",
      registry,
      mcpCatalog: mcp,
    };
    return collectToolUsage(timeline, ctx);
  }, [timeline, activeProject?.path, registry, mcp]);

  const available = useMemo(() => {
    return availableOnly(report, registry, mcp);
  }, [report, registry, mcp]);

  const q = filter.trim().toLowerCase();

  const filteredSkills = report.skills.filter(
    (s) => !q || s.label.toLowerCase().includes(q) || String(s.details?.description ?? "").toLowerCase().includes(q),
  );
  const filteredAvailableSkills = available.skills.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );

  const filteredSubagents = report.subagents.agents.filter(
    (a) => !q || a.type.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || (a.model ?? "").toLowerCase().includes(q),
  );

  const filteredMcp = report.mcp.filter(
    (m) => !q || m.server.toLowerCase().includes(q) || Object.keys(m.tools).some((t) => t.toLowerCase().includes(q)),
  );
  const filteredAvailableMcp = available.mcp.filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.tools.some((t) => t.name.toLowerCase().includes(q)),
  );

  const filteredBuiltin = report.builtin.filter((b) => !q || b.label.toLowerCase().includes(q));

  const filteredExtensions = report.extensions.filter(
    (e) => !q || e.packageName.toLowerCase().includes(q) || Object.keys(e.tools).some((t) => t.toLowerCase().includes(q)),
  );
  const filteredAvailableExt = available.extensions.filter(
    (e) => !q || e.packageName.toLowerCase().includes(q) || e.tools.some((t) => t.name.toLowerCase().includes(q)),
  );

  const hasAnyActivity =
    report.skills.length > 0 ||
    report.subagents.totalCount > 0 ||
    report.mcp.length > 0 ||
    report.builtin.length > 0 ||
    report.extensions.length > 0;

  return (
    <div className="tools-panel">
      {/* Panel Header */}
      <div className="ui-panel-header">
        <div className="ui-panel-title">
          <Blocks size={14} /> AI Tools
        </div>
        <button
          className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
          onClick={() => void refreshMcp()}
          title="Refresh tool registry and MCP catalog"
          disabled={loadingMcp}
        >
          <RefreshCw size={13} className={loadingMcp ? "spin" : undefined} />
        </button>
      </div>

      {/* Filter search */}
      <div className="tools-panel__filter">
        <input
          type="text"
          className="tools-panel__input"
          placeholder="Filter tools, skills, subagents..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="tools-panel__body ui-scroll">
        {!hasAnyActivity && available.skills.length === 0 && available.mcp.length === 0 && (
          <div className="ui-empty" style={{ margin: "30px auto" }}>
            <Blocks size={24} />
            <div>No AI tools registered yet</div>
            <div style={{ fontSize: 11 }}>Tools and skills appear as soon as a Pi session is active.</div>
          </div>
        )}

        {/* 1. SKILLS SECTION */}
        {(filteredSkills.length > 0 || filteredAvailableSkills.length > 0) && (
          <div className="tools-section">
            <div className="tools-section__header">
              <span className="tools-section__title">
                <Sparkles size={13} /> Skills ({filteredSkills.length} used)
              </span>
            </div>

            <div className="tools-list">
              {filteredSkills.map((s) => (
                <div
                  key={s.id}
                  className="tools-item is-used is-clickable"
                  onClick={() => {
                    const target = s.firstRef?.toolCallId || s.firstRef?.itemKey;
                    if (target) scrollToToolCall(target);
                  }}
                  title="Click to jump to first skill use"
                >
                  <div className="tools-item__icon">
                    <Sparkles size={13} />
                  </div>
                  <div className="tools-item__content">
                    <div className="tools-item__name-row">
                      <span className="tools-item__name">{s.label}</span>
                    </div>
                    {typeof s.details?.description === "string" && s.details.description && (
                      <span className="tools-item__sub">{s.details.description}</span>
                    )}
                  </div>
                  <div className="tools-item__chips">
                    <span className="ui-chip ui-chip--accent">×{s.count}</span>
                  </div>
                </div>
              ))}

              {/* Available skills */}
              {filteredAvailableSkills.length > 0 && (
                <div className="tools-available-wrap">
                  <button
                    className="tools-available-toggle"
                    onClick={() => setShowAvailableSkills((p) => !p)}
                  >
                    {showAvailableSkills ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>Available skills ({filteredAvailableSkills.length})</span>
                  </button>
                  {showAvailableSkills &&
                    filteredAvailableSkills.map((sk) => (
                      <div key={sk.name} className="tools-item tools-item--available">
                        <div className="tools-item__content">
                          <span className="tools-item__name">{sk.name}</span>
                          {sk.description && <span className="tools-item__sub">{sk.description}</span>}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. SUBAGENTS SECTION */}
        {filteredSubagents.length > 0 && (
          <div className="tools-section">
            <div className="tools-section__header">
              <span className="tools-section__title">
                <Bot size={13} /> Subagents ({filteredSubagents.length})
              </span>
              {report.subagents.totalCost > 0 && (
                <span className="tools-section__meta mono">
                  {formatCost(report.subagents.totalCost)}
                </span>
              )}
            </div>

            <div className="tools-list">
              {filteredSubagents.map((a) => (
                <div
                  key={a.toolCallId}
                  className="tools-item is-used is-clickable"
                  onClick={() => scrollToToolCall(a.toolCallId)}
                  title="Click to jump to subagent card"
                >
                  <div className="tools-item__icon">
                    <Bot size={13} />
                  </div>
                  <div className="tools-item__content">
                    <div className="tools-item__name-row">
                      <span className="tools-item__name">{a.type}</span>
                      <span className={`msg-agent-card__status-chip status-${a.status}`}>
                        {a.status}
                      </span>
                    </div>
                    <span className="tools-item__sub">{a.description}</span>
                  </div>
                  <div className="tools-item__chips">
                    {a.model && (
                      <span className="ui-chip ui-chip--neutral" style={{ fontSize: "10px" }}>
                        <Cpu size={10} /> {a.model}
                      </span>
                    )}
                    {a.cost !== undefined && a.cost > 0 && (
                      <span className="ui-chip ui-chip--neutral mono" style={{ fontSize: "10px" }}>
                        {formatCost(a.cost)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. MCP SERVERS SECTION */}
        {(filteredMcp.length > 0 || filteredAvailableMcp.length > 0) && (
          <div className="tools-section">
            <div className="tools-section__header">
              <span className="tools-section__title">
                <Network size={13} /> MCP Servers
              </span>
            </div>

            <div className="tools-list">
              {filteredMcp.map((m) => (
                <div key={m.server} className="tools-item is-used" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Network size={12} className="tools-item__icon" />
                      <span className="tools-item__name">{m.server}</span>
                    </div>
                    <span className="ui-chip ui-chip--neutral">×{m.totalCount} calls</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {Object.entries(m.tools).map(([toolName, info]) => (
                      <button
                        key={toolName}
                        type="button"
                        className="ui-chip ui-chip--accent"
                        style={{ cursor: info.firstRef?.toolCallId ? "pointer" : "default" }}
                        onClick={() => {
                          if (info.firstRef?.toolCallId) scrollToToolCall(info.firstRef.toolCallId);
                        }}
                        title={info.firstRef?.toolCallId ? "Jump to tool call" : undefined}
                      >
                        {toolName} ×{info.count}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {filteredAvailableMcp.length > 0 && (
                <div className="tools-available-wrap">
                  <button
                    className="tools-available-toggle"
                    onClick={() => setShowAvailableMcp((p) => !p)}
                  >
                    {showAvailableMcp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>Available MCP tools ({filteredAvailableMcp.reduce((acc, x) => acc + x.tools.length, 0)})</span>
                  </button>
                  {showAvailableMcp &&
                    filteredAvailableMcp.map((srv) => (
                      <div key={srv.name} className="tools-item tools-item--available" style={{ flexDirection: "column", alignItems: "stretch" }}>
                        <span className="tools-item__name">{srv.name}</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                          {srv.tools.map((t) => (
                            <span key={t.name} className="ui-chip ui-chip--neutral" title={t.description}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. BUILT-IN TOOLS SECTION */}
        {filteredBuiltin.length > 0 && (
          <div className="tools-section">
            <div className="tools-section__header">
              <span className="tools-section__title">
                <Wrench size={13} /> Built-in Tools
              </span>
            </div>

            <div className="tools-list">
              {filteredBuiltin.map((b) => (
                <div
                  key={b.id}
                  className="tools-item is-used is-clickable"
                  onClick={() => {
                    if (b.firstRef?.toolCallId) scrollToToolCall(b.firstRef.toolCallId);
                  }}
                  title="Click to jump to first use"
                >
                  <div className="tools-item__icon">
                    <Wrench size={12} />
                  </div>
                  <div className="tools-item__content">
                    <span className="tools-item__name">{b.label}</span>
                  </div>
                  <div className="tools-item__chips">
                    <span className="ui-chip ui-chip--neutral">×{b.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. EXTENSION TOOLS SECTION */}
        {(filteredExtensions.length > 0 || filteredAvailableExt.length > 0) && (
          <div className="tools-section">
            <div className="tools-section__header">
              <span className="tools-section__title">
                <Box size={13} /> Extension Tools
              </span>
            </div>

            <div className="tools-list">
              {filteredExtensions.map((pkg) => (
                <div key={pkg.packageName} className="tools-item is-used" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Box size={12} className="tools-item__icon" />
                      <span className="tools-item__name">{pkg.packageName}</span>
                    </div>
                    <span className="ui-chip ui-chip--neutral">×{pkg.totalCount}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {Object.entries(pkg.tools).map(([toolName, info]) => (
                      <button
                        key={toolName}
                        type="button"
                        className="ui-chip ui-chip--accent"
                        style={{ cursor: info.firstRef?.toolCallId ? "pointer" : "default" }}
                        onClick={() => {
                          if (info.firstRef?.toolCallId) scrollToToolCall(info.firstRef.toolCallId);
                        }}
                        title={info.firstRef?.toolCallId ? "Jump to tool call" : undefined}
                      >
                        {toolName} ×{info.count}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {filteredAvailableExt.length > 0 && (
                <div className="tools-available-wrap">
                  <button
                    className="tools-available-toggle"
                    onClick={() => setShowAvailableExt((p) => !p)}
                  >
                    {showAvailableExt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>Available extensions ({filteredAvailableExt.reduce((acc, x) => acc + x.tools.length, 0)})</span>
                  </button>
                  {showAvailableExt &&
                    filteredAvailableExt.map((ext) => (
                      <div key={ext.packageName} className="tools-item tools-item--available" style={{ flexDirection: "column", alignItems: "stretch" }}>
                        <span className="tools-item__name">{ext.packageName}</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                          {ext.tools.map((t) => (
                            <span key={t.name} className="ui-chip ui-chip--neutral" title={t.description}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
