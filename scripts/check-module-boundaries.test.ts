import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { checkBoundaries, specifiersOf } from "./check-module-boundaries.mjs";

let root: string;
const put = (rel: string, content: string) => {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
};
const violations = (): Array<{ file: string; specifier: string }> => checkBoundaries(root);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hive-boundaries-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("specifiersOf", () => {
  it("finds static, type, re-export, dynamic and require specifiers but not commented-out ones", () => {
    const found = specifiersOf(`
      import a from "./a";
      import type { B } from "./b";
      import "./side";
      export * from "./c";
      export { d } from "./d";
      const e = await import("./e");
      const f = require("./f");
      // import x from "./commented";
      /* import y from "./block"; */
    `);
    expect(found.sort()).toEqual(["./a", "./b", "./c", "./d", "./e", "./f", "./side"]);
  });
});

describe("checkBoundaries", () => {
  it("passes a clean tree", () => {
    put("apps/desktop/src/renderer/modules/registry.ts", `import { x } from "../store/y.ts";`);
    put("apps/desktop/src/renderer/modules.generated.ts", `export const L = { a: () => import("@hive-module/a/renderer") };`);
    put("modules/a/src/renderer.tsx", `import { defineRendererModule } from "@hive/module-sdk/renderer"; import "./local.ts";`);
    expect(violations()).toEqual([]);
  });

  it("flags core importing a module package or reaching into modules/ by path", () => {
    put("apps/desktop/src/renderer/App.tsx", `import { Tab } from "@hive-module/a/renderer";`);
    put("apps/desktop/src/main/index.ts", `import x from "../../../../modules/a/src/main.ts";`);
    const v = violations();
    expect(v.map((x) => x.specifier).sort()).toEqual(["../../../../modules/a/src/main.ts", "@hive-module/a/renderer"]);
  });

  it("allows only the generated index files to import module code", () => {
    put("apps/desktop/src/main/modules.generated.ts", `export const L = { a: () => import("@hive-module/a/main") };`);
    expect(violations()).toEqual([]);
  });

  it("does not confuse core's own renderer/modules folder with the top-level modules/ dir", () => {
    put("apps/desktop/src/renderer/App.tsx", `import { r } from "./modules/registry.ts";`);
    expect(violations()).toEqual([]);
  });

  it("flags a module importing another module's internals but allows its shared contract", () => {
    put("modules/a/src/renderer.tsx", `import { s } from "@hive-module/b/shared"; import { t } from "@hive-module/b/renderer"; import { u } from "../../b/src/x.ts";`);
    const v = violations().map((x) => x.specifier).sort();
    expect(v).toEqual(["../../b/src/x.ts", "@hive-module/b/renderer"]);
  });

  it("flags a module reaching into core by relative path", () => {
    put("modules/a/src/main.ts", `import { ctx } from "../../../apps/desktop/src/main/context.ts";`);
    expect(violations()).toHaveLength(1);
  });
});
