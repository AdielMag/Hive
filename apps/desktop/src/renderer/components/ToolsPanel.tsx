/**
 * AI Tools panel: what this session used — skills, subagents, MCP servers, built-in and extension tools.
 * Every section is collapsible (state persisted); a filter forces matching sections open.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Blocks,
  Bot,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Loader2,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { buildTimeline } from "@pi-studio/pi-adapter";
import { useSessionStore } from "../store/session-store.ts";
import { useActiveRegistry, useAiRegistryStore } from "../store/ai-registry-store.ts";
import { availableOnly, collectToolUsage, type ToolUsageRef } from "../lib/ai/tool-usage.ts";
import type { SubagentView } from "../lib/ai/subagents.ts";
import { scrollToToolCall } from "./Transcript.tsx";
import { formatCost } from "../lib/format.ts";
import "../styles/tools-panel.css";

type SectionId = "skills" | "subagents" | "mcp" | "builtin" | "extensions";

const COLLAPSE_KEY = "pi-studio:tools-panel:collapsed";
const SUBAGENT_PREVIEW = 6;

function loadCollapsed(): Partial<Record<SectionId, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}") as Partial<Record<SectionId, boolean>>;
  } catch {
    return {};
  }
}

const jump = (ref?: ToolUsageRef) => {
  const target = ref?.toolCallId || ref?.itemKey;
  if (target) scrollToToolCall(target);
};

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
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [showAllAgents, setShowAllAgents] = useState(false);

  useEffect(() => {
    initRegistry();
    if (activeKey) void loadRegistry(activeKey);
  }, [activeKey, initRegistry, loadRegistry]);

  const toggleSection = (id: SectionId, wasOpen: boolean) => {
    // While filtering, sections are forced open; don't persist a collapse the user can't see.
    if (filter.trim()) return;
    setCollapsed((prev) => {
      const next = { ...prev, [id]: wasOpen };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: keep in-memory state only
      }
      return next;
    });
  };

  const timeline = useMemo(() => buildTimeline(transcript), [transcript]);
  const report = useMemo(
    () =>
      collectToolUsage(timeline, {
        cwd: activeProject?.path ?? "",
        homeDir: registry?.homeDir ?? "",
        registry,
        mcpCatalog: mcp,
      }),
    [timeline, activeProject?.path, registry, mcp],
  );
  const available = useMemo(() => availableOnly(report, registry, mcp), [report, registry, mcp]);

  const q = filter.trim().toLowerCase();
  const has = (...values: Array<string | undefined>) => !q || values.some((v) => v?.toLowerCase().includes(q));

  const skills = report.skills.filter((s) => has(s.label, String(s.details?.description ?? "")));
  const availableSkills = available.skills.filter((s) => has(s.name, s.description));
  const agents = report.subagents.agents.filter((a) => has(a.type, a.description, a.model));
  const mcpUsed = report.mcp.filter((m) => has(m.server, ...Object.keys(m.tools)));
  const mcpAvailable = available.mcp.filter((m) => has(m.name, ...m.tools.map((t) => t.name)));
  const builtin = report.builtin.filter((b) => has(b.label));
  const extensions = report.extensions.filter((e) => has(e.packageName, ...Object.keys(e.tools)));
  const extAvailable = available.extensions.filter((e) => has(e.packageName, ...e.tools.map((t) => t.name)));

  /**
   * Filtering forces sections open so matches are visible. Otherwise the user's last choice wins; sections
   * where nothing was used yet (only "available" items) start collapsed to keep the panel short.
   */
  const isOpen = (id: SectionId, used: number) => Boolean(q) || (collapsed[id] === undefined ? used > 0 : !collapsed[id]);

  const totalCalls =
    report.builtin.reduce((n, b) => n + b.count, 0) +
    report.mcp.reduce((n, m) => n + m.totalCount, 0) +
    report.extensions.reduce((n, e) => n + e.totalCount, 0);

  const statusCounts = useMemo(() => {
    const c = { running: 0, completed: 0, failed: 0 };
    for (const a of report.subagents.agents) {
      if (a.status === "running" || a.status === "queued" || a.status === "background") c.running++;
      else if (a.status === "completed" || a.status === "steered") c.completed++;
      else c.failed++;
    }
    return c;
  }, [report.subagents.agents]);

  const nothing =
    skills.length + availableSkills.length + agents.length + mcpUsed.length + mcpAvailable.length + builtin.length + extensions.length + extAvailable.length === 0;

  const visibleAgents = showAllAgents || q ? agents : agents.slice(-SUBAGENT_PREVIEW);
  const hiddenAgents = agents.length - visibleAgents.length;

  return (
    <div className="tools-panel">
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

      <div className="tools-panel__filter">
        <div className="tools-panel__search">
          <Search size={12} className="tools-panel__search-icon" />
          <input
            type="text"
            className="tools-panel__input"
            placeholder="Filter tools, skills, subagents…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button className="tools-panel__clear" onClick={() => setFilter("")} title="Clear filter" aria-label="Clear filter">
              <X size={11} />
            </button>
          )}
        </div>
        {(totalCalls > 0 || report.subagents.totalCount > 0) && !q && (
          <div className="tools-panel__summary">
            <span>
              <strong>{totalCalls}</strong> tool calls
            </span>
            {report.subagents.totalCount > 0 && (
              <span>
                <strong>{report.subagents.totalCount}</strong> subagents
              </span>
            )}
            {report.skills.length > 0 && (
              <span>
                <strong>{report.skills.length}</strong> skills
              </span>
            )}
          </div>
        )}
      </div>

      <div className="tools-panel__body ui-scroll">
        {nothing && (
          <div className="ui-empty" style={{ margin: "30px auto" }}>
            <Blocks size={24} />
            <div>{q ? "Nothing matches this filter" : "No AI tools registered yet"}</div>
            {!q && <div style={{ fontSize: 11 }}>Tools and skills appear as soon as a Pi session is active.</div>}
          </div>
        )}

        {/* Subagents first: the most information-dense, most-checked section. */}
        {agents.length > 0 && (
          <Section
            id="subagents"
            icon={<Bot size={13} />}
            title="Subagents"
            count={agents.length}
            open={isOpen("subagents", agents.length)}
            onToggle={toggleSection}
            meta={
              <>
                {statusCounts.running > 0 && (
                  <span className="tools-status-count is-running" title="Running">
                    <Loader2 size={10} className="spin" /> {statusCounts.running}
                  </span>
                )}
                {statusCounts.completed > 0 && (
                  <span className="tools-status-count is-ok" title="Completed">
                    <CheckCircle2 size={10} /> {statusCounts.completed}
                  </span>
                )}
                {statusCounts.failed > 0 && (
                  <span className="tools-status-count is-failed" title="Failed / aborted">
                    <XCircle size={10} /> {statusCounts.failed}
                  </span>
                )}
                {report.subagents.totalCost > 0 && <span className="tools-section__cost mono">{formatCost(report.subagents.totalCost)}</span>}
              </>
            }
          >
            {hiddenAgents > 0 && (
              <button className="tools-more" onClick={() => setShowAllAgents(true)}>
                Show {hiddenAgents} earlier
              </button>
            )}
            <div className="tools-agents">
              {visibleAgents.map((a) => (
                <SubagentRow key={a.toolCallId} agent={a} />
              ))}
            </div>
            {showAllAgents && agents.length > SUBAGENT_PREVIEW && !q && (
              <button className="tools-more" onClick={() => setShowAllAgents(false)}>
                Show fewer
              </button>
            )}
          </Section>
        )}

        {(skills.length > 0 || availableSkills.length > 0) && (
          <Section
            id="skills"
            icon={<Sparkles size={13} />}
            title="Skills"
            count={skills.length}
            open={isOpen("skills", skills.length)}
            onToggle={toggleSection}
            meta={availableSkills.length > 0 ? <span className="tools-section__hint">{availableSkills.length} available</span> : null}
          >
            {skills.length > 0 && (
              <div className="tools-rows">
                {skills.map((s) => (
                  <button key={s.id} className="tools-row" onClick={() => jump(s.firstRef)} title="Jump to first use">
                    <Sparkles size={12} className="tools-row__icon" />
                    <span className="tools-row__main">
                      <span className="tools-row__name">{s.label}</span>
                      {typeof s.details?.description === "string" && s.details.description && (
                        <span className="tools-row__sub">{s.details.description}</span>
                      )}
                    </span>
                    <span className="tools-count">×{s.count}</span>
                  </button>
                ))}
              </div>
            )}
            <Available label={`Show ${availableSkills.length} available`} show={availableSkills.length > 0} forceOpen={Boolean(q)} inline={skills.length === 0}>
              {availableSkills.map((sk) => (
                <div key={sk.name} className="tools-row tools-row--available" title={sk.description}>
                  <span className="tools-row__main">
                    <span className="tools-row__name">{sk.name}</span>
                    {sk.description && <span className="tools-row__sub">{sk.description}</span>}
                  </span>
                </div>
              ))}
            </Available>
          </Section>
        )}

        {builtin.length > 0 && (
          <Section
            id="builtin"
            icon={<Wrench size={13} />}
            title="Built-in tools"
            count={builtin.length}
            open={isOpen("builtin", builtin.length)}
            onToggle={toggleSection}
            meta={<span className="tools-section__hint">{builtin.reduce((n, b) => n + b.count, 0)} calls</span>}
          >
            <div className="tools-chips">
              {[...builtin]
                .sort((a, b) => b.count - a.count)
                .map((b) => (
                  <button key={b.id} className="tools-chip" onClick={() => jump(b.firstRef)} title="Jump to first use">
                    <span className="tools-chip__name">{b.label}</span>
                    <span className="tools-chip__count">{b.count}</span>
                  </button>
                ))}
            </div>
          </Section>
        )}

        {(mcpUsed.length > 0 || mcpAvailable.length > 0) && (
          <Section
            id="mcp"
            icon={<Network size={13} />}
            title="MCP servers"
            count={mcpUsed.length}
            open={isOpen("mcp", mcpUsed.length)}
            onToggle={toggleSection}
            meta={
              mcpAvailable.length > 0 ? (
                <span className="tools-section__hint">{mcpAvailable.reduce((n, x) => n + x.tools.length, 0)} tools available</span>
              ) : null
            }
          >
            {mcpUsed.map((m) => (
              <ToolGroup key={m.server} icon={<Network size={12} />} name={m.server} total={m.totalCount} tools={m.tools} />
            ))}
            <Available label={`Show ${mcpAvailable.reduce((n, x) => n + x.tools.length, 0)} available`} show={mcpAvailable.length > 0} forceOpen={Boolean(q)} inline={mcpUsed.length === 0}>
              {mcpAvailable.map((srv) => (
                <AvailableGroup key={srv.name} name={srv.name} tools={srv.tools} />
              ))}
            </Available>
          </Section>
        )}

        {(extensions.length > 0 || extAvailable.length > 0) && (
          <Section
            id="extensions"
            icon={<Box size={13} />}
            title="Extension tools"
            count={extensions.length}
            open={isOpen("extensions", extensions.length)}
            onToggle={toggleSection}
            meta={
              extAvailable.length > 0 ? (
                <span className="tools-section__hint">{extAvailable.reduce((n, x) => n + x.tools.length, 0)} tools available</span>
              ) : null
            }
          >
            {extensions.map((pkg) => (
              <ToolGroup key={pkg.packageName} icon={<Box size={12} />} name={pkg.packageName} total={pkg.totalCount} tools={pkg.tools} />
            ))}
            <Available label={`Show ${extAvailable.reduce((n, x) => n + x.tools.length, 0)} available`} show={extAvailable.length > 0} forceOpen={Boolean(q)} inline={extensions.length === 0}>
              {extAvailable.map((ext) => (
                <AvailableGroup key={ext.packageName} name={ext.packageName} tools={ext.tools} />
              ))}
            </Available>
          </Section>
        )}
      </div>
    </div>
  );
};

/* ── Building blocks ─────────────────────────────────────────────────── */

const Section: React.FC<{
  id: SectionId;
  icon: React.ReactNode;
  title: string;
  count: number;
  open: boolean;
  onToggle(id: SectionId, wasOpen: boolean): void;
  meta?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, icon, title, count, open, onToggle, meta, children }) => (
  <section className={`tools-section${open ? " is-open" : ""}`}>
    <button className="tools-section__header" onClick={() => onToggle(id, open)} aria-expanded={open}>
      <span className="tools-section__chevron">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      <span className="tools-section__title">
        {icon} {title}
      </span>
      {count > 0 && <span className="tools-section__count">{count}</span>}
      <span className="tools-section__meta">{meta}</span>
    </button>
    {open && <div className="tools-section__body">{children}</div>}
  </section>
);

/** "Available but unused" items. Rendered inline when the section has nothing used (the section toggle is enough). */
const Available: React.FC<{ label: string; show: boolean; forceOpen: boolean; inline?: boolean; children: React.ReactNode }> = ({
  label,
  show,
  forceOpen,
  inline,
  children,
}) => {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  if (inline) return <div className="tools-available__list is-inline">{children}</div>;
  const isOpen = open || forceOpen;
  return (
    <div className="tools-available">
      <button className="tools-available__toggle" onClick={() => setOpen((p) => !p)} aria-expanded={isOpen}>
        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>{label}</span>
      </button>
      {isOpen && <div className="tools-available__list">{children}</div>}
    </div>
  );
};

const ToolGroup: React.FC<{
  icon: React.ReactNode;
  name: string;
  total: number;
  tools: Record<string, { count: number; errors: number; firstRef?: ToolUsageRef }>;
}> = ({ icon, name, total, tools }) => (
  <div className="tools-group">
    <div className="tools-group__head">
      <span className="tools-group__icon">{icon}</span>
      <span className="tools-row__name">{name}</span>
      <span className="tools-count">{total} calls</span>
    </div>
    <div className="tools-chips">
      {Object.entries(tools)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([toolName, info]) => (
          <button
            key={toolName}
            className={`tools-chip${info.errors > 0 ? " has-errors" : ""}`}
            onClick={() => jump(info.firstRef)}
            disabled={!info.firstRef}
            title={info.errors > 0 ? `${info.errors} failed call(s) — jump to first use` : "Jump to first use"}
          >
            <span className="tools-chip__name">{toolName}</span>
            <span className="tools-chip__count">{info.count}</span>
          </button>
        ))}
    </div>
  </div>
);

const AvailableGroup: React.FC<{ name: string; tools: Array<{ name: string; description?: string }> }> = ({ name, tools }) => (
  <div className="tools-group tools-group--available">
    <div className="tools-group__head">
      <span className="tools-row__name">{name}</span>
      <span className="tools-count">{tools.length}</span>
    </div>
    <div className="tools-chips">
      {tools.map((t) => (
        <span key={t.name} className="tools-chip tools-chip--static" title={t.description}>
          <span className="tools-chip__name">{t.name}</span>
        </span>
      ))}
    </div>
  </div>
);

/* ── Subagent row ────────────────────────────────────────────────────── */

const STATUS_LABEL: Record<SubagentView["status"], string> = {
  queued: "Queued",
  running: "Running",
  background: "Running in background",
  completed: "Completed",
  steered: "Completed (steered)",
  aborted: "Aborted",
  stopped: "Stopped",
  error: "Failed",
};

function statusTone(status: SubagentView["status"]): "running" | "ok" | "failed" | "idle" {
  if (status === "running" || status === "background") return "running";
  if (status === "queued") return "idle";
  if (status === "completed" || status === "steered") return "ok";
  return "failed";
}

const StatusIcon: React.FC<{ status: SubagentView["status"] }> = ({ status }) => {
  const tone = statusTone(status);
  if (tone === "running") return <Loader2 size={13} className="spin" />;
  if (tone === "ok") return <CheckCircle2 size={13} />;
  if (tone === "failed") return <XCircle size={13} />;
  return status === "queued" ? <Clock size={13} /> : <CircleDashed size={13} />;
};

/** "gemini 2.5 pro (antigravity) (asked anthropic/…)" → "gemini 2.5 pro"; full string goes in the tooltip. */
function shortModel(model?: string): string | undefined {
  if (!model) return undefined;
  const base = model.split(" (")[0]!.trim();
  return base.includes("/") ? base.split("/").pop() : base;
}

/** One readable line for an error (raw provider errors are often JSON blobs / long URLs); full text stays in the tooltip. */
function summarizeError(error: string): string {
  const status = error.match(/\b(4\d\d|5\d\d)\b/)?.[1];
  if (status === "429" || (!status && /rate.?limit|resource.?exhausted/i.test(error))) return "Rate limited (429)";
  const message = error.match(/"message"\s*:\s*"([^"]+)"/)?.[1];
  const text = (message ?? error).split(/\r?\n/)[0]!.replace(/,?\s*endpoint=\S+/i, "").trim();
  return status && !text.includes(status) ? `${text} (${status})` : text;
}

function shortDuration(ms?: number): string | undefined {
  if (!ms || ms < 0) return undefined;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const SubagentRow: React.FC<{ agent: SubagentView }> = ({ agent: a }) => {
  const tone = statusTone(a.status);
  const model = shortModel(a.model);
  const duration = shortDuration(a.durationMs);
  const meta = [model, duration, a.toolUses ? `${a.toolUses} tool${a.toolUses === 1 ? "" : "s"}` : undefined].filter(Boolean);
  const tooltip = [
    `${a.type} — ${STATUS_LABEL[a.status]}`,
    a.description,
    a.model && `Model: ${a.model}`,
    a.error && `Error: ${a.error}`,
    "Click to jump to the subagent card",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button className={`tools-agent tone-${tone}`} onClick={() => scrollToToolCall(a.toolCallId)} title={tooltip}>
      <span className="tools-agent__status" role="img" aria-label={STATUS_LABEL[a.status]}>
        <StatusIcon status={a.status} />
      </span>
      <span className="tools-agent__main">
        <span className="tools-agent__top">
          <span className="tools-agent__type">{a.type || "agent"}</span>
          {a.cost !== undefined && a.cost > 0 && <span className="tools-agent__cost mono">{formatCost(a.cost)}</span>}
        </span>
        {a.description && <span className="tools-agent__desc">{a.description}</span>}
        {tone === "running" && a.activity ? (
          <span className="tools-agent__meta is-activity">{a.activity}</span>
        ) : tone === "failed" && a.error ? (
          <span className="tools-agent__meta is-error">{summarizeError(a.error)}</span>
        ) : (
          meta.length > 0 && <span className="tools-agent__meta">{meta.join(" · ")}</span>
        )}
      </span>
    </button>
  );
};
