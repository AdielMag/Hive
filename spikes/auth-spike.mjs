import { pathToFileURL } from "node:url";
const PI = "C:/Users/Adiel/AppData/Local/pi-node/current/node_modules/@earendil-works/pi-coding-agent/dist/bundle/index.js";
const t0 = Date.now();
const sdk = await import(pathToFileURL(PI).href);
// Build Pi services for a cwd: loads settings, packages, and extensions (so extension providers register).
const services = await sdk.createAgentSessionServices({ cwd: process.cwd() });
console.log("services ms:", Date.now() - t0, "| diagnostics:", services.diagnostics.length);
const rt = services.modelRuntime;
const providers = rt.getProviders();
console.log("providers total:", providers.length);
for (const id of ["anthropic", "antigravity", "openai-codex", "github-copilot"]) {
  const p = rt.getProvider(id);
  if (!p) { console.log(id, "-> not registered"); continue; }
  console.log(id, "-> auth kinds:", JSON.stringify(Object.keys(p.auth ?? {})), "| status:", JSON.stringify(rt.getProviderAuthStatus(id)), "| oauth:", rt.isUsingOAuth(id), "| subscription:", rt.isUsingSubscription(id));
}
const creds = await rt.listCredentials();
console.log("stored credentials (no secrets):", JSON.stringify(creds.map((c) => ({ provider: c.providerId ?? c.provider, type: c.type }))));
console.log("login fn present:", typeof rt.login);
