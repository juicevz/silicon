import { api } from "./api";
import type { components } from "./api-schema";

export type HolderAccount = components["schemas"]["HolderAccount"];
export type SavedWorkspace = components["schemas"]["SavedWorkspace"];
export type WorkspaceState = Required<components["schemas"]["WorkspaceState"]>;
export type AdvancedInbox = components["schemas"]["AdvancedInbox"];
export type AdvancedRequest = components["schemas"]["AdvancedAlertRequest"];
export type AlertCondition = components["schemas"]["AlertCondition"];
export function holderApi<T>(address: string, path: string, init?: RequestInit): Promise<T> {
  return api<T>(`/holders${path}`, { ...init, headers: { ...init?.headers, "X-Silicon-Wallet": address } });
}
