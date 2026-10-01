import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Trash2 } from "lucide-react";
import { useBenefits } from "../benefits";
import { useData } from "../data";
import { money } from "../api";
import { Modal } from "./ui";
import { downloadCsv, readTemplates, TEMPLATE_KEY, type StrategyTemplate, type TemplateTerms } from "../workspace";

export function StrategyTemplates({ terms, load, notify }: { terms: TemplateTerms; load: (value: TemplateTerms) => void; notify: (value: string) => void }) {
  const { eligible, open } = useBenefits();
  const limit = eligible ? 50 : 10;
  const [saved, setSaved] = useState(readTemplates), [error, setError] = useState("");
  useEffect(() => { const refresh = () => setSaved(readTemplates()); window.addEventListener("storage", refresh); window.addEventListener("silicon:templates", refresh); return () => { window.removeEventListener("storage", refresh); window.removeEventListener("silicon:templates", refresh); }; }, []);
  const persist = (next: StrategyTemplate[]) => {
    try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next)); setSaved(next); setError(""); return true; }
    catch { setError("Browser storage is unavailable. This template was not saved."); return false; }
  };
  const save = () => {
    const current = readTemplates();
    if (current.length >= limit) { setError(`Your workspace has ${current.length} templates. Remove one to save another; your existing templates remain available.`); return; }
    if (!/^\d+(\.\d{1,6})?$/.test(terms.premium) || Number(terms.premium) < .1 || Number(terms.premium) > 9.9) { setError("Enter a valid assumed premium before saving."); return; }
    const name = terms.thesis.trim().slice(0, 80) || `${terms.spread ? "Generation spread" : "H100"} ${terms.side === "call" ? "rise" : "fall"} · ${terms.days} days`;
    if (persist([...current, { ...terms, id: crypto.randomUUID(), name }])) notify("Template saved on this browser. No paper position was opened.");
  };
  return <section className="workspace-tools" aria-label="Saved strategy templates"><h3>Saved templates</h3><p>{saved.length} / {limit} templates on this browser. Loading one restores the inputs; recording a paper strategy remains a separate action.</p><div className="workspace-actions"><button className="button" onClick={save}>Save current template</button><Link className="text-button" to="/terminal?workspaces=1">Sync wallet workspace</Link><button className="text-button" onClick={open}>Workspace benefits</button></div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="template-list">{saved.filter(t => t.spread === terms.spread).map(template => <div className="template-row" key={template.id}><button onClick={() => { load(template); notify("Template loaded. Review its assumptions before recording."); }}>{template.name}</button><button className="icon-button" aria-label={`Remove template ${template.name}`} onClick={() => persist(readTemplates().filter(t => t.id !== template.id))}><Trash2 size={15} /></button></div>)}</div></section>;
}

export function GpuCompare({ close }: { close: () => void }) {
  const { snapshot } = useData(), { eligible } = useBenefits();
  const markets = snapshot?.markets ?? [];
  const [selected, setSelected] = useState(() => markets.slice(0, 2).map(m => m.id));
  const limit = eligible ? 16 : 2;
  const rows = markets.filter(m => selected.includes(m.id));
  // Existing selections remain inspectable after an eligibility change.
  const exportRows = () => {
    if (!eligible) return;
    downloadCsv("silicon-gpu-comparison.csv", [["GPU", "USD per GPU-hour", "Reference status", "Providers", "Source time", "Role"], ...rows.map(m => [m.name, m.price, m.stale ? "Stale" : "Fresh", m.coverage, m.source_updated_at, m.id === "h100-sxm" ? "H100 benchmark" : "Comparison reference"])]);
  };
  return <Modal title="Compare GPU references" close={close} wide><div className="benefits-body"><p>Compare published rental references. Different models use different provider baskets; these are not executable spread quotes.</p><p>{selected.length} selected · {limit} model allowance</p><div className="comparison-picker">{markets.map(m => <button key={m.id} aria-pressed={selected.includes(m.id)} disabled={!selected.includes(m.id) && selected.length >= limit} onClick={() => setSelected(values => values.includes(m.id) ? values.filter(id => id !== m.id) : [...values, m.id])}>{m.name}</button>)}</div><div className="comparison-scroll"><table><thead><tr><th>GPU</th><th>USD / hr</th><th>Coverage</th><th>Source time</th></tr></thead><tbody>{rows.map(m => <tr key={m.id}><td>{m.name}</td><td>{money(m.price, 4)}{m.stale && <small> · stale</small>}</td><td>{m.coverage} providers</td><td>{m.source_updated_at ? new Date(m.source_updated_at).toLocaleString() : "Awaiting data"}</td></tr>)}</tbody></table></div><div className="benefits-footer"><button className="button" disabled={!eligible || !rows.length} onClick={exportRows}><Download size={15} />Export comparison CSV</button><span className="benefits-note">{eligible ? "Exports include source times and freshness." : "Batch exports are an optional holder benefit."}</span></div></div></Modal>;
}
