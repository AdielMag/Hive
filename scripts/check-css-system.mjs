#!/usr/bin/env node
// Design-system lint (see DESIGN.md). Keeps type, radius and label styles on the shared scale:
// - font sizes come from the --fs-* tokens (CSS) or the same px steps (inline TSX styles);
// - single-value border radii use the --radius-* tokens (0, 50%, 999px and multi-value radii are fine);
// - no uppercase labels (sentence case everywhere).
import fs from "node:fs";
import { execSync } from "node:child_process";

const ls = (glob) => execSync(`git ls-files ${glob}`, { encoding: "utf8" }).split("\n").filter(Boolean);
const css = ls('"apps/**/*.css" "modules/**/*.css"').filter((f) => !f.endsWith("styles/theme.css"));
const tsx = ls('"apps/desktop/src/renderer/**/*.tsx" "modules/**/*.tsx"');
const SCALE = new Set([11, 12, 13, 14, 16, 20, 24]);

const cssRules = [
  [/font-size:\s*[0-9.]+px/, "font-size in px (use var(--fs-*))", (line) => !/var\([^)]*[0-9.]+px/.test(line)],
  [/\bfont:\s*[^;]*\b[0-9.]+px/, "font shorthand with px size (use var(--fs-*))"],
  [/border-radius:\s*([0-9.]+)px\s*(;|!|$)/, "border-radius in px (use var(--radius-*))", (line) => !/border-radius:\s*(0|999|1|2)px/.test(line)],
  [/text-transform:\s*uppercase/, "uppercase label (use sentence case)"],
];

let bad = 0;
const report = (f, i, msg) => {
  bad++;
  console.log(`${f}:${i + 1}: ${msg}`);
};
for (const f of css) {
  fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
    for (const [re, msg, extra] of cssRules) if (re.test(line) && (!extra || extra(line))) report(f, i, msg);
  });
}
for (const f of tsx) {
  fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/fontSize:\s*([0-9.]+)(?=[\s,}])/g)) {
      if (!SCALE.has(Number(m[1]))) report(f, i, `fontSize ${m[1]} is off the type scale (${[...SCALE].join("/")})`);
    }
    if (/textTransform:\s*"uppercase"/.test(line)) report(f, i, "uppercase label (use sentence case)");
  });
}
if (bad) {
  console.log(`\n${bad} design-system violation(s)`);
  process.exit(1);
}
console.log("css system: ok");
