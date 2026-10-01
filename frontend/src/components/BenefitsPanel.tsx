import { useState } from "react";
import { ArrowUpRight, Check, BadgePercent, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { roundFeeBps, useBenefits } from "../benefits";
import { useData } from "../data";
import { useWallet } from "../wallet";
import { money } from "../api";
import { Modal } from "./ui";
import { TokenAddress } from "./TokenAddress";
import "./BenefitsPanel.css";

export default function BenefitsPanel() {
  const { data, error, eligible, refresh, close } = useBenefits();
  const { config, protocol } = useData();
  const wallet = useWallet();
  const [connectError, setConnectError] = useState("");
  const access = data?.access;
  const roundHasNoToken = !!protocol?.verified && !!protocol.contracts.length && !protocol.token_configured;
  const feeBps = roundFeeBps(eligible, protocol);
  const feeWaived = feeBps === 0;
  const status = !config?.token_address ? "Holder benefits are not active yet" : !wallet.address ? "Connect to check your benefits" : error || access?.error || access?.benefits_error ? "Benefits check unavailable" : !access ? "Checking your balance…" : eligible ? "Holder benefits active" : "Standard access";
  const connect = async () => {
    setConnectError("");
    try { await wallet.connect(); } catch (cause) { setConnectError((cause as Error).message); }
  };
  return <Modal title="Your benefits" close={close} appearance="benefits-panel">
    <div className="benefits-body">
      <div className="benefits-intro"><BadgePercent size={25} /><div><h3>{status}</h3><p>Trading and vault deposits use USDG. Silicon ownership is optional.</p></div></div>
      {error && <p className="inline-error" role="status">{error}</p>}
      {access?.benefits_error && <p className="inline-error" role="status">{access.benefits_error}</p>}
      {access?.error && <p className="inline-error" role="status">{access.error}</p>}
      {connectError && <p className="inline-error" role="status">{connectError}</p>}
      <TokenAddress />
      <div className="benefits-balance"><div><span>Your SILICON balance</span><strong title={access?.token_balance ?? undefined}>{access?.benefits_verified ? money(access.token_balance, 6) : "—"}<small> SILICON</small></strong></div>
        {wallet.address ? <button className="text-button" onClick={refresh}><RefreshCw size={14} /> Check balance</button> : <button className="button" onClick={() => void connect()} disabled={wallet.busy}>{wallet.busy ? "Connecting…" : "Connect wallet"}</button>}
      </div>
      <div className="benefits-stats">
        <div><span>{protocol?.contracts.length ? "Current round fee" : "Standard platform fee"}</span><strong>{feeWaived ? "0%" : "1%"}<small> of premium</small></strong><p>{feeBps == null ? "Standard rate shown until a round is verified." : feeWaived ? "Waived for your verified holding in this round." : "A 2 USDG premium carries a 0.02 USDG fee."} Your trade review confirms the actual fee.</p></div>
        <div><span>Recorded fee savings</span><strong>{money(data?.recorded_savings, 4)}<small> USDG</small></strong><p>{data?.history_complete ? `${data.recorded_trades} confirmed purchases. Cancelled rounds excluded.` : "Shown once configured round history is verified."}</p></div>
      </div>
      <div className="benefits-access"><Check size={17} /><p>Markets, calculators, paper strategies and claims are available to everyone. Live positions and deposits open when a funded round is ready.</p></div>
      <div className="benefits-table" role="table" aria-label="Optional holder benefits">
        <div role="row"><span role="columnheader">Workspace</span><span role="columnheader">Standard</span><span role="columnheader">Holder</span></div>
        {[['Browser price alerts', '20', '100'], ['Saved strategy templates', '10', '50'], ['GPU comparison', '2 models', '16 models'], ['Batch CSV export', '—', 'Included']].map(row => <div role="row" key={row[0]}>{row.map((cell, i) => <span role="cell" key={i}>{cell}</span>)}</div>)}
      </div>
      <p className="benefits-note">Holder benefits require strictly more than 5,000 SILICON in your connected wallet on Robinhood Chain. Balances refresh every 30 seconds. Existing alerts and templates remain available if your balance changes. Alerts run while this browser is open.</p>
      {config?.token_address && roundHasNoToken ? <p className="benefits-note">This round was deployed without a fee token and charges the standard fee. Future rounds can support the holder waiver.</p> : null}
      <div className="benefits-footer"><Link className="button" to="/terminal/strategies" onClick={close}>Open strategies <ArrowUpRight size={15} /></Link><Link className="text-button" to="/docs#token" onClick={close}>Benefits & fees</Link></div>
    </div>
  </Modal>;
}
