import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Info,
  LockKeyhole,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, type Access, type Market, type Quote } from "../api";
import { useWallet } from "../wallet";
import { useConfig } from "../data";
import { Modal } from "./ui";
import { previewPosition, withScenario } from "../preview";
import { SmoothRange } from "./SmoothRange";
import { AnimatedNumber } from "./AnimatedNumber";
import { PayoffChart } from "./PayoffChart";

export default function Ticket({
  market,
  notify,
}: {
  market: Market;
  notify: (s: string) => void;
}) {
  const wallet = useWallet();
  const config = useConfig();
  const [side, setSide] = useState<"call" | "put">("call"),
    [size, setSize] = useState(2),
    [move, setMove] = useState(4);
  const [quoted, setQuoted] = useState<{ key: string; value: Quote } | null>(
      null,
    ),
    [access, setAccess] = useState<Access | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [showPayoff, setShowPayoff] = useState(true);
  const [review, setReview] = useState<Quote | null>(null),
    [sending, setSending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setRefresh((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setAccess(null);
    if (!wallet.address) return;
    let alive = true;
    const run = () => {
      void api<Access>(`/access/${wallet.address}`)
        .then((v) => {
          if (alive) setAccess(v);
        })
        .catch(() => {});
    };
    run();
    const t = setInterval(run, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [wallet.address]);
  const quoteKey = `${market.id}:${side}:${size}:${wallet.address ?? ""}`;
  const confirmed = quoted?.key === quoteKey ? quoted.value : null;
  const fee = access?.fee_bps ?? config.fee_bps;
  const quote = confirmed
    ? withScenario(confirmed, side, move)
    : previewPosition(size, move, side, market.price, fee);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      void api<Quote>("/quote", {
        method: "POST",
        body: JSON.stringify({
          market: market.id,
          side,
          premium: size,
          move_pct: 0,
          address: wallet.address,
        }),
        signal: controller.signal,
      })
        .then((v) => {
          if (!controller.signal.aborted)
            setQuoted({ key: quoteKey, value: v });
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 120);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [market.id, market.price, side, size, wallet.address, refresh, quoteKey]);
  const connect = async () => {
    try {
      await wallet.connect();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const execute = async () => {
    if (!review || !wallet.address) return;
    setSending(true);
    try {
      const { buyPosition } = await import("../transactions");
      await buyPosition(
        await wallet.provider(),
        wallet.address,
        config,
        review,
        side,
        notify,
      );
      notify(
        "Position confirmed onchain. The activity feed will update after indexing.",
      );
      setReview(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <aside className="ticket panel">
      <div className="panel-heading">
        <h2>Build a position</h2>
        <span className="mini-label purple">
          {quote && !quote.indicative ? "FUNDED QUOTE" : "CALCULATOR"}
        </span>
      </div>
      <div className="ticket-body">
        <div className="ticket-asset">
          <div>
            <img className="nvidia" src="/assets/nvidia.svg" alt="NVIDIA" />
            <strong>{market.name}</strong>
            <span className="muted">Rental reference</span>
          </div>
          <span className="mono">
            ${money(market.price)}
            <small>/hr</small>
          </span>
        </div>
        <div className="direction-buttons">
          <button
            aria-pressed={side === "call"}
            className={`direction rise ${side === "call" ? "selected" : ""}`}
            onClick={() => {
              setSide("call");
              setMove(Math.abs(move));
            }}
          >
            <ArrowUpRight size={17} />
            <span>
              Rise <small>Call</small>
            </span>
          </button>
          <button
            aria-pressed={side === "put"}
            className={`direction fall ${side === "put" ? "selected" : ""}`}
            onClick={() => {
              setSide("put");
              setMove(-Math.abs(move));
            }}
          >
            <ArrowDownRight size={17} />
            <span>
              Fall <small>Put</small>
            </span>
          </button>
        </div>
        <div className="ticket-note">
          {side === "call"
            ? "You expect GPU rental prices to rise."
            : "You expect GPU rental prices to fall."}
        </div>
        <div className="field-label">
          <label htmlFor="premium">Premium</label>
          <span>
            Balance: {access?.usdg != null ? money(access.usdg) : "—"} USDG
          </span>
        </div>
        <div className="amount-input">
          <input
            id="premium"
            type="number"
            value={size}
            min=".1"
            max="300"
            step=".1"
            onChange={(e) =>
              setSize(
                Math.min(300, Math.max(0.1, Number(e.target.value) || 0.1)),
              )
            }
          />
          <span className="stable-icon">$</span>
          <strong>USDG</strong>
        </div>
        <SmoothRange
          className="amount-slider"
          label="Adjust premium in USDG"
          min={.1}
          max={60}
          step={.1}
          value={Math.min(size, 60)}
          display={`${money(Math.min(size, 60))} USDG`}
          onChange={setSize}
        />
        <div className="slider-labels mono">
          <span>0.1</span>
          <span>30</span>
          <span>60 USDG</span>
        </div>
        <div className="ticket-row expiry">
          <span>Expiry</span>
          <span>
            {quote?.expiry
              ? new Date(quote.expiry * 1000).toLocaleString()
              : "Set by funded series"}{" "}
            <Info size={12} />
          </span>
        </div>
        <div className="ticket-values" aria-live="off">
          <div>
            <span>Maximum loss</span>
            <strong className="mono">
              <AnimatedNumber value={money(quote?.max_loss)} /> <small>USDG</small>
            </strong>
          </div>
          <div>
            <span>Maximum payout</span>
            <strong className="mono green">
              <AnimatedNumber value={money(quote?.max_payout)} /> <small>USDG</small>
            </strong>
          </div>
          <div>
            <span>Breakeven rental price</span>
            <strong className="mono">
              <AnimatedNumber value={`$${money(quote?.breakeven, 4)}`} />
              <small>/hr</small>
            </strong>
          </div>
          <div>
            <span>
              Platform fee <span className="fee-chip">{fee / 100}%</span>
            </span>
            <strong className="mono">
              <AnimatedNumber value={money(quote?.fee, 3)} /> <small>USDG</small>
            </strong>
          </div>
        </div>
        <button
          className="payoff-toggle"
          aria-expanded={showPayoff}
          onClick={() => setShowPayoff(!showPayoff)}
        >
          Explore your payout
          <ChevronDown size={13} className={showPayoff ? "rotated" : ""} />
        </button>
        {showPayoff && (
          <div className="payoff-sim">
            <PayoffChart move={move} cost={Number(quote.cost)} maxPayout={Number(quote.max_payout)} side={side} onMove={setMove} />
            <div className="field-label">
              <label htmlFor="settlement-move">If the reference moves</label>
            </div>
            <SmoothRange
              id="settlement-move"
              label="If the reference moves"
              min={-15}
              max={15}
              step={.5}
              value={move}
              display={`${move > 0 ? "+" : ""}${move.toFixed(1)}%`}
              onChange={setMove}
            />
            <div className="simulation-result">
              <div>
                <span>Contract payout</span>
                <strong className="mono">
                  <AnimatedNumber value={money(quote?.payout)} /> <small>USDG</small>
                </strong>
              </div>
              <div>
                <span>After premium + fee</span>
                <strong
                  className={`mono ${Number(quote?.profit) >= 0 ? "green" : "red"}`}
                >
                  <AnimatedNumber value={`${Number(quote?.profit) > 0 ? "+" : ""}${money(quote?.profit)}`} />
                </strong>
              </div>
            </div>
          </div>
        )}
        {error && <p className="inline-error">{error}</p>}
        {access?.error && <p className="inline-error">{access.error}</p>}
        {!wallet.address ? (
          <button
            className="button primary full-width"
            onClick={() => void connect()}
            disabled={wallet.busy}
          >
            <Wallet size={14} />
            Connect wallet
          </button>
        ) : quote && !quote.indicative ? (
          <button
            className="button primary full-width"
            disabled={
              busy || sending || Number(access?.usdg ?? 0) < Number(quote.cost)
            }
            onClick={() => setReview(quote)}
          >
            {Number(access?.usdg ?? 0) < Number(quote.cost)
              ? "Insufficient USDG"
              : "Review position"}
            <ArrowUpRight size={13} />
          </button>
        ) : (
          <button className="button full-width locked" disabled>
            <LockKeyhole size={13} />
            {!config.token_address
              ? "Trading opens with token launch"
              : !access?.holder
                ? "Hold Silicon to trade"
                : "Awaiting a funded quote"}
          </button>
        )}
        <p className="ticket-disclosure">
          <ShieldCheck size={12} />
          Capped risk. No liquidation price.
        </p>
        <p className="calculator-disclaimer">
          {quote && !quote.indicative
            ? "Maximum payout is reserved in the series. Quotes expire and are checked again by the contract."
            : "Illustration at 2 USDG per unit, capped at 10. This is not an executable quote. Live series publish their own premium and expiry."}
        </p>
      </div>
      <div className="ticket-bottom">
        <span>
          <LockKeyhole size={11} />
          HOLDER BENEFITS
        </span>
        <p>
          Any holding unlocks trading.
          <br />
          <strong>Above 5,000 tokens: zero trading fees.</strong>
        </p>
        <Link className="text-button" to="/docs#token">
          How it works
          <ArrowUpRight size={12} />
        </Link>
      </div>
      {access?.eth != null && (
        <div className="wallet-gas mono">
          Wallet gas balance <span>{money(access.eth, 5)} ETH</span>
        </div>
      )}
      {review && (
        <Modal
          title={`Review ${market.name} ${side}`}
          close={() => {
            if (!sending) setReview(null);
          }}
        >
          <div className="modal-body">
            <p>
              Your premium buys a capped contract. A published rental-price
              observation at expiry determines the payout. Writer collateral
              covers the maximum payout and bears that risk.
            </p>
            <div className="ticket-values">
              <div>
                <span>Total cost and maximum loss</span>
                <strong>{money(review.cost)} USDG</strong>
              </div>
              <div>
                <span>Maximum payout</span>
                <strong className="green">
                  {money(review.max_payout)} USDG
                </strong>
              </div>
              <div>
                <span>Expiry</span>
                <strong>
                  {review.expiry
                    ? new Date(review.expiry * 1000).toLocaleString()
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Platform fee</span>
                <strong>{money(review.fee, 4)} USDG</strong>
              </div>
            </div>
            <p>
              Settlement uses Silicon’s publisher and a one-hour challenge
              window. No return is guaranteed. This action may request an exact
              USDG approval followed by the trade.
            </p>
            <button
              className="button primary full-width"
              disabled={sending}
              onClick={() => void execute()}
            >
              {sending ? "Waiting for wallet…" : "Confirm position"}
            </button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
