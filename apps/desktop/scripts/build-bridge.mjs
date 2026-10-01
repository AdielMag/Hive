/**
 * Bundle the Pi bridge extension into a single self-contained file for packaged builds.
 *
 * Pi loads the bridge as a separate Node process from `app.asar.unpacked`, where there is no
 * node_modules: workspace packages like `@pi-studio/protocol` cannot be resolved there, which made
 * every packaged session crash on start ("Cannot find module '@pi-studio/protocol'"). So we inline
 * everything except `@earendil-works/pi-coding-agent`, which Pi provides to extensions itself.
 */
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Modules the bundle may leave as imports: Node built-ins and Pi itself. */
export const BRIDGE_EXTERNALS = ["@earendil-works/pi-coding-agent"];

export async function bundleBridge(outfile = resolve(appRoot, "out/bridge/studio-bridge.js")) {
  await build({
    entryPoints: [resolve(appRoot, "resources/bridge/studio-bridge.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: BRIDGE_EXTERNALS,
    logLevel: "warning",
  });
  return outfile;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`bridge bundled -> ${await bundleBridge()}`);
}
