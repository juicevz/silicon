import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import { useData } from "../data";
import { money } from "../api";
import { AssetDetail, Benchmark, ProviderTable } from "./MarketViews";
import { AnimatedNumber } from "./AnimatedNumber";
import { AppWindow } from "./AppWindow";
import { hardwareForMarket, hardwareThumbnail } from "./hardwareCatalog";

/** The actual market components, with the same live observations as the terminal. */
export default function TerminalPreview() {
  const { snapshot } = useData();
  const [selected, setSelected] = useState("h100-sxm");
  const [range, setRange] = useState("24h");
  const [info, setInfo] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const markets = snapshot?.markets ?? [];
  const market = markets.find((value) => value.id === selected) ?? markets[0];
  return <AppWindow className="terminal-preview" id="markets" title="silicon / markets"
    action={<Link to={`/terminal?asset=${market?.id ?? "h100-sxm"}`}>Open terminal <ArrowUpRight size={15} /></Link>}>
    <div className="preview-workspace">
      <aside className="preview-market-list" aria-label="GPU rental references">
        <div className="preview-catalog-heading"><span>GPU references</span><small>{markets.length} models</small></div>
        <label className="preview-catalog-search"><Search size={13} /><input aria-label="Find a GPU in the preview" placeholder="Find a GPU" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="preview-catalog-scroll" data-lenis-prevent>
          {markets.filter(value => `${value.name} ${value.architecture}`.toLowerCase().includes(search.toLowerCase())).map((value) => <button type="button" key={value.id} className={`preview-market ${value.id === market?.id ? "active" : ""}`} aria-label={`Preview ${value.name}`} aria-pressed={value.id === market?.id} onClick={() => setSelected(value.id)}>
            <img className="preview-gpu-image" src={hardwareThumbnail(hardwareForMarket(value.id).id)} alt="" width="80" height="55" loading="lazy" />
            <span className="preview-gpu-name">{value.name}<small>{value.memory}</small></span>
            <strong><AnimatedNumber value={value.price == null ? "—" : `$${money(value.price, 3)}`} /><small>/hr</small></strong>
          </button>)}
          {!markets.some(value => `${value.name} ${value.architecture}`.toLowerCase().includes(search.toLowerCase())) && <p className="preview-no-results">No matching GPUs.</p>}
        </div>
        <Link className="preview-source-link" to="/docs#reference">How the reference works <ArrowUpRight size={13} /></Link>
      </aside>
      <div className="preview-main">
        {market ? <>
          <Benchmark market={market} range={range} setRange={setRange} info={() => setInfo(true)} alert={() => navigate(`/terminal?asset=${market.id}`)} />
          <ProviderTable market={market} />
        </> : <div className="preview-pending" role="status">Connecting to rental references…</div>}
      </div>
    </div>
    {info && market && <AssetDetail market={market} close={() => setInfo(false)} />}
  </AppWindow>;
}
