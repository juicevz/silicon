import { useEffect, useState } from "react";
import { ArrowUpRight, Check, FileCode2, Loader2, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { api, money, short, explorer, type Portfolio, type Series } from "../api";
import { useData, useConfig } from "../data";
import { useWallet } from "../wallet";
import { External, Modal } from "./ui";

export function usePortfolio() {
  const wallet = useWallet();
  const { protocol } = useData();
  const [result, setResult] = useState<{ wallet: string; value: Portfolio } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (!wallet.address) return;
    const controller = new AbortController();
    void api<Portfolio>(`/portfolio/${wallet.address}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setResult({ wallet: wallet.address!, value });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [wallet.address, protocol?.checked_at]);
  return { portfolio: result?.wallet === wallet.address ? result.value : null, error };
}

export function PositionRows({
  portfolio,
  notify,
}: {
  portfolio: Portfolio;
  notify: (s: string) => void;
}) {
  const { protocol } = useData();
  const config = useConfig();
  const wallet = useWallet();
  const [pending, setPending] = useState<number | null>(null);
  const claim = async (id: number) => {
    if (!wallet.address) return;
    setPending(id);
    try {
      const { seriesAction } = await import("../transactions");
      await seriesAction(
        await wallet.provider(),
        wallet.address,
        config,
        "claim",
        BigInt(id),
        notify,
      );
      notify("Claim confirmed. USDG was sent to the position owner.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="position-rows">
      {portfolio.positions.map((p) => (
        <div className="position-row" key={p.id}>
          <Link to="/terminal/contracts">
            <span className={p.side === "call" ? "green" : "red"}>
              {p.side === "call" ? "↗" : "↘"} H100 {p.side}
            </span>
            <small>
              #{p.id} · {money(p.units, 3)} units
            </small>
          </Link>
          <span className="mono">
            {money(p.cost)}
            <small> USDG cost</small>
          </span>
          {p.claimed ? (
            <span className="muted">
              <Check size={12} /> Claimed
            </span>
          ) : p.claimable != null ? (
            <button
              className="button"
              disabled={pending !== null || !protocol?.verified}
              onClick={() => void claim(p.id)}
            >
              {pending === p.id ? <Loader2 className="spin" size={12} /> : null}
              Claim {money(p.claimable)}
            </button>
          ) : (
            <span className="gold">Open</span>
          )}
          <External href={explorer(config, p.tx ? "tx" : "address", p.tx || config.market_address || "")}>View</External>
        </div>
      ))}
      {!portfolio.index_synced && (
        <p className="inline-index-note">
          Transaction history is still syncing.
        </p>
      )}
    </div>
  );
}

export function LiveContract({
  series,
  notify,
}: {
  series: Series;
  notify: (s: string) => void;
}) {
  const { protocol } = useData();
  const config = useConfig();
  const wallet = useWallet();
  const { portfolio, error } = usePortfolio();
  const [action, setAction] = useState<"fund" | "withdraw" | null>(null),
    [amount, setAmount] = useState("10"),
    [pending, setPending] = useState(false);
  const open = async (next: "fund" | "withdraw") => {
    if (!wallet.address) {
      try {
        await wallet.connect();
      } catch (e) {
        notify((e as Error).message);
      }
      return;
    }
    setAction(next);
    setAmount(next === "withdraw" ? (portfolio?.writer_shares ?? "0") : "10");
  };
  const execute = async () => {
    if (!wallet.address || !action) return;
    if (!/^\d+(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      notify("Enter a positive amount with at most six decimals.");
      return;
    }
    setPending(true);
    try {
      const { seriesAction, parseUnits } = await import("../transactions");
      await seriesAction(
        await wallet.provider(),
        wallet.address,
        config,
        action,
        parseUnits(amount, 6),
        notify,
      );
      notify(
        action === "fund"
          ? "Collateral deposit confirmed."
          : "Withdrawal confirmed.",
      );
      setAction(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <section className="panel live-contract">
        <div className="panel-heading">
          <h2>
            <FileCode2 size={14} />
            H100 rental series
          </h2>
          <span
            className={`mini-label ${series.phase === "open" ? "green" : "gold"}`}
          >
            {series.phase.toUpperCase()}
          </span>
        </div>
        <div className="contract-facts">
          <div>
            <span>Contract</span>
            <External href={explorer(config, "address", series.address)}>
              {short(series.address)}
            </External>
          </div>
          <div>
            <span>Expiry</span>
            <strong>{new Date(series.expiry * 1000).toLocaleString()}</strong>
          </div>
          <div>
            <span>Opening reference</span>
            <strong className="mono">
              ${money(series.base_price, 4)} / hr
            </strong>
          </div>
          <div>
            <span>Maximum payout per unit</span>
            <strong>10 USDG</strong>
          </div>
          <div>
            <span>Call / put premium</span>
            <strong>
              {money(series.call_premium)} / {money(series.put_premium)} USDG
            </strong>
          </div>
          <div>
            <span>Positions issued</span>
            <strong>{series.position_count}</strong>
          </div>
          <div>
            <span>Committed collateral</span>
            <strong>{money(series.reserved)} USDG</strong>
          </div>
          <div>
            <span>Available collateral</span>
            <strong>{money(series.available)} USDG</strong>
          </div>
        </div>
        <div className="contract-actions">
          {series.phase === "funding" ? (
            <button
              className="button primary"
              disabled={!protocol?.verified || !protocol.funding_enabled}
              onClick={() => void open("fund")}
            >
              <Wallet size={13} />
              {protocol?.funding_enabled ? "Provide USDG" : "Funding unavailable"}
            </button>
          ) : (
            <Link className="button" to="/terminal?asset=h100-sxm">
              Open market
              <ArrowUpRight size={13} />
            </Link>
          )}
          {portfolio && Number(portfolio.writer_shares) > 0 && (
            <button
              className="button"
              disabled={
                !protocol?.verified ||
                !["funding", "settled", "cancelled"].includes(series.phase)
              }
              onClick={() => void open("withdraw")}
            >
              Withdraw collateral
            </button>
          )}
          <span className="muted">
            Your writer shares: {money(portfolio?.writer_shares)}
          </span>
        </div>
        {error && <p className="inline-error">{error}</p>}
      </section>
      {action && (
        <Modal
          title={
            action === "fund"
              ? "Provide series collateral"
              : "Withdraw writer shares"
          }
          close={() => {
            if (!pending) setAction(null);
          }}
        >
          <div className="modal-body">
            <p>
              {action === "fund"
                ? `You supply USDG to cover capped payouts. Your deposit can be lost. Capital locks when this series opens and stays locked until settlement or cancellation. Opening: ${new Date(series.open_at * 1000).toLocaleString()}.`
                : "Redeem writer shares for your portion of the remaining equity. Buyer payouts remain reserved. One share is not guaranteed to return one USDG after trading."}
            </p>
            <label className="field-label" htmlFor="writer-amount">
              {action === "fund" ? "USDG to deposit" : "Shares to redeem"}
            </label>
            <div className="amount-input">
              <input
                id="writer-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span>{action === "fund" ? "USDG" : "shares"}</span>
            </div>
            {action === "withdraw" && (
              <p>
                Currently withdrawable: {money(portfolio?.withdrawable)} USDG
                for all your shares.
              </p>
            )}
            <button
              className="button primary full-width writer-confirm"
              disabled={pending}
              onClick={() => void execute()}
            >
              {pending ? "Waiting for wallet…" : "Confirm in wallet"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
