#!/usr/bin/env node
// Regenerates docs/screenshots/*.png from the built app (run `npm run build` first).
// Uses the main process capture hooks: HIVE_CAPTURE / _DELAY / _SCRIPT. Account e-mails are blurred.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const desktop = join(root, "apps/desktop");
const out = join(root, "docs/screenshots");
mkdirSync(out, { recursive: true });
const electron = createRequire(join(desktop, "package.json"))("electron");

const REDACT = `(() => { const s = document.createElement("style"); s.textContent = ".quota-card__account,.settings__account .ui-row__hint{filter:blur(5px)}"; document.head.appendChild(s); })();`;

const shots = {
  "workbench.png": "1",
  "limits.png": `window.useUi.getState().showRight("limits")`,
  "usage.png": `window.useSessionStore.getState().openUsageTab()`,
  "appearance.png": `window.useUi.getState().openSettings("appearance")`,
};

const only = process.argv.slice(2);
for (const [file, script] of Object.entries(shots)) {
  if (only.length && !only.includes(file)) continue;
  console.log(`capturing ${file}…`);
  spawnSync(electron, [join(desktop, "out/main/index.js")], {
    cwd: desktop,
    stdio: "ignore",
    timeout: 90_000,
    env: {
      ...process.env,
      HIVE_CAPTURE: join(out, file),
      HIVE_CAPTURE_DELAY: "10000",
      HIVE_CAPTURE_SCRIPT: `${REDACT}; ${script}`,
    },
  });
}
console.log(`done → ${out}`);
