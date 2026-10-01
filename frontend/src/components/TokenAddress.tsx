import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { SILICON_TOKEN } from "../token";
import "../token-address.css";

const { address: SILICON_TOKEN_ADDRESS, explorer: SILICON_TOKEN_EXPLORER } = SILICON_TOKEN;

export function TokenAddress({ landing = false }: { landing?: boolean }) {
  const [status, setStatus] = useState<"" | "copied" | "error">("");
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  return <div className={`token-address${landing ? " token-address-landing" : ""}`} aria-label="Silicon token contract">
    <div className="token-address-label"><span>SILICON · CA</span><span>Robinhood Chain</span></div>
    <div className="token-address-value">
      <a className="token-address-link" href={SILICON_TOKEN_EXPLORER} target="_blank" rel="noreferrer" aria-label={`View Silicon token ${SILICON_TOKEN_ADDRESS} on the explorer`}>
        <code>{SILICON_TOKEN_ADDRESS}</code><ArrowUpRight size={15} aria-hidden="true" />
      </a>
      <button className="token-address-copy" type="button" aria-label="Copy Silicon contract address" title={status === "copied" ? "Copied" : "Copy contract address"} onClick={() => void navigator.clipboard.writeText(SILICON_TOKEN_ADDRESS).then(() => setStatus("copied")).catch(() => setStatus("error"))}>
        {status === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
    </div>
    <span className={status === "error" ? "token-address-error" : "sr-only"} role="status">{status === "copied" ? "Contract address copied" : status === "error" ? "Select the address to copy it manually." : ""}</span>
  </div>;
}
