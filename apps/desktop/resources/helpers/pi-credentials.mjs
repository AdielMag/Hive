// Runs under the user's Pi Node runtime (NOT Electron). Resolves fresh, auto-refreshed credentials for
// every provider the user has signed in to, using Pi's own auth runtime, and prints them as one JSON line
// prefixed with a sentinel so stray logs from Pi internals can never corrupt the payload.
//
// usage: node pi-credentials.mjs <pi-package-root>
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const SENTINEL = "@@PI_STUDIO_CREDENTIALS@@";
const root = process.argv[2];

async function main() {
  const bundled = join(root, "dist", "bundle", "index.js");
  const entry = existsSync(bundled) ? bundled : join(root, "dist", "index.js");
  const sdk = await import(pathToFileURL(entry).href);
  const services = await sdk.createAgentSessionServices({ cwd: tmpdir() });
  const rt = services.modelRuntime;
  const listed = (await rt.listCredentials()) ?? [];
  const out = [];
  for (const cred of listed) {
    const providerId = cred.providerId;
    try {
      const res = await rt.getAuth(providerId);
      out.push({ providerId, type: cred.type, apiKey: res?.auth?.apiKey ?? null });
    } catch (err) {
      out.push({ providerId, type: cred.type, apiKey: null, error: String(err?.message ?? err) });
    }
  }
  process.stdout.write(`${SENTINEL}${JSON.stringify({ ok: true, credentials: out })}\n`);
}

main()
  .catch((err) => {
    process.stdout.write(`${SENTINEL}${JSON.stringify({ ok: false, error: String(err?.message ?? err) })}\n`);
  })
  .finally(() => process.exit(0));
