/**
 * Filesystem locations used by the main process.
 *
 * Packaged builds ship `resources/**` inside app.asar but mark it `asarUnpack`. Pi runs as a separate
 * Node process that cannot read inside an asar archive, so every path handed to Pi MUST point at the
 * `app.asar.unpacked` copy. Using the asar path here was why sessions failed to start in installed builds.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

/** Pure path rewrite: `.../app.asar/x` -> `.../app.asar.unpacked/x` (either separator). */
export function toUnpackedPath(p: string): string {
  return p.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked");
}

/** Map a path inside app.asar to its unpacked twin when that twin exists (no-op in dev). */
export function unpacked(p: string): string {
  const swapped = toUnpackedPath(p);
  return swapped !== p && existsSync(swapped) ? swapped : p;
}

/** Absolute path of a file under apps/desktop/resources. Works in dev (out/main) and packaged builds. */
export function resourcePath(...segments: string[]): string {
  return unpacked(resolve(here, "../../resources", ...segments));
}

/** Pi's agent dir (~/.pi/agent, overridable like Pi itself via PI_CODING_AGENT_DIR). */
export function piAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}
