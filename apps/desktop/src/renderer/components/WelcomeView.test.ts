import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomeView } from "./WelcomeView.tsx";
import { useSessionStore } from "../store/session-store.ts";

describe("WelcomeView", () => {
  const setStoreState = (patch: any) => {
    Object.assign((useSessionStore as any).getInitialState(), patch);
    useSessionStore.setState(patch);
  };

  it("renders generic onboarding when activeProject is null", () => {
    setStoreState({
      activeProject: null,
      allSessions: [],
      bootstrap: null,
    });

    const html = renderToStaticMarkup(React.createElement(WelcomeView));
    expect(html).toContain("Open a Project Folder");
    expect(html).toContain("Desktop workbench for the Pi coding agent");
    expect(html).not.toContain("Start a New Session");
    expect(html).not.toContain("Previous Sessions in this Project");
  });

  it("renders project hub with new session action and previous sessions when activeProject is set", () => {
    const project = {
      id: "proj_hive",
      name: "Hive Worktree",
      path: "C:/work/hive",
      color: "#ff8800",
    } as any;

    const sessions = [
      {
        id: "sess_1",
        projectId: "proj_hive",
        path: "C:/work/hive/.pi/s1.jsonl",
        title: "Session 1 in Hive",
        modified: new Date().toISOString(),
      },
      {
        id: "sess_2",
        projectId: "proj_hive",
        path: "C:/work/hive/.pi/s2.jsonl",
        title: "Session 2 in Hive",
        modified: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "sess_other",
        projectId: "proj_other",
        path: "C:/work/other/.pi/s3.jsonl",
        title: "Session in Other Project",
        modified: new Date().toISOString(),
      },
    ] as any[];

    setStoreState({
      activeProject: project,
      allSessions: sessions,
      bootstrap: null,
    });

    const html = renderToStaticMarkup(React.createElement(WelcomeView));
    expect(html).toContain("Hive Worktree");
    expect(html).toContain("C:/work/hive");
    expect(html).toContain("Start a New Session");
    expect(html).toContain("Previous Sessions in this Project");
    expect(html).toContain("Session 1 in Hive");
    expect(html).toContain("Session 2 in Hive");
    expect(html).not.toContain("Session in Other Project");
    expect(html).toContain("Open another project folder");
  });

  it("renders empty sessions message when activeProject has no sessions yet", () => {
    const project = {
      id: "proj_empty",
      name: "Empty Project",
      path: "C:/work/empty",
      color: "#00aaee",
    } as any;

    setStoreState({
      activeProject: project,
      allSessions: [],
      bootstrap: null,
    });

    const html = renderToStaticMarkup(React.createElement(WelcomeView));
    expect(html).toContain("Empty Project");
    expect(html).toContain("Start a New Session");
    expect(html).toContain("No previous sessions in this project yet");
  });
});
