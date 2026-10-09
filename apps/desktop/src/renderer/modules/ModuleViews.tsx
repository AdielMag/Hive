/** Shell-side views for module contributions: tab/panel renderers, rail buttons, slots and the "needs a module" placeholder. */
import React from "react";
import { Loader2, PackageOpen, Puzzle } from "lucide-react";
import type { TabItem } from "@hive/protocol";
import type { ModuleTab, PanelContribution, RailItemContribution, ToolCardCall, ToolCardContribution } from "@hive/module-sdk/renderer";
import { ErrorBoundary } from "../components/ErrorBoundary.tsx";
import { useShortcut } from "../features/commands/useShortcut.ts";
import { ownerOfPanel, ownerOfTabKind } from "./manifests.ts";
import { useContributions, useModuleHost, useModules, useSlot } from "./registry.ts";

export const toModuleTab = (t: TabItem): ModuleTab => ({
  id: t.id,
  kind: t.kind,
  title: t.title,
  projectId: t.projectId,
  filePath: t.filePath,
  url: t.url,
  favicon: t.favicon,
  isSleeping: t.isSleeping,
  lastActiveAt: t.lastActiveAt,
  data: t.data,
});

/**
 * Shown where a persisted tab/panel belongs to a module that is disabled (or unknown). Offers to enable the
 * owning module instead of silently dropping the user's layout.
 */
export const ModulePlaceholder: React.FC<{ owner?: { id: string; title: string }; what: string; onClose?: () => void }> = ({ owner, what, onClose }) => {
  const enabled = useModules((s) => (owner ? s.enabled.includes(owner.id) : false));
  const error = useModules((s) => (owner ? s.errors[owner.id] : undefined));
  const [busy, setBusy] = React.useState(false);
  const ready = useModules((s) => s.ready);
  const setEnabled = useModules((s) => s.setEnabled);

  // Enabled but not yet loaded (startup) or loading.
  if (!ready || (owner && enabled && !error)) {
    return (
      <div className="module-placeholder" role="status">
        <Loader2 size={18} className="spin" />
        <p>Loading {owner?.title ?? "module"}…</p>
      </div>
    );
  }

  return (
    <div className="module-placeholder">
      <PackageOpen size={22} />
      {owner ? (
        <>
          <h3>{error ? `${owner.title} failed to load` : `This ${what} needs the ${owner.title} module`}</h3>
          {error && <p className="module-placeholder__error">{error}</p>}
          <div className="module-placeholder__actions">
            <button
              className="ui-btn ui-btn--primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await setEnabled(owner.id, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Enabling…" : `Enable ${owner.title}`}
            </button>
            {onClose && (
              <button className="ui-btn ui-btn--ghost" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <h3>This {what} isn't available</h3>
          <p>It was provided by a module that no longer exists.</p>
          {onClose && (
            <button className="ui-btn ui-btn--ghost" onClick={onClose}>
              Close
            </button>
          )}
        </>
      )}
    </div>
  );
};

/** Content of a module-owned tab kind (falls back to the placeholder when its module isn't loaded). */
export const ModuleTabView: React.FC<{ tab: TabItem; onClose?: () => void }> = ({ tab, onClose }) => {
  const kinds = useContributions("tabKinds");
  const contribution = kinds.find((k) => k.kind === tab.kind);
  const host = useModuleHost(contribution?.moduleId ?? "");
  if (!contribution || !host) return <ModulePlaceholder owner={tab.kind ? ownerOfTabKind(tab.kind) : undefined} what="tab" onClose={onClose} />;
  const View = contribution.component;
  return <View tab={toModuleTab(tab)} host={host} />;
};

/** Content of a module-owned side panel. */
export const ModulePanelView: React.FC<{ side: "left" | "right"; panelId: string; onClose?: () => void }> = ({ side, panelId, onClose }) => {
  const panels = useContributions(side === "left" ? "leftPanels" : "rightPanels");
  const contribution = panels.find((p) => p.id === panelId);
  const host = useModuleHost(contribution?.moduleId ?? "");
  if (!contribution || !host) return <ModulePlaceholder owner={ownerOfPanel(side, panelId)} what="panel" onClose={onClose} />;
  const View = contribution.component;
  return <View host={host} />;
};

/** Rail button for a contributed panel (own component so the shortcut hook runs per button). */
export const ModuleRailButton: React.FC<{ panel: PanelContribution & { moduleId: string }; active: boolean; onClick(): void }> = ({ panel, active, onClick }) => {
  const shortcut = useShortcut(panel.commandId ?? "");
  const host = useModuleHost(panel.moduleId);
  const Icon = panel.icon;
  const baseTitle = shortcut ? `${panel.title} (${shortcut})` : panel.title;
  // `useTitle` is a hook, but a panel only exists once its module (and so its host) is loaded, so the call is stable per button.
  const title = host && panel.useTitle ? panel.useTitle(host, baseTitle) : baseTitle;
  const Badge = panel.badge;
  return (
    <button className={`rail__btn${active ? " is-active" : ""}`} onClick={onClick} title={title} aria-label={title} aria-pressed={active}>
      {host && Badge ? (
        <span className="rail__icon-wrap">
          <Icon size={18} />
          <Badge host={host} />
        </span>
      ) : (
        <Icon size={18} />
      )}
    </button>
  );
};

/** Rail button for a contributed action/tab (e.g. Library, Usage). */
export const ModuleRailItemButton: React.FC<{ item: RailItemContribution & { moduleId: string } }> = ({ item }) => {
  const shortcut = useShortcut(item.commandId ?? "");
  const host = useModuleHost(item.moduleId);
  const Icon = item.icon;
  const title = shortcut ? `${item.title} (${shortcut})` : item.title;
  const active = host && item.active ? item.active(host) : false;
  return (
    <button
      className={`rail__btn${active ? " is-active" : ""}`}
      onClick={() => host && item.onClick(host)}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      <Icon size={18} />
    </button>
  );
};

/** Renders everything modules contributed to a named extension point. */
export const Slot: React.FC<{ name: string; props?: Record<string, unknown> }> = ({ name, props }) => {
  const entries = useSlot(name);
  const loaded = useModules((s) => s.loaded);
  return (
    <>
      {entries.map(({ moduleId, Component }, i) => {
        const host = loaded[moduleId]?.host;
        return host ? <Component key={`${moduleId}:${i}`} host={host} {...props} /> : null;
      })}
    </>
  );
};

/** Tab icon for module tab kinds. */
export const ModuleTabIcon: React.FC<{ tab: TabItem; size?: number }> = ({ tab, size = 13 }) => {
  const kinds = useContributions("tabKinds");
  const Icon = kinds.find((k) => k.kind === tab.kind)?.icon;
  return Icon ? <Icon size={size} tab={toModuleTab(tab)} /> : <Puzzle size={size} />;
};

/** Display title for a module tab (contribution may override). */
export function useModuleTabTitle(tab: TabItem): string {
  const kinds = useContributions("tabKinds");
  const k = kinds.find((x) => x.kind === tab.kind);
  return k?.title ? k.title(toModuleTab(tab)) : tab.title;
}

/** Module-owned replacement for a tool call's transcript row (see `RendererContributions.toolCards`). */
export const ModuleToolCard: React.FC<{
  card: ToolCardContribution & { moduleId: string };
  call: ToolCardCall;
  /** Stock raw body for this call (see ToolCardProps.RawBody). */
  RawBody: React.ComponentType;
}> = ({ card, call, RawBody }) => {
  const host = useModuleHost(card.moduleId);
  if (!host) return null;
  const View = card.component;
  return (
    <ErrorBoundary label="Tool card" resetKey={call.id}>
      <div data-tool-call-id={call.id}>
        <View host={host} call={call} RawBody={RawBody} />
      </div>
    </ErrorBoundary>
  );
};
