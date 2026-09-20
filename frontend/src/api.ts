import type { components } from "./api-schema";
export type Market = components["schemas"]["Market"];
export type Snapshot = components["schemas"]["Snapshot"];
export type Config = components["schemas"]["PublicConfig"];
export type Access = components["schemas"]["Access"];
export type Quote = components["schemas"]["Quote"];
export type Protocol = Required<components["schemas"]["Protocol"]>;
export type Point = components["schemas"]["Point"];
export type Portfolio = Required<components["schemas"]["Portfolio"]>;
export type Series = components["schemas"]["Series"];
export type Leaderboard = Required<components["schemas"]["Leaderboard"]>;

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof error.detail === "string"
        ? error.detail
        : "The request could not be completed.",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export const money = (value: number | string | null | undefined, digits = 2) =>
  value == null
    ? "—"
    : Number(value).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
export const short = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
export function explorer(config: Config, kind: "address" | "tx", value: string): string {
  const url = new URL(`${config.explorer_url}/${kind}/${encodeURIComponent(value)}`);
  return url.toString();
}
export const timeAgo = (value?: string | null) => {
  if (!value) return "awaiting source";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 1
    ? "just now"
    : minutes < 60
      ? `${minutes}m ago`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
};
