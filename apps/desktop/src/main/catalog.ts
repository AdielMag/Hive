import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { shell } from "electron";
import type { SessionCatalogItem } from "@pi-studio/protocol";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { GuiStore } from "./store/index.ts";

export interface PiSdkModule {
  SessionManager: {
    listAll(sessionDir?: string): Promise<any[]>;
  };
  parseSessionEntries(text: string): SessionEntry[];
  hasTrustRequiringProjectResources?(cwd: string): boolean;
  ProjectTrustStore?: new () => {
    get(cwd: string): boolean | undefined;
    set(cwd: string, decision: boolean): void;
  };
}

export class SessionCatalogService {
  private sdk: PiSdkModule | null = null;
  private trustStore: any = null;

  constructor(
    private readonly packageRoot: string,
    private readonly store: GuiStore,
  ) {}

  async getSdk(): Promise<PiSdkModule> {
    if (this.sdk) return this.sdk;
    // Load bundled Pi SDK index from installed Pi
    const bundlePath = join(this.packageRoot, "dist", "bundle", "index.js");
    const unbundledPath = join(this.packageRoot, "dist", "index.js");
    const entryPath = existsSync(bundlePath) ? bundlePath : unbundledPath;

    const mod = (await import(pathToFileURL(entryPath).href)) as PiSdkModule;
    this.sdk = mod;
    if (mod.ProjectTrustStore) {
      this.trustStore = new mod.ProjectTrustStore();
    }
    return mod;
  }

  async listAll(): Promise<SessionCatalogItem[]> {
    const sdk = await this.getSdk();
    const rawSessions = await sdk.SessionManager.listAll();

    return rawSessions.map((s) => {
      const project = this.store.getProjectByPath(s.cwd);
      return {
        path: s.path,
        id: s.id,
        cwd: s.cwd,
        name: s.name,
        parentSessionPath: s.parentSessionPath,
        created: s.created ? new Date(s.created).toISOString() : new Date().toISOString(),
        modified: s.modified ? new Date(s.modified).toISOString() : new Date().toISOString(),
        messageCount: s.messageCount ?? 0,
        firstMessage: s.firstMessage ?? "",
        projectId: project?.id,
      };
    });
  }

  async readSessionFile(sessionPath: string): Promise<{ entries: SessionEntry[]; leafId: string | null }> {
    const sdk = await this.getSdk();
    if (!existsSync(sessionPath)) {
      throw new Error(`Session file not found: ${sessionPath}`);
    }
    const content = readFileSync(sessionPath, "utf8");
    const entries = sdk.parseSessionEntries(content);
    // Find active leaf (last entry with matching parentId chain or last message entry)
    const last = entries[entries.length - 1];
    return {
      entries,
      leafId: last ? last.id : null,
    };
  }

  async deleteSession(sessionPath: string): Promise<boolean> {
    if (!existsSync(sessionPath)) return false;
    try {
      await shell.trashItem(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  async checkTrust(dirPath: string): Promise<{ hasTrustResources: boolean; trusted: boolean }> {
    const sdk = await this.getSdk();
    let hasResources = false;
    if (typeof sdk.hasTrustRequiringProjectResources === "function") {
      hasResources = sdk.hasTrustRequiringProjectResources(dirPath);
    }
    let trusted = false;
    if (this.trustStore && typeof this.trustStore.get === "function") {
      const decision = this.trustStore.get(dirPath);
      trusted = decision === true;
    }
    return { hasTrustResources: hasResources, trusted };
  }

  async setTrust(dirPath: string, trusted: boolean): Promise<void> {
    await this.getSdk();
    if (this.trustStore && typeof this.trustStore.set === "function") {
      this.trustStore.set(dirPath, trusted);
    }
  }
}
