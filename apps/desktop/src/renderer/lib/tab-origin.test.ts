import { describe, expect, it } from "vitest";
import type { ProjectEntry, TabItem } from "@hive/protocol";
import { findOriginProject, findOriginTab } from "./tab-origin.ts";

const tab = (id: string, sessionPath?: string, projectId = "p1"): TabItem => ({ id, sessionPath, projectId, title: id, pinned: false });
const project = (id: string, path: string): ProjectEntry => ({ id, name: id, path, color: "#fff", pinned: false }) as ProjectEntry;

describe("findOriginTab", () => {
  const tabs = [
    tab("a", "C:\\Users\\me\\.pi\\agent\\sessions\\--proj--\\2026_aaaa-1111.jsonl"),
    tab("b", "C:\\Users\\me\\.pi\\agent\\sessions\\--proj--\\2026_bbbb-2222.jsonl"),
    tab("plan", undefined),
  ];

  it("matches the session file regardless of slash style and case", () => {
    expect(findOriginTab(tabs, { sessionFile: "c:/users/me/.pi/agent/sessions/--proj--/2026_bbbb-2222.jsonl" })?.id).toBe("b");
  });

  it("falls back to the session id embedded in the file name", () => {
    expect(findOriginTab(tabs, { sessionFile: "/elsewhere/x.jsonl", sessionId: "AAAA-1111" })?.id).toBe("a");
  });

  it("returns undefined without a usable hint", () => {
    expect(findOriginTab(tabs, undefined)).toBeUndefined();
    expect(findOriginTab(tabs, { sessionId: "zzzz" })).toBeUndefined();
  });
});

describe("findOriginProject", () => {
  const projects = [project("root", "C:\\work"), project("nested", "C:\\work\\app")];

  it("picks the most specific project containing cwd", () => {
    expect(findOriginProject(projects, { cwd: "c:/work/app/src" })?.id).toBe("nested");
    expect(findOriginProject(projects, { cwd: "C:\\work\\other" })?.id).toBe("root");
  });

  it("does not match sibling folders sharing a prefix", () => {
    expect(findOriginProject(projects, { cwd: "C:\\workshop" })).toBeUndefined();
  });
});
