import {
  ArrowUpRight,
  ChevronDown,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Brand, Modal } from "./ui";
import { useWallet } from "../wallet";
import { short } from "../api";
import { ThemeToggle } from "./ThemeToggle";

export const TABS = [
  "Markets",
  "Contracts",
  "Strategies",
  "Activity",
  "Leaderboard",
] as const;
export function Header({
  landing = false,
  notify,
}: {
  landing?: boolean;
  notify: (message: string) => void;
}) {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false),
    [account, setAccount] = useState(false);
  const connect = async () => {
    try {
      await wallet.connect();
      if (landing) navigate("/terminal");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <header className={`header ${landing ? "landing-header" : ""}`}>
      <Brand />
      {landing ? (
        <nav className="landing-nav">
          <a href="/#markets">Markets</a>
          <a href="/#how-it-works">How it works</a>
          <button
            className="about-toggle"
            onClick={() => setMenu(true)}
            aria-haspopup="dialog"
            aria-expanded={menu}
          >
            About <Plus size={17} />
          </button>
        </nav>
      ) : (
        <nav className={`terminal-nav ${menu ? "open" : ""}`}>
          {TABS.map((tab) => (
            <NavLink
              onClick={() => setMenu(false)}
              key={tab}
              to={
                tab === "Markets"
                  ? "/terminal"
                  : `/terminal/${tab.toLowerCase()}`
              }
              end
            >
              {tab}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="header-right">
        {landing && <ThemeToggle />}
        {!landing && (
          <Link className="header-docs" to="/docs">
            Docs
            <ArrowUpRight size={12} />
          </Link>
        )}
        {landing ? (
          <Link className="button primary material-button" to="/terminal">
            <span className="mini-wafer" aria-hidden="true" />
            <span>Open terminal</span><ArrowUpRight size={17} />
          </Link>
        ) : wallet.address ? (
          <div className="wallet-menu">
            <button
              className="button wallet-button"
              onClick={() => setAccount(!account)}
            >
              <span className="wallet-avatar" />
              {short(wallet.address)}
              <ChevronDown size={12} />
            </button>
            {account && (
              <div className="account-dropdown">
                <span className="eyebrow">Connected wallet</span>
                <span className="mono">{short(wallet.address)}</span>
                <button
                  onClick={() => {
                    wallet.disconnect();
                    setAccount(false);
                  }}
                >
                  <LogOut size={13} />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            className={`button ${landing ? "primary" : "wallet-button"}`}
            onClick={() => void connect()}
            disabled={wallet.busy}
          >
            {wallet.busy ? (
              <Loader2 size={14} className="spin" />
            ) : landing ? (
              <ArrowUpRight size={14} />
            ) : (
              <Wallet size={14} />
            )}
            <span>
              {wallet.busy
                ? "Connecting…"
                : landing
                  ? "Access terminal"
                  : "Connect wallet"}
            </span>
          </button>
        )}
        {!landing && (
          <button
            onClick={() => setMenu(!menu)}
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
          >
            {menu ? <X size={19} /> : <Menu size={19} />}
          </button>
        )}
      </div>
      {landing && menu && (
        <div className="site-menu">
          <Modal
            title="Explore Silicon"
            appearance="site-menu"
            close={() => setMenu(false)}
            wide
          >
            <div className="site-menu-grid">
              <Link onClick={() => setMenu(false)} to="/terminal">
                <span>
                  Markets <ArrowUpRight size={24} />
                </span>
              </Link>
              <Link onClick={() => setMenu(false)} to="/terminal/contracts">
                <span>
                  Contracts <ArrowUpRight size={24} />
                </span>
              </Link>
              <Link onClick={() => setMenu(false)} to="/docs">
                <span>
                  Documentation <ArrowUpRight size={24} />
                </span>
              </Link>
            </div>
          </Modal>
        </div>
      )}
    </header>
  );
}
