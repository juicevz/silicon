import type { Quote } from "./api";

// This is the displayed scenario only. Execution always uses the current API
// quote and the contract's checks; moving a slider never authorizes a trade.
const floorMicro = (value: number) =>
  Math.floor((value + Number.EPSILON) * 1e6) / 1e6;
const amount = (value: number) => value.toFixed(6);

export function withScenario(
  quote: Quote,
  side: "call" | "put",
  move: number,
): Quote {
  const units =
    Number(quote.units_raw ?? Number(quote.max_payout) * 100000) / 1e6;
  const payout = floorMicro(
    units * Math.min(10, Math.max(0, move * (side === "call" ? 1 : -1))),
  );
  return {
    ...quote,
    payout: amount(payout),
    profit: amount(payout - Number(quote.cost)),
  };
}

export function previewPosition(
  premium: number,
  move: number,
  side: "call" | "put",
  price: number | null | undefined,
  feeBps: number,
): Quote {
  const fee = floorMicro((premium * feeBps) / 10000);
  const cost = premium + fee;
  const units = premium / 2;
  const breakeven = (cost / units) * (side === "call" ? 1 : -1);
  return withScenario(
    {
      indicative: true,
      premium: amount(premium),
      fee: amount(fee),
      cost: amount(cost),
      max_loss: amount(cost),
      max_payout: amount(units * 10),
      payout: "0",
      profit: "0",
      breakeven: price == null ? null : amount(price * (1 + breakeven / 100)),
      breakeven_pct: amount(breakeven),
      reference_price: price == null ? null : amount(price),
      collateral_required: amount(units * 10),
      fee_bps: feeBps,
      reason:
        "Illustrative payout calculator. Live terms are set by the funded series.",
    },
    side,
    move,
  );
}
