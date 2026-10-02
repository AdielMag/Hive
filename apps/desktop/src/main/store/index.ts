import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  type ProjectDefaults,
  type ProjectEntry,
  type ProjectsFile,
  type SessionMetaEntry,
  type SessionMetaFile,
  type UiStateFile,
  getNextProjectColor,
} from "@hive/protocol";

export class GuiStore {
  private readonly dir: string;
  private readonly projectsPath: string;
  private readonly uiStatePath: string;
  private readonly sessionMetaPath: string;

  private projects: ProjectEntry[] = [];
  private sessionMeta: Record<string, SessionMetaEntry> = {};
  private uiState: UiStateFile = { schemaVersion: 1, tabs: [], activeTabId: null };

  constructor(baseDir: string) {
    this.dir = join(baseDir, "hive");
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
    this.projectsPath = join(this.dir, "projects.json");
    this.uiStatePath = join(this.dir, "ui-state.json");
    this.sessionMetaPath = join(this.dir, "session-meta.json");

    this.loadAll();
  }

  getUiState(): UiStateFile {
    return this.uiState;
  }

  // --- Projects ---

  getProjects(): ProjectEntry[] {
    return [...this.projects];
  }

  getProject(id: string): ProjectEntry | undefined {
    return this.projects.find((p) => p.id === id);
  }

  getProjectByPath(dirPath: string): ProjectEntry | undefined {
    const normalized = normalizePath(dirPath);
    // Find longest prefix match
    let bestMatch: ProjectEntry | undefined;
    for (const p of this.projects) {
      const pNorm = normalizePath(p.path);
      if (normalized === pNorm || normalized.startsWith(pNorm + "/")) {
        if (!bestMatch || normalizePath(bestMatch.path).length < pNorm.length) {
          bestMatch = p;
        }
      }
    }
    return bestMatch;
  }

  addProject(dirPath: string, name?: string, color?: string): ProjectEntry {
    const canonical = normalizePath(dirPath);
    const existing = this.projects.find((p) => normalizePath(p.path) === canonical);
    if (existing) return existing;

    const id = `prj_${randomBytes(6).toString("hex")}`;
    const derivedName = name || canonical.split("/").pop() || "project";
    const assignedColor = color || getNextProjectColor(this.projects.length);
    const now = new Date().toISOString();

    const entry: ProjectEntry = {
      id,
      name: derivedName,
      path: canonical,
      color: assignedColor,
      pinned: false,
      hidden: false,
      links: [],
      defaults: {},
      createdAt: now,
      updatedAt: now,
    };

    this.projects.push(entry);
    this.saveProjects();
    return entry;
  }

  updateProject(
    id: string,
    updates: {
      name?: string;
      color?: string;
      links?: ProjectEntry["links"];
      defaults?: ProjectDefaults;
      pinned?: boolean;
      hidden?: boolean;
    },
  ): ProjectEntry {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Project ${id} not found`);

    const curr = this.projects[index]!;
    const updated: ProjectEntry = {
      ...curr,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.projects[index] = updated;
    this.saveProjects();
    return updated;
  }

  removeProject(id: string): boolean {
    const initialLen = this.projects.length;
    this.projects = this.projects.filter((p) => p.id !== id);
    if (this.projects.length !== initialLen) {
      this.saveProjects();
      return true;
    }
    return false;
  }

  // --- Session Meta ---

  getSessionMeta(sessionPath: string): SessionMetaEntry {
    return this.sessionMeta[sessionPath] ?? {};
  }

  updateSessionMeta(sessionPath: string, updates: Partial<SessionMetaEntry>): SessionMetaEntry {
    const curr = this.sessionMeta[sessionPath] ?? {};
    const updated: SessionMetaEntry = { ...curr, ...updates };
    for (const k of Object.keys(updated) as Array<keyof SessionMetaEntry>) {
      if (updated[k] === undefined) delete updated[k];
    }
    this.sessionMeta[sessionPath] = updated;
    this.saveSessionMeta();
    return updated;
  }

  removeSessionMeta(sessionPath: string): void {
    if (!(sessionPath in this.sessionMeta)) return;
    delete this.sessionMeta[sessionPath];
    this.saveSessionMeta();
  }

  // --- Internal Load & Save (Atomic) ---

  private loadAll(): void {
    // 1. Projects
    const projectsData = this.readFileSafely<ProjectsFile>(this.projectsPath);
    if (projectsData && projectsData.schemaVersion === 1 && Array.isArray(projectsData.projects)) {
      this.projects = projectsData.projects;
    }

    // 2. Session Meta
    const metaData = this.readFileSafely<SessionMetaFile>(this.sessionMetaPath);
    if (metaData && metaData.schemaVersion === 1 && metaData.sessions) {
      this.sessionMeta = metaData.sessions;
    }

    // 3. UI State
    const uiData = this.readFileSafely<UiStateFile>(this.uiStatePath);
    if (uiData && uiData.schemaVersion === 1) {
      this.uiState = uiData;
    }
  }

  private saveProjects(): void {
    const file: ProjectsFile = {
      schemaVersion: 1,
      projects: this.projects,
    };
    this.writeFileAtomically(this.projectsPath, JSON.stringify(file, null, 2));
  }

  private saveSessionMeta(): void {
    const file: SessionMetaFile = {
      schemaVersion: 1,
      sessions: this.sessionMeta,
    };
    this.writeFileAtomically(this.sessionMetaPath, JSON.stringify(file, null, 2));
  }

  private readFileSafely<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      // If primary is corrupted, try .bak
      const bakPath = `${path}.bak`;
      if (existsSync(bakPath)) {
        try {
          return JSON.parse(readFileSync(bakPath, "utf8")) as T;
        } catch {
          // both corrupted
        }
      }
      return null;
    }
  }

  private writeFileAtomically(filePath: string, content: string): void {
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    const bakPath = `${filePath}.bak`;

    try {
      writeFileSync(tmpPath, content, "utf8");
      if (existsSync(filePath)) {
        try {
          renameSync(filePath, bakPath);
        } catch {
          // ignore backup rename error
        }
      }
      renameSync(tmpPath, filePath);
    } catch (e) {
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {
          // cleanup
        }
      }
      throw e;
    }
  }
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}
