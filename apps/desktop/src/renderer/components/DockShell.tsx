import React, { useMemo } from "react";
import { Layout, Model, type TabNode, type IJsonModel } from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import { Folder, GitBranch, Files, Terminal as TerminalIcon, PieChart } from "lucide-react";
import { Transcript } from "./Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { useSessionStore } from "../store/session-store.ts";

const DEFAULT_LAYOUT: IJsonModel = {
  global: {
    tabEnableClose: false,
    tabSetEnableClose: false,
    tabSetEnableDrop: true,
    borderBarSize: 32,
    borderEnableAutoHide: false,
  },
  borders: [
    {
      type: "border",
      location: "left",
      size: 240,
      children: [
        {
          type: "tab",
          id: "projects",
          name: "Projects",
          component: "projects",
          icon: "icon-projects",
        },
        {
          type: "tab",
          id: "files",
          name: "Files",
          component: "files",
          icon: "icon-files",
        },
        {
          type: "tab",
          id: "git",
          name: "Git",
          component: "git",
          icon: "icon-git",
        },
      ],
    },
    {
      type: "border",
      location: "right",
      size: 280,
      children: [
        {
          type: "tab",
          id: "context",
          name: "Context",
          component: "context",
          icon: "icon-context",
        },
        {
          type: "tab",
          id: "terminal",
          name: "Terminal",
          component: "terminal",
          icon: "icon-terminal",
        },
      ],
    },
  ],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        weight: 100,
        enableTabStrip: false,
        children: [
          {
            type: "tab",
            id: "chat",
            name: "Session",
            component: "chat",
          },
        ],
      },
    ],
  },
};

export const DockShell: React.FC = () => {
  const model = useMemo(() => Model.fromJson(DEFAULT_LAYOUT), []);
  const { projectName, projectPath, startSession } = useSessionStore();

  const handlePickFolder = async () => {
    const folder = await window.studio.pickFolder();
    if (folder) {
      await startSession(folder);
    }
  };

  const factory = (node: TabNode) => {
    const component = node.getComponent();
    switch (component) {
      case "chat":
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
            <Transcript />
            <Composer />
          </div>
        );

      case "projects":
        return <Sidebar />;

      case "files":
        return (
          <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>File Explorer</div>
            <div>Full file tree & viewers arriving in Slice 4.</div>
          </div>
        );

      case "git":
        return (
          <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Git Status</div>
            <div>Staged / unstaged changes & turn checkpoints arriving in Slice 5.</div>
          </div>
        );

      case "context":
        return (
          <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Context Breakdown</div>
            <div>Detailed token category inspector arriving in Slice 6.</div>
          </div>
        );

      case "terminal":
        return (
          <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Integrated Terminal</div>
            <div>Interactive node-pty terminal arriving in Slice 4.</div>
          </div>
        );

      default:
        return <div>{component}</div>;
    }
  };

  const titleFactory = (node: TabNode) => {
    const id = node.getId();
    if (id === "projects") return <span style={{ display: "flex", gap: 4 }}><Folder size={14} /> Projects</span>;
    if (id === "files") return <span style={{ display: "flex", gap: 4 }}><Files size={14} /> Files</span>;
    if (id === "git") return <span style={{ display: "flex", gap: 4 }}><GitBranch size={14} /> Git</span>;
    if (id === "context") return <span style={{ display: "flex", gap: 4 }}><PieChart size={14} /> Context</span>;
    if (id === "terminal") return <span style={{ display: "flex", gap: 4 }}><TerminalIcon size={14} /> Terminal</span>;
    return undefined;
  };

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <Layout model={model} factory={factory} titleFactory={titleFactory} />
    </div>
  );
};
