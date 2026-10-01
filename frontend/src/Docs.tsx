import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand, External } from "./components/ui";
import Atmosphere from "./components/Atmosphere";
import { TokenAddress } from "./components/TokenAddress";

export default function Docs() {
  return (
    <div className="docs">
      <Atmosphere tone="light" />
      <header className="header">
        <Brand />
        <span className="eyebrow">DOCUMENTATION</span>
        <Link to="/terminal" className="button">
          Open terminal
          <ArrowUpRight size={13} />
        </Link>
      </header>
      <div className="docs-layout">
        <aside>
          <Link to="/" className="text-button">
            <ArrowLeft size={12} />
            Back to Silicon
          </Link>
          {[
            ["overview", "Overview"],
            ["reference", "Rental reference"],
            ["monitoring", "Movers and alerts"],
            ["positions", "Calls and puts"],
            ["collateral", "Writer collateral"],
            ["strategies", "Vaults and strategies"],
            ["settlement", "Settlement"],
            ["token", "Token and fees"],
            ["data", "Data and alerts"],
            ["compute", "Compute and assistant"],
            ["status", "Launch status"],
          ].map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
        </aside>
        <main>
          <span className="eyebrow">SILICON / PRODUCT AND MECHANICS</span>
          <h1>know what you’re taking a view on.</h1>
          <p className="docs-lead">
            Start with the cost of renting a GPU. Silicon follows that price.
            Its first contracts take a view on the H100 reference, with a cap
            on what each position can pay out.
          </p>
          <section id="overview">
            <h2>What the product follows</h2>
            <p>
              The underlying is a rental rate, measured in USD per GPU-hour. A
              position does not buy a GPU, rent compute, own a chip or represent
              NVIDIA stock. The app runs on Robinhood Chain. USDG is the settlement
              asset, and ETH covers network fees.
            </p>
            <p>
              Anyone can browse current rates, provider comparisons and market
              information. Trading and vault deposits use USDG and require an active,
              funded contract. Silicon token ownership is optional.
            </p>
          </section>
          <section id="strategies">
            <h2>Vaults, trends and GPU generations</h2>
            <p>A premium vault backs one fixed H100 round with USDG. Deposits close before trading starts. Premiums and fees add to the pool; buyer payouts reduce it. After settlement, depositors redeem their share of the remaining equity. The entire deposit is at risk, and another round requires a new deposit decision.</p>
            <p>The trend builder records an H100 rise or fall thesis over 7, 14 or 30 days. You choose an assumed premium and position size. Silicon fixes the starting price from a source receipt and records the later outcome. The scenario slider does not change those starting terms.</p>
            <p>The generation spread compares B200 and H100 percentage returns from their own starting prices. If B200 rises 10% and H100 rises 5%, B200 outperforms by 5 percentage points. One call unit would pay 5 USDG before subtracting the assumed premium and fee, with a 10 USDG payout cap.</p>
            <p>Trend and spread records are paper strategies. They move no funds and use assumed premiums, excluding network fees and slippage. Results use the first eligible observations within three hours after expiry; missing data cancels the record after 24 hours. Sparse or flat source history cannot establish a profitable strategy. Records are private to the browser cookie; clearing it loses access.</p>
            <p>The B200 comparison reference needs a fixed benchmark before a live spread can launch. Vault deposits and live trades remain unavailable until their contracts, quotes and funding are configured and verified. The strategy screens show those states explicitly.</p>
            <Link className="text-button" to="/terminal/strategies">Explore strategies <ArrowUpRight size={14} /></Link>
          </section>
          <section id="monitoring">
            <h2>GPU movers and background alerts</h2>
            <p>The terminal ranks recorded 24-hour rental price moves. Open Source details to see the latest and baseline receipts, their timestamps, and which matched provider listings changed. Each comparison ends at that GPU’s latest source observation. A stale feed, changed basket or missing daily history withholds the percentage.</p>
            <p>The bell lets you save a price threshold, watch provider listing price changes, or wait for the H100 benchmark to recover. Silicon checks server alerts while your tab is closed. Each rule fires once and expires after 90 days. Threshold alerts fire on the first fresh reading that meets the level, even if it already does when saved. A feed recovery does not open trading.</p>
            <p>Your private browser inbox stores triggered events for 30 days. Browser notifications are optional and require permission and browser support. Failed push delivery leaves the event in the inbox. On iPhone or iPad, use the installed Home Screen app for push. No wallet is required. Clearing site data loses access to this browser’s inbox.</p>
            <p>Server alerts have a separate 20-rule limit. Existing browser alerts keep their 20/100 holder allowances and can be moved to the server. They run while Silicon is open. Provider alerts compare the same listing identity, so coverage changes alone do not trigger a price alert. Collection happens periodically; a change between observations may be missed.</p>
            <Link className="text-button" to="/terminal?alerts=1">Open alert inbox <ArrowUpRight size={14} /></Link>
          </section>
          <section id="reference">
            <h2>The H100 reference</h2>
            <p>
              Methodology <code>silicon-h100-v1</code> takes the median of five
              fixed USD on-demand full-instance listings, expressed per H100 SXM
              GPU-hour:
            </p>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Published configuration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Lambda</td>
                  <td>H100 SXM</td>
                </tr>
                <tr>
                  <td>Hyperstack</td>
                  <td>NVIDIA H100 SXM</td>
                </tr>
                <tr>
                  <td>Verda</td>
                  <td>1H100.80S.30V</td>
                </tr>
                <tr>
                  <td>Crusoe</td>
                  <td>H100 80GB HGX</td>
                </tr>
                <tr>
                  <td>Nebius</td>
                  <td>NVIDIA HGX H100</td>
                </tr>
              </tbody>
            </table>
            <p>
              Each provider has equal weight. These full-instance products can
              include different CPU, memory and service terms; the reference is
              a fixed basket of listed rental costs, not a claim that all
              instances are identical. Quotes are supplied by{" "}
              <External href="https://gpueconomy.com/data">
                GPU Economy
              </External>{" "}
              under{" "}
              <External href="https://creativecommons.org/licenses/by/4.0/">
                CC BY 4.0
              </External>
              , with source links in each asset’s details.
            </p>
            <p>
              All five exact listing identities must be present and confirmed
              within three hours. Spot rates, reserved commitments, non-USD
              listings, GPU-only rates and marketplace floors are excluded. A
              missing or changed constituent withholds a new reference; it is
              never silently replaced.
            </p>
            <p>
              The display index starts at 100 at Silicon’s first observation.
              Each funded series fixes its own starting reference, strike, cap,
              expiry and methodology hash. The other 15 GPU models are comparison
              references using the median of each provider’s cheapest eligible
              region, with at least three distinct providers. They are not initially tradable.
            </p>
          </section>
          <section id="positions">
            <h2>Capped calls and puts</h2>
            <p>
              A call pays for a rise above its strike. A put pays for a fall
              below its strike. A contract caps that payment. The premium and
              platform fee are the buyer’s maximum loss; the buyer has no
              liquidation price or additional margin obligation.
            </p>
            <div className="docs-example">
              <span className="eyebrow">ILLUSTRATION · ONE CALL</span>
              <p>
                Starting index: 100. Premium: 2 USDG. Payout: 1 USDG per point
                above 100, capped at 10 USDG.
              </p>
              <div className="example-row">
                <span>Final index 100 or lower</span>
                <strong>0 USDG</strong>
              </div>
              <div className="example-row">
                <span>Final index 104</span>
                <strong>4 USDG</strong>
              </div>
              <div className="example-row">
                <span>Final index 110 or higher</span>
                <strong>10 USDG</strong>
              </div>
            </div>
            <p>
              A 4 USDG payout is 2 USDG profit before platform fees. Increasing
              size scales premium, payout and required collateral. It does not
              change the percentage move needed to break even. The terminal’s
              calculator is illustrative until it is replaced by the terms of a
              funded series.
            </p>
          </section>
          <section id="collateral">
            <h2>Writers supply the payout.</h2>
            <p>
              Writers deposit USDG into a specific series before trading begins.
              Once the series opens, deposits and withdrawals close until
              settlement. This avoids transferring existing payout risk to a new
              depositor. A later series can accept new collateral.
            </p>
            <p>
              Every filled position reserves its entire maximum payout. Trading
              stops when uncommitted collateral is exhausted. Premiums and
              platform fees stay inside the series and can increase its
              capacity. Writers share the remaining assets after all payouts are
              accounted for, in proportion to their deposits.
            </p>
            <p>
              Writer principal is at risk. Premiums are not guaranteed yield.
              The planned founder contribution is 300 USDG; only an observed
              onchain deposit counts as funded collateral. For scale, 300 USDG
              could conservatively cover 30 positions capped at 10 USDG each,
              before premiums and fees.
            </p>
          </section>
          <section id="settlement">
            <h2>Published result, then claims.</h2>
            <p>
              Each series records its opening reference and a fixed expiry. A
              designated Silicon publisher submits the first eligible
              observation at or after expiry, with a source receipt hash. That
              observation must be within three hours of expiry. This publisher
              is a trusted role; source data is not independently verified by
              the contract.
            </p>
            <p>
              A one-hour challenge window separates result publication and
              finalization. A designated guardian may cancel a disputed result,
              which refunds every buyer’s premium and platform fee. If no final
              result is available within 24 hours of expiry, anyone can cancel
              the series. A challenged series is cancelled rather than repriced.
            </p>
            <p>
              After a finalized result, buyers claim their calculated USDG.
              Writer withdrawals leave enough funds reserved for all unclaimed
              payouts. Claims and withdrawals remain available even if the
              wallet no longer holds Silicon tokens. There is no automatic
              promise to pay losses beyond the funded cap.
            </p>
          </section>
          <section id="token">
            <h2>The SILICON token</h2>
            <p>Silicon Markets ($SILICON) is on Robinhood Chain, chain ID 4663. The token uses 18 decimals and had a total supply of 1 billion SILICON when verified on October 1, 2026.</p>
            <TokenAddress />
            <p>This is the token contract address. USDG settlement and individual market and vault contracts use separate addresses.</p>
            <h2>Open access. Optional holder benefits.</h2>
            <p>Everyone can explore markets, use the calculators, record paper strategies and manage their positions. Live trading and vault deposits need USDG, ETH for gas, and a ready contract. No Silicon holding is required.</p>
            <table><thead><tr><th>Silicon balance</th><th>Trading and deposits</th><th>Platform fee</th></tr></thead><tbody>
              <tr><td>0 to 5,000</td><td>Available when the round is live</td><td>1% of premium</td></tr>
              <tr><td>Strictly above 5,000</td><td>Same access</td><td>0% in rounds supporting the token</td></tr>
            </tbody></table>
            <p>A round fixes its optional benefits token at deployment. Rounds launched without a token charge the standard fee throughout their lifetime. Configuring a token later does not change an existing round. Exactly 5,000 tokens does not qualify for the waiver.</p>
            <p>The contract checks the balance when a trade executes. If that check fails, the standard fee applies, still bounded by the maximum cost you approved. A changed fee cannot silently exceed your reviewed cost. Claims and withdrawals do not require a Silicon holding.</p>
            <p>Qualified holders can keep 100 browser alerts and 50 strategy templates, compare up to 16 GPUs, and export comparison and paper history CSV files. Standard access includes 20 alerts, 10 templates and two-model comparison. Existing saved items remain available after eligibility changes. Alerts work while the terminal is open; templates are browser-local inputs, separate from recorded paper positions.</p>
            <p>The Benefits panel shows verified eligibility and fees waived on confirmed purchases across configured rounds, excluding cancelled rounds. It shows unavailable history honestly. Paper results and hypothetical trades never increase recorded savings.</p>
            <p>Premiums and platform fees stay in the collateral pool for its capital providers and buyer obligations. No token buyback, staking return or reward stream is activated by these benefits. ETH network fees remain separate.</p>
          </section>
          <section id="data">
            <h2>Updates, history and alerts</h2>
            <p>
              The collector checks the published feed every three minutes. The
              upstream source usually refreshes hourly. The terminal receives
              fresh observations and network status over a live connection.
              Prices move only when a source changes.
            </p>
            <p>
              Charts contain observations actually stored by Silicon. 1h, 6h and
              24h changes appear only when the relevant historical observation
              exists. A source refresh is not a price change. The interface
              preserves the last observed price during an outage and labels it
              stale.
            </p>
            <p>
              Price alerts are saved on your current browser and run while
              Silicon is open. They compare your level with the published
              reference. They are not background push notifications or automatic
              trade orders.
            </p>
          </section>
          <section id="compute">
            <h2>Compute, inside Silicon</h2>
            <p>The Compute workspace brings together a model playground, a market assistant, strategy drafting, API keys and usage. Sign in with a wallet message to use your account. Signing in does not authorize a transaction.</p>
            <p>The market assistant receives Silicon’s recorded rental references, provider coverage, source timestamps and contract readiness. Its answers include source links. A recent reference does not establish a tradable quote, and model explanations can be wrong.</p>
            <p>Strategy drafts open in the paper builder with editable assumptions. Supported drafts cover H100 trends and B200 versus H100 spreads over 7, 14 or 30 days. You review the terms and choose whether to record the paper strategy. The assistant cannot place trades.</p>
            <p>Create a Silicon API key under API access to connect a compatible client. Use the displayed base URL with text chat completions, streaming and tool-call messages. Clients run their own local tools; Silicon does not provide a remote shell. Keys are shown once and can be revoked from the same page.</p>
            <p>Model availability and usage limits apply. Usage shows recorded request costs; interrupted requests can stay pending until their cost is checked. Silicon keeps request metadata for accounting, without saving conversation text. Prompts are sent through OpenRouter to the selected model provider. Conversations remain in the current page session and clear when you sign out.</p>
            <Link className="text-button" to="/compute">Open Compute <ArrowUpRight size={14} /></Link>
          </section>
          <section id="status">
            <h2>Launch status</h2>
            <p>
              The public data terminal, payout calculator, paper strategies,
              Compute workspace and SILICON holder tools are available. Live
              options require a verified, funded and unpaused round, a current
              five-provider H100 reference and an executable quote.
            </p>
            <p>
              The Contracts page shows deployed rounds and their current status.
              The initial 100 USDG pilot remains paused while its security-patched,
              token-aware replacement is prepared. Its existing funds and withdrawal
              schedule stay with the original contract. Trend and generation-spread
              strategies remain paper positions. Silicon is an independent project, not
              affiliated with NVIDIA, GPU Economy or the cloud providers shown.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
