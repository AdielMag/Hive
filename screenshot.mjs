import { _electron as electron } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const appPath = resolve(__dirname, "apps/desktop/out/main/index.js");

const app = await electron.launch({
  args: [appPath],
  env: {
    ...process.env,
    PI_STUDIO_TEST_MODE: "1",
  },
});

const window = await app.firstWindow();
await window.waitForTimeout(2000);
await window.screenshot({ path: resolve(__dirname, "current-ui.png") });
console.log("Screenshot saved to current-ui.png");

await app.close();
