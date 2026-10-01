import type { components } from "./api-schema";

type Schema = components["schemas"];
export type ComputeAccount = Schema["ComputeAccount"];
export type ComputeCatalog = Schema["ComputeCatalog"];
export type ComputeModel = Schema["ModelInfo"];
export type AssistantReply = Schema["AssistantReply"];
export type StrategyDraft = Schema["StrategyDraft"];
export type ComputeKey = Schema["KeyInfo"];
export type CreatedKey = Schema["CreatedKey"];
export type UsageRecord = Schema["UsageRecord"];
export type Mode = "chat" | "market" | "strategy";
export type MarketId = Schema["AssistantRequest"]["market"];
export type ConversationMessage = { role: "user" | "assistant"; content: string; reply?: AssistantReply };

export class ComputeError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function computeApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(path === "/chat" ? 100_000 : 20_000);
  let response: Response;
  try {
    response = await fetch(`/api/v1/compute${path}`, {
      ...init, credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ComputeError("The connection was interrupted. Check Usage before sending again.", 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new ComputeError(typeof body?.detail === "string" ? body.detail : "This request could not be completed. Please try again.", response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const usageCost = (value: string | null | undefined) => value == null ? "Pending" : `$${Number(value).toFixed(6)}`;

export function readStrategyDraft(value: unknown): StrategyDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<StrategyDraft>;
  if (!(["trend", "generation_spread"] as unknown[]).includes(draft.kind) || !(["call", "put"] as unknown[]).includes(draft.side) || !([7, 14, 30] as unknown[]).includes(draft.days)) return null;
  if (!Number.isFinite(Number(draft.units)) || Number(draft.units) < 1 || Number(draft.units) > 100) return null;
  if (!Number.isFinite(Number(draft.premium_per_unit)) || Number(draft.premium_per_unit) < .1 || Number(draft.premium_per_unit) > 9.9) return null;
  if (![draft.scenario_move_pct, draft.h100_move_pct].every(n => typeof n === "number" && Number.isFinite(n) && n >= -15 && n <= 15)) return null;
  if (typeof draft.thesis !== "string" || !draft.thesis.length || draft.thesis.length > 600 || !Array.isArray(draft.assumptions) || !draft.assumptions.length || draft.assumptions.length > 5 || draft.assumptions.some(s => typeof s !== "string" || s.length > 300)) return null;
  return draft as StrategyDraft;
}
