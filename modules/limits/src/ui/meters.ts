/**
 * Status-bar meter selection. Most providers collapse into one meter (worst window per kind), but Antigravity
 * exposes independent quota pools — "Gemini" and "Claude and GPT" (3P) — so it gets one meter per pool, and
 * the pool matching the active model is flagged so the UI can emphasise it.
 */
import type { ProviderQuota, QuotaGroup, QuotaWindow } from "@hive/protocol";

export interface ActiveModelLite {
  provider?: string;
  id?: string;
}

export interface QuotaMeter {
  key: string;
  providerId: string;
  /** Suffix distinguishing quota pools of one provider (e.g. "Gemini", "Claude·GPT"). */
  pool?: string;
  w5?: QuotaWindow;
  wk?: QuotaWindow;
  /** True when this pool serves the active session model; undefined when it can't be determined. */
  active?: boolean;
}

const THIRD_PARTY_MODEL = /claude|gpt|sonnet|opus|haiku|codex|oss|3p/i;
const THIRD_PARTY_GROUP = /claude|gpt|3p/i;

export const isThirdPartyModel = (id: string | undefined): boolean => THIRD_PARTY_MODEL.test(id ?? "");
export const isThirdPartyGroup = (g: Pick<QuotaGroup, "id" | "label">): boolean => THIRD_PARTY_GROUP.test(`${g.id} ${g.label}`);

/** Does the active model run on this provider's subscription? (Pi names the provider "antigravity" / "google-antigravity".) */
export function modelUsesProvider(model: ActiveModelLite | null | undefined, providerId: string): boolean {
  const p = (model?.provider ?? "").toLowerCase();
  return !!p && (p === providerId || p.includes(providerId));
}

const worst = (windows: QuotaWindow[], kind: QuotaWindow["kind"]): QuotaWindow | undefined =>
  windows.filter((w) => w.kind === kind).sort((a, b) => b.usedPercent - a.usedPercent)[0];

const meterOf = (key: string, providerId: string, groups: QuotaGroup[], extra: Partial<QuotaMeter> = {}): QuotaMeter => {
  const windows = groups.flatMap((g) => g.windows);
  return { key, providerId, w5: worst(windows, "5h"), wk: worst(windows, "weekly"), ...extra };
};

export function buildMeters(providers: ProviderQuota[], model?: ActiveModelLite | null): QuotaMeter[] {
  const out: QuotaMeter[] = [];
  for (const p of providers) {
    if (p.status !== "ok") continue;
    const tp = p.groups.filter(isThirdPartyGroup);
    const own = p.groups.filter((g) => !isThirdPartyGroup(g));
    if (p.providerId !== "antigravity" || !tp.length || !own.length) {
      out.push(meterOf(p.providerId, p.providerId, p.groups));
      continue;
    }
    const onProvider = modelUsesProvider(model, p.providerId);
    const modelIs3p = isThirdPartyModel(model?.id);
    out.push(meterOf(`${p.providerId}:gemini`, p.providerId, own, { pool: "Gemini", active: onProvider ? !modelIs3p : undefined }));
    out.push(meterOf(`${p.providerId}:3p`, p.providerId, tp, { pool: "Claude·GPT", active: onProvider ? modelIs3p : undefined }));
  }
  return out;
}
