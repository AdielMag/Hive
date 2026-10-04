/**
 * The `ModuleHost` handed to each renderer module. Everything here delegates to existing core stores so
 * modules never reach into `renderer/store/*` themselves.
 */
import type { ModuleHost, ModuleTab, OpenTabSpec } from "@hive/module-sdk/renderer";
import type { AgentMode, TabItem } from "@hive/protocol";
import { Markdown } from "../components/code/Markdown.tsx";
import { CodeBlock } from "../components/code/CodeBlock.tsx";
import { ProviderIcon } from "../components/ProviderIcon.tsx";
import { copyText } from "../lib/clipboard.ts";
import { setLinkHandler } from "./link-bus.ts";
import { AiModelChip } from "../components/AiModelChip.tsx";
import { COMMANDS_BY_ID } from "../features/commands/registry.ts";
import { useSessionStore } from "../store/session-store.ts";
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
const HostAiModelChip: ModuleHost["ui"]["AiModelChip"] = (props) => <AiModelChip {...props} />;
const HostCodeBlock: ModuleHost["ui"]["CodeBlock"] = (props) => <CodeBlock {...props} />;
const HostProviderIcon: ModuleHost["ui"]["ProviderIcon"] = (props) => <ProviderIcon {...props} />;

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
      run: async (commandId) => {
        await COMMANDS_BY_ID.get(commandId)?.run();
      },
    },
    settings: { open: (tabId) => useUi.getState().openSettings(tabId ? `${moduleId}:${tabId}` : undefined) },
    openExternal: (url: string) => window.studio.openSystemBrowser(url),
    links: { setHandler: (handler) => setLinkHandler(moduleId, handler) },
    ui: { Markdown: HostMarkdown, AiModelChip: HostAiModelChip, CodeBlock: HostCodeBlock, ProviderIcon: HostProviderIcon },
    models: {
      catalog: () => useSessionStore.getState().allCatalogModels,
      enabledKeys: () => useSessionStore.getState().enabledModelKeys,
      loadCatalog: () => useSessionStore.getState().loadModelsCatalog(),
    },
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
      activeProject: () => {
        const p = useSessionStore.getState().activeProject;
        return p ? { id: p.id, name: p.name, path: p.path } : null;
      },
      setMode: (mode) => useSessionStore.getState().setMode(mode as AgentMode),
      setPrompt: (text) => useSessionStore.getState().setPromptText(text),
    },
    ipc: {
      invoke: (method, ...args) => window.studio.modules.invoke(moduleId, method, ...args) as Promise<never>,
      on: (event, listener) => window.studio.modules.on(moduleId, event, listener as (payload: unknown) => void),
    },
  };
}

setModuleHostFactory(createModuleHost);
