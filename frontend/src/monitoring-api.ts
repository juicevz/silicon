import { api } from "./api";
import type { components } from "./api-schema";

export type Movers = components["schemas"]["Movers"];
export type AlertInbox = components["schemas"]["AlertInbox"];
export type AlertRequest = components["schemas"]["AlertRequest"];
export const monitoring = {
  movers: () => api<Movers>("/movers"),
  inbox: () => api<AlertInbox>("/alerts"),
  create: (body: AlertRequest) => api("/alerts", { method: "POST", body: JSON.stringify(body) }),
  remove: (id: string) => api(`/alerts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  read: () => api("/alerts/read", { method: "POST" }),
  push: (body: PushSubscriptionJSON) => api("/alerts/push", { method: "POST", body: JSON.stringify(body) }),
  stopPush: () => api("/alerts/push/subscription", { method: "DELETE" }),
};
