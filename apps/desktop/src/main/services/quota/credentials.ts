/** Resolves fresh provider credentials by running a helper under the user's Pi Node runtime. */
import { execFile } from "node:child_process";
import type { PiInstallInfo } from "@pi-studio/protocol";
import { resourcePath } from "../../paths.ts";

export interface ProviderCredential {
  providerId: string;
  type: string;
  apiKey: string | null;
  error?: string;
}

const SENTINEL = "@@PI_STUDIO_CREDENTIALS@@";

export function parseCredentialsOutput(stdout: string): ProviderCredential[] {
  const line = stdout.split(/\r?\n/).find((l) => l.startsWith(SENTINEL));
  if (!line) throw new Error("Credential helper produced no result");
  const payload = JSON.parse(line.slice(SENTINEL.length)) as { ok: boolean; error?: string; credentials?: ProviderCredential[] };
  if (!payload.ok) throw new Error(payload.error || "Credential helper failed");
  return payload.credentials ?? [];
}

export function resolveCredentials(pi: PiInstallInfo): Promise<ProviderCredential[]> {
  const helper = resourcePath("helpers", "pi-credentials.mjs");
  return new Promise((resolvePromise, reject) => {
    execFile(
      pi.nodePath,
      [helper, pi.packageRoot],
      { timeout: 30_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } },
      (err, stdout) => {
        try {
          resolvePromise(parseCredentialsOutput(String(stdout)));
        } catch (parseErr) {
          reject(err ?? parseErr);
        }
      },
    );
  });
}
