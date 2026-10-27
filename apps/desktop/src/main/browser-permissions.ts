import { session } from "electron";

export const BROWSER_PARTITION = "persist:hive-browser";
const ALLOWED = new Set(["clipboard-sanitized-write", "fullscreen"]);
let installed = false;

/** Deny camera/mic/geolocation/notifications/etc. for the browser module's webviews by default. */
export function installBrowserPermissionGuards(): void {
  if (installed) return;
  installed = true;
  const ses = session.fromPartition(BROWSER_PARTITION);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));
}
