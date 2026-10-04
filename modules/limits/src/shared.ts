/**
 * Contract between the limits module's main and renderer halves (`mod:limits:<method>`).
 */
export const MODULE_ID = "limits";

export const LimitsMethods = {
  get: "get",
} as const;

/** Pi extension statuses that duplicate the built-in meters (hidden while this module is active). */
export const HIDDEN_EXTENSION_STATUSES = ["agy-sub", "quota", "pi-quota-status"];
