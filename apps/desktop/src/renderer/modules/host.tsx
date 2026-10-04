/**
 * The `ModuleHost` handed to each renderer module. Everything here delegates to existing core stores so
 * modules never reach into `renderer/store/*` themselves.
 */
import { useMemo } from "react";
import type { ActiveSessionContext, ModuleHost, ModuleTab, OpenTabSpec, ResolvedFeatureModelLite, SessionCatalogLite } from "@hive/module-sdk/renderer";
import { BRIDGE_TOPICS, type AgentMode, type TabItem } from "@hive/protocol";
import { Markdown } from "../components/code/Markdown.tsx";
import { CodeBlock } from "../components/code/CodeBlock.tsx";
import { HighlightedSource } from "../components/code/HighlightedSource.tsx";
import { DiffView } from "../components/code/DiffView.tsx";
import { languageFromPath, languageLabel, resolveLanguage } from "../lib/highlight/languages.ts";
import { ProviderIcon } from "../components/ProviderIcon.tsx";
import { copyText } from "../lib/clipboard.ts";
import { scrollToToolCall } from "../components/Transcript.tsx";
import { useActiveRegistry } from "../store/ai-registry-store.ts";
import { getStoredItem, setStoredItem } from "../lib/storage.ts";
import { useFeatureModelStore, resolveFeatureModel, type FeatureModelsConfig } from "../store/feature-models-store.ts";
import { setLinkHandler } from "./link-bus.ts";
import { Slot } from "./ModuleViews.tsx";
import { AiModelChip } from "../components/AiModelChip.tsx";
import { ContextBreakdownPanel } from "../components/ContextBreakdownPanel.tsx";
import { COMMANDS_BY_ID } from "../features/commands/registry.ts";
import { useSessionStore } from "../store/session-store.ts";
import { useAppearance } from "../features/appearance/appearance-store.ts";
import { useUi } from "../store/ui-store.ts";
import { subscribeSessionEvents } from "./session-bus.ts";
import { setModuleHostFactory } from "./registry.ts";
import { toast } from "./toast-store.ts";

const toModuleTab = (t: TabItem): ModuleTab => ({
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

const HostMarkdown: ModuleHost["ui"]["Markdown"] = ({ text, className }) => <Markdown text={text} className={className} />;
const HostAiModelChip: ModuleHost["ui"]["AiModelChip"] = ({ feature, ...props }) => (
  <AiModelChip {...props} feature={feature as React.ComponentProps<typeof AiModelChip>["feature"]} />
);

function useFeatureModel(featureId: string): ResolvedFeatureModelLite {
  const pref = useFeatureModelStore((s) => s.config[featureId as keyof FeatureModelsConfig]);
  const selectedModel = useSessionStore((s) => s.selectedModel);
  const defaultModel = useSessionStore((s) => s.defaultModel);
  const catalog = useSessionStore((s) => s.allCatalogModels);
  return useMemo(() => resolveFeatureModel(pref, selectedModel, defaultModel, catalog), [pref, selectedModel, defaultModel, catalog]);
}

const useSessionCatalog = (): SessionCatalogLite[] => useSessionStore((s) => s.allSessions);

function useTheme() {
  const theme = useAppearance((s) => s.theme);
  const editor = useAppearance((s) => s.editor);
  const setTheme = useAppearance((s) => s.setTheme);
  const replaceTheme = useAppearance((s) => s.replaceTheme);
  const setEditor = useAppearance((s) => s.setEditor);
  const reset = useAppearance((s) => s.reset);
  return { theme, editor, setTheme, replaceTheme, setEditor, reset };
}

function useActiveSession(): ActiveSessionContext {
  const activeProject = useSessionStore((s) => s.activeProject);
  const transcript = useSessionStore((s) => s.transcript);
  const registry = useActiveRegistry();
  const selected = useSessionStore((s) => s.selectedModel);
  const provider = selected?.provider;
  const id = selected?.id;
  const name = selected?.name;
  const model = useMemo(() => (provider && id ? { provider, id, name } : null), [provider, id, name]);
  return { project: activeProject, transcript, registry, model };
}
const HostCodeBlock: ModuleHost["ui"]["CodeBlock"] = (props) => <CodeBlock {...props} />;
const HostHighlightedSource: ModuleHost["ui"]["HighlightedSource"] = (props) => <HighlightedSource {...props} />;
const HostDiffView: ModuleHost["ui"]["DiffView"] = ({ diff, language }) => <DiffView diff={diff} lang={language ?? null} />;
const HostProviderIcon: ModuleHost["ui"]["ProviderIcon"] = (props) => <ProviderIcon {...props} />;
const HostContextBreakdown: ModuleHost["ui"]["ContextBreakdownPanel"] = (props) => <ContextBreakdownPanel {...props} />;

const isDark = (): boolean => document.documentElement.dataset.theme !== "light";

export function createModuleHost(moduleId: string): ModuleHost {
  return {
    moduleId,
    tabs: {
      open: (spec: OpenTabSpec) => useSessionStore.getState().openModuleTab(spec),
      close: (tabId) => void useSessionStore.getState().closeTab(tabId),
      update: (tabId, patch) =>
        useSessionStore.setState((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId
              ? { ...t, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.data ? { data: { ...t.data, ...patch.data } } : {}) }
              : t,
          ),
        })),
      active: () => {
        const s = useSessionStore.getState();
        const tab = s.tabs.find((t) => t.id === s.activeTabId);
        return tab ? toModuleTab(tab) : undefined;
      },
      list: () => useSessionStore.getState().tabs.map(toModuleTab),
      onChange: (listener) => useSessionStore.subscribe((s, prev) => { if (s.tabs !== prev.tabs || s.activeTabId !== prev.activeTabId) listener(); }),
    },
    panels: {
      open: (side, panelId) => (side === "left" ? useUi.getState().showLeft(panelId) : useUi.getState().showRight(panelId)),
      toggle: (side, panelId) => (side === "left" ? useUi.getState().toggleLeft(panelId) : useUi.getState().toggleRight(panelId)),
      close: (side) => (side === "left" ? useUi.getState().showLeft(null) : useUi.getState().showRight(null)),
    },
    toast: (options) => void toast(options),
    commands: {
      run: async (commandId, args) => {
        await COMMANDS_BY_ID.get(commandId)?.run(args);
      },
      has: (commandId) => COMMANDS_BY_ID.has(commandId),
    },
    settings: { open: (tabId) => useUi.getState().openSettings(tabId ? `${moduleId}:${tabId}` : undefined) },
    openExternal: (url: string) => window.studio.openSystemBrowser(url),
    links: { setHandler: (handler) => setLinkHandler(moduleId, handler) },
    ui: { Markdown: HostMarkdown, AiModelChip: HostAiModelChip, CodeBlock: HostCodeBlock, HighlightedSource: HostHighlightedSource, DiffView: HostDiffView, ProviderIcon: HostProviderIcon, ContextBreakdownPanel: HostContextBreakdown, Slot },
    languages: {
      fromPath: (path) => languageFromPath(path),
      resolve: (name) => resolveLanguage(name),
      label: (language, raw) => languageLabel(language, raw),
    },
    files: { read: (filePath) => window.studio.readFile(filePath), list: (dirPath) => window.studio.listFiles(dirPath) },
    models: {
      catalog: () => useSessionStore.getState().allCatalogModels,
      enabledKeys: () => useSessionStore.getState().enabledModelKeys,
      loadCatalog: () => useSessionStore.getState().loadModelsCatalog(),
    },
    storage: { get: (key) => getStoredItem(key), set: (key, value) => setStoredItem(key, value) },
    hooks: { useSessionCatalog, useFeatureModel, useActiveSession, useTheme },
    clipboard: {
      copy: copyText,
    },
    theme: {
      isDark,
      subscribe: (listener) => {
        const observer = new MutationObserver(() => listener(isDark()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
      },
    },
    sessions: {
      onEvent: subscribeSessionEvents,
      onBridgeEvent: (listener) =>
        window.studio.onBridgeMessage(({ key, message }) => {
          if (message.type === "event" && message.topic === BRIDGE_TOPICS.toGui) listener({ key, data: message.data });
        }),
      emitToBridge: (key, data) => window.studio.bridgeEmit(key, BRIDGE_TOPICS.fromGui, data),
      activeProject: () => {
        const p = useSessionStore.getState().activeProject;
        return p ? { id: p.id, name: p.name, path: p.path } : null;
      },
      setMode: (mode) => useSessionStore.getState().setMode(mode as AgentMode),
      setPrompt: (text) => useSessionStore.getState().setPromptText(text),
      newSession: async (projectId) => {
        const id = projectId ?? useSessionStore.getState().activeProject?.id;
        if (id) await useSessionStore.getState().newSessionTab(id);
      },
    scrollToToolCall: (id) => scrollToToolCall(id),
    },
    ipc: {
      invoke: (method, ...args) => window.studio.modules.invoke(moduleId, method, ...args) as Promise<never>,
      invokeOf: (otherId, method, ...args) => window.studio.modules.invoke(otherId, method, ...args) as Promise<never>,
      on: (event, listener) => window.studio.modules.on(moduleId, event, listener as (payload: unknown) => void),
    },
  };
}

setModuleHostFactory(createModuleHost);
