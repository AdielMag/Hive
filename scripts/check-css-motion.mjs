#!/usr/bin/env node
// Motion lint (emil-design-eng): see DESIGN.md. Fails on transition:all, ease-in, scale(0), raw cubic-bezier outside theme.css.
import fs from "node:fs";
import { execSync } from "node:child_process";

const files = execSync('git ls-files "apps/**/*.css" "modules/**/*.css"', { encoding: "utf8" }).split("\n").filter(Boolean);
const rules = [
  [/transition\s*:\s*all\b/, "transition: all (list exact properties)"],
  [/(?<![-\w])ease-in(?![-\w])/, "ease-in (use var(--ease-out))"],
  [/scale\(\s*0\s*\)/, "scale(0) (start from 0.95 + opacity)"],
  [/cubic-bezier\(/, "raw cubic-bezier (use --ease-out / --ease-in-out / --ease-drawer)"],
];
let bad = 0;
for (const f of files) {
  if (f.endsWith("styles/theme.css")) continue;
  fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
    for (const [re, msg] of rules) if (re.test(line)) { bad++; console.log(`${f}:${i + 1}: ${msg}`); }
  });
}
if (bad) { console.log(`\n${bad} motion violation(s)`); process.exit(1); }
console.log("css motion: ok");
