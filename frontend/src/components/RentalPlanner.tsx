import { useEffect, useState } from "react";
import { Calculator, Copy, Download } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, money } from "../api";
import { useData } from "../data";
import type { components } from "../api-schema";
import { downloadCsv } from "../workspace";
import { External, RequestError } from "./ui";
import "./RentalPlanner.css";

type RentalPlan = components["schemas"]["RentalPlan"];
type PlanRequest = components["schemas"]["RentalPlanRequest"];
function initial(params: URLSearchParams, name: string, fallback: string) {
  const value = params.get(name);
  return value != null && Number.isFinite(Number(value)) ? value : fallback;
}

export default function RentalPlanner() {
  const { snapshot } = useData();
  const [params, setParams] = useSearchParams();
  const markets = snapshot?.markets ?? [];
  const market = markets.find(m => m.id === params.get("asset")) ?? markets[0];
  const [machines, setMachines] = useState(() => initial(params, "machines", "1"));
  const [gpus, setGpus] = useState(() => initial(params, "gpus", "1"));
  const [hours, setHours] = useState(() => initial(params, "hours", "24"));
  const [days, setDays] = useState(() => initial(params, "days", "30"));
  const [plan, setPlan] = useState<RentalPlan | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState("");
  const [selected, setSelected] = useState("");
  const valid = Number.isInteger(Number(machines)) && Number(machines) >= 1 && Number(machines) <= 10000
    && Number.isInteger(Number(gpus)) && Number(gpus) >= 1 && Number(gpus) <= 64
    && Number(hours) > 0 && Number(hours) <= 24 && Math.abs(Number(hours) * 100 - Math.round(Number(hours) * 100)) < .00001
    && Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365;
  useEffect(() => {
    const abort = new AbortController();
    setPlan(null); setError("");
    if (!market || !valid) return;
    const timer = setTimeout(() => {
      const body: PlanRequest = { market: market.id as PlanRequest["market"], machines: Number(machines), gpus_per_machine: Number(gpus), hours_per_day: hours, days: Number(days) };
      void api<RentalPlan>("/rental-plan", { method: "POST", body: JSON.stringify(body), signal: abort.signal })
        .then(setPlan).catch(e => { if (!abort.signal.aborted) setError((e as Error).message); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [market?.id, machines, gpus, hours, days, revision, valid]);
  const rows = plan?.estimates ?? [];
  const quote = rows.find((_, index) => String(index) === selected) ?? rows[0];
  const copyPlan = async () => {
    const link = new URL(window.location.href);
    link.search = new URLSearchParams({ asset: market?.id ?? "h100-sxm", machines, gpus, hours, days }).toString();
    try { await navigator.clipboard.writeText(link.href); setCopied("Plan link copied"); }
    catch { setParams(new URLSearchParams(link.search)); setCopied("Copy the plan URL from your address bar"); }
  };
  const exportPlan = () => {
    if (!plan) return;
    downloadCsv("silicon-rental-plan.csv", [["GPU", "Machines", "GPUs per machine", "Hours per day", "Days", "Provider", "Instance", "Region", "USD per GPU-hour", "Daily USD", "30-day USD", "Selected period USD", "Source UTC", "Source URL"], ...rows.map(row => [plan.name, plan.machines, plan.gpus_per_machine, plan.hours_per_day, plan.days, row.provider, row.instance, row.region, row.rate_usd_per_gpu_hour, row.daily_usd, row.monthly_usd, row.total_usd, row.source_time, row.source_url])]);
  };
  return <div className="rental-planner">
    <section className="panel rental-plan-inputs"><div className="panel-heading"><h2><Calculator size={15} />Plan a GPU rental</h2><span className="eyebrow">ESTIMATES / SOURCE LISTINGS</span></div>
      <div className="rental-input-grid">
        <label>GPU model<select value={market?.id ?? ""} aria-label="Planner GPU model" onChange={e => { setParams({ asset: e.target.value }); setSelected(""); }}>{markets.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
        <label>Machines<input aria-label="Planner machines" type="number" min="1" max="10000" step="1" value={machines} onChange={e => setMachines(e.target.value)} /></label>
        <label>GPUs per machine<input aria-label="GPUs per machine" type="number" min="1" max="64" step="1" value={gpus} onChange={e => setGpus(e.target.value)} /></label>
        <label>Hours per day<input aria-label="Hours per day" type="number" min="0.01" max="24" step="0.01" value={hours} onChange={e => setHours(e.target.value)} /></label>
        <label>Duration in days<input aria-label="Rental duration in days" type="number" min="1" max="365" step="1" value={days} onChange={e => setDays(e.target.value)} /></label>
      </div>
      {!valid && <p className="inline-error" role="alert">Choose whole machine/GPU counts and days, and between 0.01 and 24 hours per day.</p>}
      <p className="rental-plan-note">Machine size and runtime are your assumptions. Listings are normalized per GPU-hour; the provider may require a different full-instance configuration.</p>
    </section>
    {error && <RequestError message={error} retry={() => setRevision(v => v + 1)} />}
    {valid && !plan && !error && <p className="rental-plan-note" role="status">Checking source listings.</p>}
    {plan && <>
      {plan.reference_stale && <p className="rental-plan-note">The market reference is withheld or stale. Any estimates below use independently fresh provider listings.</p>}
      {!!plan.excluded_stale_listings && <p className="rental-plan-note">{plan.excluded_stale_listings} stale listing(s) excluded.</p>}
      {quote ? <>
        <div className="rental-estimate-heading"><div><span className="eyebrow">YOUR ESTIMATE</span><h2>{quote.provider} · {plan.total_gpus} GPU{plan.total_gpus === 1 ? "" : "s"}</h2><p>{plan.hours_per_day} hours/day · {plan.total_gpu_hours} GPU-hours over {plan.days} days</p></div><div className="rental-plan-actions"><button className="button" onClick={() => void copyPlan()}><Copy size={13} />{copied || "Copy plan link"}</button><button className="button" onClick={exportPlan}><Download size={13} />Export CSV</button></div></div>
        <div className="rental-totals"><div><span>Per day</span><strong>${money(quote.daily_usd)}</strong></div><div><span>30-day month</span><strong>${money(quote.monthly_usd)}</strong></div><div><span>Your {plan.days}-day estimate</span><strong>${money(quote.total_usd)}</strong></div></div>
        <section className="panel rental-provider-panel"><div className="panel-heading"><h2>Compare provider listings</h2><span className="eyebrow">CONSTANT RATE ASSUMPTION</span></div><div className="rental-provider-scroll"><table><thead><tr><th>Provider / listing</th><th>USD / GPU-hr</th><th>{plan.days}-day estimate</th><th>Source</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.provider_id}:${row.instance}:${row.region}`} className={row === quote ? "selected" : ""}><td><button aria-pressed={row === quote} aria-label={`Estimate with ${row.provider} ${row.instance ?? "listing"} ${row.region ?? ""}`} onClick={() => setSelected(String(index))}>{row.provider}<small>{row.instance ?? "Full instance"} · {row.region ?? "Region unspecified"}</small></button></td><td>${money(row.rate_usd_per_gpu_hour, 4)}</td><td>${money(row.total_usd)}</td><td><External href={row.source_url}>Listing</External><small>{new Date(row.source_time).toLocaleString()}</small></td></tr>)}</tbody></table></div></section>
      </> : <section className="panel rental-plan-empty"><h2>No fresh listings for this estimate.</h2><p>Choose another GPU or check again later. Archived prices are excluded.</p><button className="button" onClick={() => setRevision(v => v + 1)}>Refresh listings</button></section>}
      <section className="panel rental-assumptions"><h2>What this estimate assumes</h2><ul>{plan.assumptions.map(note => <li key={note}>{note}</li>)}</ul></section>
    </>}
  </div>;
}
