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
}

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

  async loginOAuth(providerId: string, cwd = process.cwd()): Promise<{ success: boolean; error?: string }> {
    try {
      // Import Pi SDK from installed Pi bundle
      const bundlePath = join(this.packageRoot, "dist", "bundle", "index.js");
      const unbundledPath = join(this.packageRoot, "dist", "index.js");
      const entryPath = existsSync(bundlePath) ? bundlePath : unbundledPath;

      const sdk = (await import(pathToFileURL(entryPath).href)) as any;
      const services = await sdk.createAgentSessionServices({ cwd });
      const rt = services.modelRuntime;

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
