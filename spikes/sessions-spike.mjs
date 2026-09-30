import { pathToFileURL } from "node:url";
// Load the SDK from the user's installed Pi (same version as the CLI) instead of bundling our own copy.
const PI_PKG = "C:/Users/Adiel/AppData/Local/pi-node/current/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
const t0 = Date.now();
const sdk = await import(pathToFileURL(PI_PKG).href);
const tImport = Date.now() - t0;
const t1 = Date.now();
const all = await sdk.SessionManager.listAll();
const tList = Date.now() - t1;
const byCwd = new Map();
for (const s of all) byCwd.set(s.cwd, (byCwd.get(s.cwd) || 0) + 1);
console.log("sdk import ms:", tImport, "| listAll ms:", tList, "| sessions:", all.length, "| distinct cwds:", byCwd.size);
console.log("per cwd:", JSON.stringify([...byCwd.entries()].slice(0, 12)));
const s = all.sort((a, b) => b.modified - a.modified)[0];
console.log("newest:", JSON.stringify({ id: s.id, cwd: s.cwd, name: s.name, messageCount: s.messageCount, first: (s.firstMessage || "").slice(0, 60), parent: s.parentSessionPath ?? null }));
// Parse one session file with Pi's own parser + context builder and estimate tokens per category
const { readFileSync } = await import("node:fs");
const entries = sdk.parseSessionEntries(readFileSync(s.path, "utf8"));
console.log("entry types:", JSON.stringify(entries.reduce((a, e) => ((a[e.type] = (a[e.type] || 0) + 1), a), {})));
const sysMsgs = entries.filter((e) => e.type === "message" && e.message.role === "system");
if (sysMsgs[0]) console.log("system message sections:", Object.keys(sysMsgs[0].message.sections || {}).join(", "), "| toolsAdded:", (sysMsgs[0].message.toolsAdded || []).length);
const cats = {};
for (const e of entries) if (e.type === "message") { const k = e.message.role + (e.message.role === "toolResult" ? ":" + e.message.toolName : ""); cats[k] = (cats[k] || 0) + sdk.estimateTokens(e.message); }
console.log("estimated tokens by role/tool (chars/4):", JSON.stringify(cats));
