import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, CircleCheck, Clock3, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { api, explorer, money, short, type Market } from "../api";
import type { components } from "../api-schema";
import { useConfig, useData } from "../data";
import { useWallet } from "../wallet";
import { checkTransaction, journalEvent, resolveReplacement, transactionsFor, type TransactionEntry } from "../transactionJournal";
import { External, Modal } from "./ui";
import "./TerminalInsights.css";

type Context = components["schemas"]["MarketContext"];
type Accounting = components["schemas"]["VaultAccounting"];
type Position = components["schemas"]["PositionView"];
type Observation = { hash: string; receipt: { price: string; index: string; source_updated_at: string; constituents: NonNullable<Market["providers"]>; methodology: string } };
const date = (value?: string | number | null) => value != null && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : "Unavailable";
const amount = (value?: string | null) => value == null ? "Unavailable" : `${money(value, 4)} USDG`;

function useResource<T>(path: string, revision?: string | null) {
  const [result, setResult] = useState<{ path: string; value: T } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void api<T>(path, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult({ path, value });
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [path, revision, retry]);
  return { value: result?.path === path ? result.value : null, error, retry: () => setRetry(n => n + 1) };
}

function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return <p className="inline-error" role="alert">{error} <button className="text-button" onClick={retry}>Retry</button></p>;
}

export function MarketContextBar({ market, evidence }: { market: Market; evidence: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="market-context-bar">
    <button className="text-button" onClick={() => setOpen(true)}><BookOpen size={16} /> Market details</button>
    <span>{market.id === "h100-sxm" ? "H100 benchmark" : "Comparison reference"}</span>
    <button className="text-button" onClick={evidence}>Sources & history <ArrowUpRight size={14} /></button>
    {open && <MarketContextDetail market={market} close={() => setOpen(false)} />}
  </div>;
}

function MarketContextDetail({ market, close }: { market: Market; close: () => void }) {
  const { protocol } = useData();
  const { value, error, retry } = useResource<Context>(`/markets/${market.id}/context`, protocol?.checked_at);
  const config = useConfig();
  return <Modal title={`${market.name} · market details`} close={close} wide><div className="insight-content">
    {error ? <LoadError error={error} retry={retry} /> : !value ? <p>Loading market details…</p> : <>
      <div className="insight-heading"><h2>{value.mode === "comparison" ? "Monitor rental prices" : "Trading readiness"}</h2><span className={value.ready ? "green" : "gold"}>{value.ready ? "Ready for a wallet quote" : value.mode === "comparison" ? "Comparison only" : "Execution unavailable"}</span></div>
      {value.reasons.length > 0 && <ul className="insight-reasons">{value.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      {value.ready && <p>A live quote also checks your Silicon balance, USDG, position size and available collateral.</p>}
      <div className="insight-grid"><div><span>Rental reference</span><strong>${money(market.price, 4)} / hr</strong></div><div><span>Source updated</span><strong className={value.source_fresh ? "green" : "gold"}>{date(value.source_updated_at)}</strong></div></div>
      <h3>How the reference is built</h3><p>{value.methodology}</p>
      <details className="insight-details"><summary>Excluded from the reference</summary><ul>{value.exclusions.map(item => <li key={item}>{item}</li>)}</ul></details>
      {value.contracts.map(series => <div className="insight-contract" key={series.address}><div className="insight-heading"><h3>H100 series</h3><External href={explorer(config, "address", series.address)}>{short(series.address)}</External></div><div className="insight-grid"><div><span>Expiry</span><strong>{date(series.expiry * 1000)}</strong></div><div><span>Available backing</span><strong>{value.contract_verified ? amount(series.available) : "Verification unavailable"}</strong></div><div><span>Maximum payout</span><strong>10 USDG per unit</strong></div><div><span>Settlement</span><strong>Publisher + 1 hour challenge</strong></div></div></div>)}
      <div className="insight-links"><Link className="button" to="/terminal/contracts" onClick={close}>All contracts <ArrowUpRight size={15} /></Link>{["h100-sxm", "b200"].includes(market.id) && <Link className="button" to={`/terminal/strategies?tool=${market.id === "b200" ? "spread" : "trend"}`} onClick={close}>Build a paper strategy <ArrowUpRight size={15} /></Link>}<Link className="text-button" to="/docs#methodology" onClick={close}>Settlement rules</Link></div>
    </>}
  </div></Modal>;
}

export function SourceEvidence({ market }: { market: Market }) {
  const { value, error, retry } = useResource<{ receipts: Observation[] }>(`/receipts?market=${encodeURIComponent(market.id)}`, market.source_updated_at);
  const [selected, setSelected] = useState("");
  const rows = value?.receipts ?? [];
  const row = rows.find(item => item.hash === selected) ?? rows[0];
  return <section className="insight-content observation-archive">
    <h3>Observation archive</h3><p>Open an observation to see the providers used at that time. Archived entries stay fixed when current prices change.</p>
    {error ? <LoadError error={error} retry={retry} /> : !value ? <p>Loading recorded observations…</p> : !row ? <p>No source observations have been archived for this GPU yet.</p> : <>
      <label className="field-label" htmlFor="observation-date">Observation time</label><select id="observation-date" value={row.hash} onChange={e => setSelected(e.target.value)}>{rows.map(item => <option key={item.hash} value={item.hash}>{date(item.receipt.source_updated_at)} · ${money(item.receipt.price, 4)}/hr</option>)}</select>
      <div className="insight-grid"><div><span>Archived reference</span><strong>${money(row.receipt.price, 4)} / hr</strong></div><div><span>Included providers</span><strong>{row.receipt.constituents.length}</strong></div></div>
      <div className="observation-providers">{row.receipt.constituents.map((provider, i) => <div key={`${provider.id}:${i}`}><strong>{provider.provider}</strong><span>${money(provider.price, 4)}/hr</span><span>{provider.instance} {provider.region}</span><time dateTime={provider.updated_at}>{date(provider.updated_at)}</time></div>)}</div>
      <p>Spot, reserved, non-USD and unconfirmed quotes are excluded. {market.id === "h100-sxm" ? "Only the fixed H100 basket contributes to the median." : "Only each provider’s cheapest eligible listing contributes to the median."}</p>
      <a className="text-button observation-receipt" href={`/api/v1/receipts/${row.hash}`} target="_blank" rel="noreferrer">Open archived receipt <ArrowUpRight size={15} /><span>{short(row.hash)}</span></a>
    </>}
  </section>;
}

export function RoundAccounting({ address, checkedAt }: { address: string; checkedAt?: string | null }) {
  const { value, error, retry } = useResource<Accounting>(`/vaults/${address}/accounting`, checkedAt);
  return <details className="round-accounting insight-details"><summary>Round accounting</summary><div className="insight-content">
    {error ? <LoadError error={error} retry={retry} /> : !value ? <p>Loading round accounting…</p> : <>
      <div className="insight-heading"><h3>Capital & obligations</h3><span className={value.verified ? "green" : "gold"}>{value.withdrawal_status}</span></div>
      <div className="insight-grid">{[["Current accounted assets", value.assets], ["Reserved for buyers", value.reserved], ["Available equity / capacity", value.available], ["Total deposited", value.deposits], ["Premiums + fees received", value.premiums_and_fees], ["Buyer payments made", value.buyer_payments], ["Provider withdrawals", value.withdrawals]].map(([label, number]) => <div key={label}><span>{label}</span><strong>{amount(number)}</strong></div>)}</div>
      <div className="insight-result"><span>Final provider result, including withdrawals</span><strong className={value.final_provider_result == null ? "muted" : Number(value.final_provider_result) >= 0 ? "green" : "red"}>{value.final_provider_result == null ? "Not finalized" : amount(value.final_provider_result)}</strong></div>
      {(value.notes ?? []).map(note => <p key={note}>{note}</p>)}<p>Balances checked {date(value.checked_at)}. Transfers indexed through block {value.indexed_block?.toLocaleString() ?? "unavailable"}. Deposits can lose principal.</p>
    </>}
  </div></details>;
}

export function useTransactionRecovery() {
  const wallet = useWallet();
  const config = useConfig();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener(journalEvent, refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(journalEvent, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  useEffect(() => {
    let alive = true, checking = false;
    setError("");
    const check = async () => {
      if (!wallet.address || checking) return;
      checking = true;
      const rows = transactionsFor(wallet.address, config.chain_id).filter(row => row.status === "pending");
      const results = await Promise.allSettled(rows.map(checkTransaction));
      if (alive) setError(results.some(result => result.status === "rejected") ? "Confirmation checks are temporarily unavailable. Your submitted transaction is saved." : "");
      checking = false;
    };
    void check();
    const timer = window.setInterval(() => void check(), 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [wallet.address, config.chain_id]);
  // The event revision refreshes local entries without restarting the polling loop.
  void revision;
  return { entries: wallet.address ? transactionsFor(wallet.address, config.chain_id) : [], error };
}

export function SavedTransactions({ entries, error, compact = false }: { entries: TransactionEntry[]; error: string; compact?: boolean }) {
  const [selected, setSelected] = useState<TransactionEntry | null>(null);
  const rows = compact ? entries.filter(row => row.status === "pending") : entries;
  if (compact && !rows.length) return null;
  const shown = selected ? entries.find(row => row.hash === selected.hash) : null;
  return <section className={`panel saved-transactions ${compact ? "compact" : ""}`}>
    <div className="insight-heading"><h2><ReceiptText size={17} /> {compact ? "Pending transactions" : "Your transaction receipts"}</h2>{compact && <Link className="text-button" to="/terminal/activity">Activity <ArrowUpRight size={14} /></Link>}</div>
    {!compact && <p>Saved in this browser for your connected wallet. Confirmation checks resume when you return.</p>}
    {error && <p className="inline-error" role="status">{error}</p>}
    {rows.length ? rows.slice(0, 100).map(row => <button className="saved-transaction" key={row.hash} onClick={() => setSelected(row)}>{row.status === "pending" ? <Clock3 size={17} /> : <ReceiptText size={17} />}<span><strong>{({ buy: "Open position", approve: "USDG approval", fund: "Provide capital", withdraw: "Withdraw capital", claim: "Claim payout" })[row.action]}</strong><time>{date(row.createdAt)}</time></span><span className={row.status === "confirmed" ? "green" : row.status === "failed" ? "red" : "gold"}>{row.status === "pending" ? "Awaiting confirmation" : row.status === "failed" ? "Reverted" : row.status === "replaced" ? "Replaced" : "Confirmed"}</span><ArrowUpRight size={15} /></button>) : <p>Transactions sent here will appear after your wallet returns a transaction hash.</p>}
    {shown && <TransactionReceipt entry={shown} close={() => setSelected(null)} />}
  </section>;
}

function TransactionReceipt({ entry, close }: { entry: TransactionEntry; close: () => void }) {
  const config = useConfig();
  const quote = entry.quote;
  const [replacement, setReplacement] = useState(""), [error, setError] = useState(""), [checking, setChecking] = useState(false);
  const checkReplacement = async () => {
    setChecking(true); setError("");
    try { await resolveReplacement(entry, replacement.trim()); }
    catch (e) { setError((e as Error).message); }
    finally { setChecking(false); }
  };
  return <Modal title="Transaction receipt" close={close}><div className="insight-content">
    <ol className="receipt-timeline"><li className="complete"><CircleCheck size={17} /><div><strong>Submitted to Robinhood Chain</strong><time>{date(entry.createdAt)}</time></div></li><li className={entry.status === "confirmed" ? "complete" : ""}><Clock3 size={17} /><div><strong>{entry.status === "confirmed" ? "Confirmed" : entry.status === "failed" ? "Reverted" : entry.status === "replaced" ? "Replaced in wallet" : "Waiting for confirmation"}</strong><p>{entry.status === "pending" ? "You can close this page. Silicon will check this hash when you return; it will not send another transaction." : entry.action === "approve" ? "Approval only changes the token allowance. Review a fresh quote before opening a position." : "The transaction result is available on the explorer."}</p></div></li></ol>
    {quote && <><h3>Reviewed position terms</h3><div className="insight-grid"><div><span>Direction</span><strong>H100 {entry.side}</strong></div><div><span>Maximum authorized cost</span><strong>{amount(quote.cost)}</strong></div><div><span>Quoted premium / fee</span><strong>{money(quote.premium, 4)} / {money(quote.fee, 4)} USDG</strong></div><div><span>Maximum payout</span><strong>{amount(quote.max_payout)}</strong></div><div><span>Series opening reference</span><strong>${money(quote.reference_price, 4)} / hr</strong></div><div><span>Expiry</span><strong>{quote.expiry ? date(quote.expiry * 1000) : "Unavailable"}</strong></div></div><p>These are the terms you reviewed. The indexed position records the actual charged cost. Settlement and claiming are shown under My positions.</p></>}
    <div className="insight-links"><External href={explorer(config, "tx", entry.hash)}>Transaction {short(entry.hash)}</External><External href={explorer(config, "address", entry.series)}>Contract {short(entry.series)}</External></div>
    {entry.status === "pending" && <details className="insight-details"><summary>Replaced or cancelled in your wallet?</summary><p>Paste the new transaction hash. Silicon checks that it used the same wallet and nonce and has two confirmations before releasing the pending action.</p><label className="field-label" htmlFor="replacement-hash">Replacement transaction hash</label><input className="replacement-input" id="replacement-hash" value={replacement} onChange={e => setReplacement(e.target.value)} autoComplete="off" spellCheck={false} placeholder="0x…" /><button className="button" disabled={checking || !/^0x[0-9a-fA-F]{64}$/.test(replacement.trim())} onClick={() => void checkReplacement()}>{checking ? "Checking replacement…" : "Check replacement"}</button>{error && <p className="inline-error" role="alert">{error}</p>}</details>}
    {entry.status === "replaced" && entry.replacementHash && <div className="insight-contract"><External href={explorer(config, "tx", entry.replacementHash)}>Confirmed replacement {short(entry.replacementHash)}</External><p>The replacement may have executed the original action. Check its result and your positions before submitting again.</p></div>}
  </div></Modal>;
}

export function PositionReceipt({ position, close }: { position: Position; close: () => void }) {
  const config = useConfig();
  return <Modal title={`H100 ${position.side} · position #${position.id}`} close={close}><div className="insight-content">
    <ol className="receipt-timeline"><li className="complete"><CircleCheck size={17} /><div><strong>Position opened</strong><time>{date(position.opened_at * 1000)}</time></div></li><li className={position.profit != null ? "complete" : ""}><Clock3 size={17} /><div><strong>{position.profit != null ? position.final_index == null ? "Cancelled · cost refundable" : "Settled" : "Awaiting settlement"}</strong><p>{position.expiry ? `Expiry ${date(position.expiry * 1000)}. ` : ""}The published result has a one-hour challenge window.</p></div></li><li className={position.claimed ? "complete" : ""}><ReceiptText size={17} /><div><strong>{position.claimed ? "Payout claimed" : position.claimable != null ? `${amount(position.claimable)} available to claim` : "Claim after settlement"}</strong></div></li></ol>
    <div className="insight-grid"><div><span>Actual cost / maximum loss</span><strong>{amount(position.cost)}</strong></div><div><span>Maximum payout</span><strong>{amount(position.cap)}</strong></div><div><span>Units</span><strong>{money(position.units, 3)}</strong></div><div><span>Premium / fee</span><strong>{position.premium != null && position.fee != null ? `${money(position.premium, 4)} / ${money(position.fee, 4)} USDG` : "Breakdown not indexed"}</strong></div><div><span>Final result after cost</span><strong>{amount(position.profit)}</strong></div><div><span>Final index</span><strong>{position.final_index == null ? "Unavailable" : money(position.final_index, 4)}</strong></div></div>
    <p>Results exclude ETH network fees. Until the round finalizes, the premium and fee can be lost.</p><External href={explorer(config, "tx", position.tx)}>Opening transaction {short(position.tx)}</External>
  </div></Modal>;
}
