import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { shell } from "electron";
import { pathToFileURL } from "node:url";

export interface AuthAccountInfo {
  providerId: string;
  name: string;
  type: "oauth" | "api_key" | "none";
  connected: boolean;
  email?: string;
  expires?: string;
  /** Epoch ms of the access-token expiry, for OAuth entries. */
  expiresAt?: number;
  /** OAuth token expired long ago: it may need a manual Refresh / Reconnect. Only a hint. */
  needsAttention?: boolean;
}

/** An access token is normally refreshed automatically; one this stale suggests the refresh isn't happening. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export class AuthService {
  private authPath: string;

  constructor(private readonly packageRoot: string) {
    this.authPath = join(homedir(), ".pi", "agent", "auth.json");
  }

  getAuthPath(): string {
    return this.authPath;
  }

  getAccounts(): AuthAccountInfo[] {
    let authData: Record<string, any> = {};
    if (existsSync(this.authPath)) {
      try {
        authData = JSON.parse(readFileSync(this.authPath, "utf8"));
      } catch (err) {
        console.error("Failed to parse auth.json", err);
      }
    }

    const providers = [
      { id: "antigravity", name: "Google Antigravity" },
      { id: "anthropic", name: "Anthropic (Claude)" },
      { id: "openai", name: "OpenAI" },
    ];

    return providers.map((p) => {
      const entry = authData[p.id];
      if (entry && (entry.access || entry.key || entry.refresh)) {
        return {
          providerId: p.id,
          name: p.name,
          type: entry.type === "api_key" ? "api_key" : "oauth",
          connected: true,
          email: entry.email || (entry.type === "oauth" ? "Connected via OAuth" : "API Key Stored"),
          expires: entry.expires ? new Date(entry.expires).toLocaleDateString() : undefined,
          ...(entry.type !== "api_key" && typeof entry.expires === "number"
            ? { expiresAt: entry.expires, needsAttention: entry.expires < Date.now() - STALE_AFTER_MS }
            : {}),
        };
      }
      return {
        providerId: p.id,
        name: p.name,
        type: "none",
        connected: false,
      };
    });
  }

  saveApiKey(providerId: string, apiKey: string): void {
    let authData: Record<string, any> = {};
    if (existsSync(this.authPath)) {
      try {
        authData = JSON.parse(readFileSync(this.authPath, "utf8"));
      } catch {}
    }

    authData[providerId] = {
      type: "api_key",
      key: apiKey.trim(),
    };

    writeFileSync(this.authPath, JSON.stringify(authData, null, 2), "utf8");
  }

  logout(providerId: string): void {
    if (!existsSync(this.authPath)) return;
    try {
      const authData = JSON.parse(readFileSync(this.authPath, "utf8"));
      delete authData[providerId];
      writeFileSync(this.authPath, JSON.stringify(authData, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to logout provider", err);
    }
  }

  /** Loads the installed Pi SDK and returns its model runtime (which owns credential refresh/login). */
  private async loadModelRuntime(cwd: string): Promise<any> {
    const bundlePath = join(this.packageRoot, "dist", "bundle", "index.js");
    const unbundledPath = join(this.packageRoot, "dist", "index.js");
    const entryPath = existsSync(bundlePath) ? bundlePath : unbundledPath;
    const sdk = (await import(pathToFileURL(entryPath).href)) as any;
    const services = await sdk.createAgentSessionServices({ cwd });
    return services.modelRuntime;
  }

  private readAuth(): Record<string, any> {
    try {
      return existsSync(this.authPath) ? JSON.parse(readFileSync(this.authPath, "utf8")) : {};
    } catch {
      return {};
    }
  }

  /**
   * Silently refreshes a provider's OAuth token using its stored refresh token (no browser). Resolving the
   * provider's auth makes Pi refresh an expired access token and persist the new one to auth.json.
   */
  async refreshOAuth(providerId: string, cwd = process.cwd()): Promise<{ success: boolean; error?: string }> {
    const entry = this.readAuth()[providerId];
    if (!entry || entry.type === "api_key" || !(entry.refresh || entry.access)) {
      return { success: false, error: "Not signed in with OAuth — use Reconnect." };
    }
    try {
      const rt = await this.loadModelRuntime(cwd);
      if (!rt || typeof rt.getAuth !== "function") throw new Error("Pi ModelRuntime.getAuth is not available in installed Pi SDK");
      const resolved = await rt.getAuth(providerId);
      if (!resolved) return { success: false, error: "Token could not be refreshed — please reconnect." };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async loginOAuth(providerId: string, cwd = process.cwd()): Promise<{ success: boolean; error?: string }> {
    try {
      const rt = await this.loadModelRuntime(cwd);

      if (!rt || typeof rt.login !== "function") {
        throw new Error("Pi ModelRuntime.login is not available in installed Pi SDK");
      }

      // Interaction handler
      const interaction = {
        notify: (event: any) => {
          if (event.type === "auth_url" && event.url) {
            shell.openExternal(event.url);
          }
        },
        prompt: async (prompt: any) => {
          if (prompt.type === "auth_url" && prompt.url) {
            shell.openExternal(prompt.url);
          }
          return "";
        },
      };

      await rt.login(providerId, "oauth", interaction);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
