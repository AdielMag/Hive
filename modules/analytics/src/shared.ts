/**
 * Contract between the analytics module's main and renderer halves (`mod:analytics:<method>`).
 */
export const MODULE_ID = "analytics";
export const USAGE_TAB_KIND = "usage";
export const USAGE_TAB_ID = "studio:usage";

export const AnalyticsMethods = {
  get: "get",
  generateInsights: "generateInsights",
} as const;

export interface GenerateInsightsPayload {
  summaryText: string;
  model?: string;
}
