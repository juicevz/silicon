import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, ChevronDown, Loader2, MessageSquare, Plus, Square, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useCompute } from "../compute-context";
import { computeApi, type AssistantReply, type MarketId, type Mode, type StrategyDraft } from "../compute-api";
import type { Market } from "../api";
import "../compute.css";

const starters: Record<Mode, string[]> = {
  chat: ["Help me compare two language models for my app.", "Write a Python function to calculate a median rental rate.", "Explain inference costs in plain language."],
  market: ["What does the latest rental reference tell us?", "Which providers contribute to this reference?", "What is ready to trade, and what is still a comparison?"],
  strategy: ["Draft a 14-day paper thesis for falling H100 rents.", "Build a scenario where B200 holds its price better than H100.", "Help me test a rise in H100 rental prices over 7 days."],
};
const titles: Record<Mode, string> = { chat: "Start a conversation.", market: "Put the market in context.", strategy: "Start with a view on compute." };
const descriptions: Record<Mode, string> = {
  chat: "Write, code and reason with the model you choose.",
  market: "Ask about the selected GPU, its providers and Silicon’s market status.",
  strategy: "Describe a rental-price thesis. Review the assumptions, then explore it in the paper builder.",
};

function AnswerText({ content }: { content: string }) {
  return <div className="compute-answer-text">{content.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}</p>)}</div>;
}

function DraftCard({ draft, id }: { draft: StrategyDraft; id: string }) {
  const spread = draft.kind === "generation_spread";
  return <div className="compute-draft">
    <div className="compute-draft-label"><span className="eyebrow">PAPER DRAFT</span><span>Review before recording</span></div>
    <h3>{spread ? `${draft.side === "call" ? "B200" : "H100"} outperforms` : `H100 rents ${draft.side === "call" ? "rise" : "fall"}`}</h3>
    <dl><div><dt>Period</dt><dd>{draft.days} days</dd></div><div><dt>Size</dt><dd>{draft.units} units</dd></div><div><dt>Assumed premium</dt><dd>{draft.premium_per_unit} USDG / unit</dd></div><div><dt>{spread ? "B200 scenario" : "H100 scenario"}</dt><dd>{draft.scenario_move_pct > 0 ? "+" : ""}{draft.scenario_move_pct}%</dd></div>{spread && <div><dt>H100 scenario</dt><dd>{draft.h100_move_pct ?? 0}%</dd></div>}</dl>
    <strong className="compute-assumptions-title">Assumptions</strong><ul>{draft.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>
    <Link className="button primary" to={`/terminal/strategies?tool=${spread ? "spread" : "trend"}`} state={{ computeDraft: draft, computeDraftId: id }}>Review in paper builder <ArrowUpRight size={15} /></Link>
  </div>;
}

export function ComputeSignIn() {
  const { catalog, loading, signing, signIn, account } = useCompute();
  const [error, setError] = useState("");
  if (loading) return <p className="compute-note" role="status">Checking Compute access…</p>;
  if (!catalog) return <p className="compute-note" role="status">Checking model availability…</p>;
  if (!catalog.enabled) return <p className="compute-note" role="status">Compute is currently unavailable. You can still explore GPU markets and paper strategies.</p>;
  if (account) return account.access === "ready" ? null : <p className="compute-note" role="status">{account.access === "exhausted" ? "Your Compute usage is currently exhausted." : account.access === "unavailable" ? "Compute is currently unavailable." : "Your Compute access is pending. Check Usage for outstanding requests."}</p>;
  return <div className="compute-signin"><div><strong>Sign in to use Compute</strong><p>Your wallet signature starts a private session. It does not move funds.</p></div><button className="button" disabled={signing} onClick={() => { setError(""); void signIn().catch(e => setError((e as Error).message)); }}>{signing ? <Loader2 size={15} className="spin" /> : <Wallet size={15} />}{signing ? "Signing in…" : "Sign in with wallet"}</button>{error && <p className="inline-error" role="alert">{error}</p>}</div>;
}

export function ComputeAssistant({ mode, market = "h100-sxm", compact = false }: { mode: Mode; market?: MarketId; compact?: boolean }) {
  const { catalog, account, conversations, setConversation, refresh, sessionVersion } = useCompute();
  const id = `${mode}:${mode === "chat" ? "general" : market}`;
  const messages = conversations[id] ?? [];
  const [input, setInput] = useState(""), [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null), run = useRef(0);
  const bottom = useRef<HTMLDivElement | null>(null), textarea = useRef<HTMLTextAreaElement | null>(null);
  const models = catalog?.models ?? [];
  const model = models.find(m => m.id === selected && m.available) ?? models.find(m => m.available);
  const ready = catalog?.enabled && account?.access === "ready" && !!model;
  useEffect(() => {
    setError(""); setPending(false); setInput("");
    return () => { run.current++; controller.current?.abort(); };
  }, [id, sessionVersion]);
  useEffect(() => { if (messages.length) bottom.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [messages.length, pending]);
  const send = async () => {
    if (!input.trim() || !model || !ready || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    const current = ++run.current;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setConversation(id, next); setInput(""); setPending(true); setError("");
    try {
      const reply = await computeApi<AssistantReply>("/chat", { method: "POST", signal: abort.signal, body: JSON.stringify({ mode, market, model: model.id, request_id: crypto.randomUUID(), messages: next.slice(-15).map(m => ({ role: m.role, content: mode === "strategy" && m.reply?.draft ? JSON.stringify(m.reply.draft) : m.content })) }) });
      if (current === run.current) setConversation(id, [...next, { role: "assistant", content: reply.content, reply }]);
    } catch (e) {
      if (current === run.current) setError(abort.signal.aborted ? "Response stopped. Usage may still be settling." : (e as Error).message);
    } finally {
      if (controller.current === abort) controller.current = null;
      if (current === run.current) { setPending(false); void refresh(); }
    }
  };
  return <section className={`compute-assistant ${compact ? "is-compact" : ""}`} aria-label={mode === "market" ? "Market assistant conversation" : mode === "strategy" ? "Strategy drafting conversation" : "Model playground"}>
    <div className="compute-chat-toolbar"><label><span className="sr-only">Assistant model</span><select aria-label="Assistant model" value={model?.id ?? ""} onChange={e => setSelected(e.target.value)} disabled={pending || !models.some(m => m.available)}>{!model && <option value="">Models unavailable</option>}{models.map(m => <option value={m.id} disabled={!m.available} key={m.id}>{m.name}{!m.available ? " · unavailable" : ""}</option>)}</select></label><button className="text-button" disabled={pending || !messages.length} onClick={() => { setConversation(id, []); setError(""); textarea.current?.focus(); }}><Plus size={14} />New conversation</button></div>
    <div className="compute-conversation" role="log" aria-label="Conversation" aria-live="polite" aria-busy={pending}>
      {!messages.length && <div className="compute-chat-empty"><div className="compute-glyph" aria-hidden="true"><MessageSquare size={24} /></div><h2>{titles[mode]}</h2><p>{descriptions[mode]}</p><div className="compute-starters">{starters[mode].slice(0, compact ? 2 : 3).map(text => <button key={text} onClick={() => { setInput(text); textarea.current?.focus(); }}>{text}<ArrowUpRight size={14} /></button>)}</div></div>}
      {messages.map((message, i) => <article key={i} className={`compute-message ${message.role}`}><span className="eyebrow">{message.role === "user" ? "YOU" : "SILICON ASSISTANT"}</span><AnswerText content={message.content} />{message.reply?.draft && <DraftCard draft={message.reply.draft} id={message.reply.id} />}{!!message.reply?.sources.length && <div className="compute-sources" aria-label="Sources">{message.reply.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={source.observed_at ? `Observed ${new Date(source.observed_at).toLocaleString()}` : undefined}>{source.title}<ArrowUpRight size={12} /></a>)}</div>}{message.reply?.accounting === "pending" && <p className="compute-note">Usage is still settling.</p>}</article>)}
      {pending && <div className="compute-thinking" role="status"><Loader2 size={15} className="spin" />{mode === "strategy" ? "Building your paper draft…" : "Working through your question…"}</div>}
      <div ref={bottom} />
    </div>
    <div className="compute-compose-area"><ComputeSignIn />{error && <p className="inline-error" role="alert">{error} <Link to="/compute?view=usage">View usage</Link></p>}<form className="compute-composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea ref={textarea} aria-label={mode === "strategy" ? "Describe your strategy" : "Message the assistant"} placeholder={mode === "strategy" ? "Describe the rental-price view you want to explore…" : mode === "market" ? "Ask about this GPU market…" : "Ask a question, write something, or bring your code…"} maxLength={12000} rows={compact ? 2 : 3} value={input} disabled={pending} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><div className="compute-composer-bottom"><span>{mode === "chat" ? "Enter to send · Shift + Enter for a new line" : "Uses Silicon’s recorded market context"}</span>{pending ? <button type="button" className="compute-send" aria-label="Stop response" onClick={() => controller.current?.abort()}><Square size={15} /></button> : <button className="compute-send" type="submit" disabled={!ready || !input.trim()} aria-label="Send message"><ArrowUp size={18} /></button>}</div></form><p className="compute-private-note">Conversations stay in this page session. Prompts go to the selected model provider. {mode !== "chat" && "Check sources and assumptions before acting."}</p></div>
  </section>;
}

export function TerminalAssistant({ market }: { market: Market }) {
  const [open, setOpen] = useState(false);
  return <section className="panel terminal-assistant"><div className="terminal-assistant-heading"><button aria-expanded={open} onClick={() => setOpen(!open)}><MessageSquare size={16} /><span>Ask about {market.name}</span><ChevronDown size={15} className={open ? "rotated" : ""} /></button><Link to={`/compute?view=market&market=${market.id}`}>Open Compute <ArrowUpRight size={13} /></Link></div>{open && <ComputeAssistant key={market.id} mode="market" market={market.id as MarketId} compact />}</section>;
}
