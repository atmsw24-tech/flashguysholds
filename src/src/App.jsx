import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bolt,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  ExternalLink,
  Flame,
  Globe2,
  Layers3,
  Menu,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const DEMO_TOKENS = [
  {
    id: "sol-flash",
    name: "Flash",
    symbol: "FLASH",
    chain: "solana",
    price: 0.000184,
    change24h: 148.7,
    volume24h: 2845000,
    liquidity: 612000,
    ageMinutes: 24,
    holders: 1842,
    address: "DemoSol1111111111111111111111111111111111111"
  },
  {
    id: "sol-guy",
    name: "Flash Guy",
    symbol: "GUY",
    chain: "solana",
    price: 0.00291,
    change24h: 74.3,
    volume24h: 1940000,
    liquidity: 421000,
    ageMinutes: 87,
    holders: 4211,
    address: "DemoSol2222222222222222222222222222222222222"
  },
  {
    id: "sol-speed",
    name: "Speed Mode",
    symbol: "SPEED",
    chain: "solana",
    price: 0.000047,
    change24h: 39.4,
    volume24h: 875000,
    liquidity: 192000,
    ageMinutes: 133,
    holders: 1022,
    address: "DemoSol3333333333333333333333333333333333333"
  },
  {
    id: "sol-scout",
    name: "Early Scout",
    symbol: "SCOUT",
    chain: "solana",
    price: 0.00083,
    change24h: 21.8,
    volume24h: 640000,
    liquidity: 144000,
    ageMinutes: 248,
    holders: 863,
    address: "DemoSol4444444444444444444444444444444444444"
  },
  {
    id: "rh-flash",
    name: "Flash Chain",
    symbol: "FLC",
    chain: "robinhood",
    price: 0.0142,
    change24h: 126.2,
    volume24h: 3410000,
    liquidity: 921000,
    ageMinutes: 41,
    holders: 2391,
    address: "0xDemo111111111111111111111111111111111111"
  },
  {
    id: "rh-cat",
    name: "Chain Cat",
    symbol: "CAT",
    chain: "robinhood",
    price: 0.00072,
    change24h: 67.9,
    volume24h: 1260000,
    liquidity: 338000,
    ageMinutes: 114,
    holders: 1872,
    address: "0xDemo222222222222222222222222222222222222"
  },
  {
    id: "rh-speed",
    name: "Fast Lane",
    symbol: "LANE",
    chain: "robinhood",
    price: 0.0068,
    change24h: 43.1,
    volume24h: 918000,
    liquidity: 246000,
    ageMinutes: 187,
    holders: 921,
    address: "0xDemo333333333333333333333333333333333333"
  },
  {
    id: "rh-open",
    name: "Open Market",
    symbol: "OPEN",
    chain: "robinhood",
    price: 0.00114,
    change24h: 18.4,
    volume24h: 512000,
    liquidity: 127000,
    ageMinutes: 321,
    holders: 704,
    address: "0xDemo444444444444444444444444444444444444"
  },
  {
    id: "sol-moon",
    name: "Moon Signal",
    symbol: "MOON",
    chain: "solana",
    price: 0.0000128,
    change24h: -8.2,
    volume24h: 412000,
    liquidity: 89000,
    ageMinutes: 390,
    holders: 622,
    address: "DemoSol5555555555555555555555555555555555555"
  },
  {
    id: "rh-zero",
    name: "Zero Hour",
    symbol: "ZERO",
    chain: "robinhood",
    price: 0.000091,
    change24h: -14.8,
    volume24h: 298000,
    liquidity: 67000,
    ageMinutes: 512,
    holders: 410,
    address: "0xDemo555555555555555555555555555555555555"
  }
];

const chainLabels = {
  all: "All Chains",
  solana: "Solana",
  robinhood: "Robinhood Chain"
};

const views = [
  { id: "trending", label: "Trending", icon: Flame },
  { id: "new", label: "New", icon: Sparkles },
  { id: "gainers", label: "Gainers", icon: TrendingUp },
  { id: "volume", label: "Volume", icon: BarChart3 }
];

function formatMoney(value) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }

  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }

  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }

  if (value >= 0.01) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toFixed(8)}`;
}

function formatAge(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function shortenAddress(address) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function chainName(chain) {
  return chain === "solana" ? "Solana" : "Robinhood Chain";
}

function ChainBadge({ chain }) {
  return (
    <span className={`chain-badge ${chain}`}>
      <span className="chain-dot" />
      {chainName(chain)}
    </span>
  );
}

function TokenIcon({ token }) {
  return (
    <div className={`token-icon ${token.chain}`}>
      {token.symbol.slice(0, 2)}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        <Icon size={18} />
      </div>

      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {detail && <div className="stat-detail">{detail}</div>}
      </div>
    </div>
  );
}

function App() {
  const [tokens, setTokens] = useState(DEMO_TOKENS);
  const [activeChain, setActiveChain] = useState("all");
  const [activeView, setActiveView] = useState("trending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [apiStatus, setApiStatus] = useState("demo");

  async function loadTokens() {
    setLoading(true);

    try {
      const query = activeChain === "all" ? "" : `?chain=${activeChain}`;
      const response = await fetch(`${API_BASE}/tokens${query}`);

      if (!response.ok) {
        throw new Error("API unavailable");
      }

      const data = await response.json();

      if (Array.isArray(data.tokens) && data.tokens.length > 0) {
        setTokens(data.tokens);
        setApiStatus(data.source || "api");
      } else {
        setTokens(DEMO_TOKENS);
        setApiStatus("demo");
      }
    } catch {
      const fallback =
        activeChain === "all"
          ? DEMO_TOKENS
          : DEMO_TOKENS.filter((token) => token.chain === activeChain);

      setTokens(fallback);
      setApiStatus("demo");
    } finally {
      setLastUpdated(new Date());
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTokens();
  }, [activeChain]);

  const filteredTokens = useMemo(() => {
    let result = [...tokens];

    const normalizedSearch = search.trim().toLowerCase();

    if (normalizedSearch) {
      result = result.filter(
        (token) =>
          token.name.toLowerCase().includes(normalizedSearch) ||
          token.symbol.toLowerCase().includes(normalizedSearch) ||
          token.address.toLowerCase().includes(normalizedSearch)
      );
    }

    if (activeView === "new") {
      result.sort((a, b) => a.ageMinutes - b.ageMinutes);
    }

    if (activeView === "gainers") {
      result.sort((a, b) => b.change24h - a.change24h);
    }

    if (activeView === "volume") {
      result.sort((a, b) => b.volume24h - a.volume24h);
    }

    if (activeView === "trending") {
      result.sort((a, b) => {
        const scoreA = a.change24h * 0.5 + Math.log10(a.volume24h + 1) * 10;
        const scoreB = b.change24h * 0.5 + Math.log10(b.volume24h + 1) * 10;
        return scoreB - scoreA;
      });
    }

    return result;
  }, [tokens, activeView, search]);

  const totalVolume = tokens.reduce(
    (sum, token) => sum + Number(token.volume24h || 0),
    0
  );

  const totalLiquidity = tokens.reduce(
    (sum, token) => sum + Number(token.liquidity || 0),
    0
  );

  const newTokens = tokens.filter((token) => token.ageMinutes < 180).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand"
            onClick={() => {
              setActiveView("trending");
              setActiveChain("all");
              setSearch("");
            }}
          >
            <div className="brand-mark">
              <Zap size={20} fill="currentColor" />
            </div>

            <div>
              <div className="brand-name">FLASHGUYS</div>
              <div className="brand-tagline">
                Discover what moves before everyone.
              </div>
            </div>
          </button>

          <nav className={`main-nav ${menuOpen ? "open" : ""}`}>
            <button className="nav-link active">Discover</button>
            <button
              className="nav-link"
              onClick={() => setShowLaunch(true)}
            >
              Launch
            </button>
            <button className="nav-link">Watchlist</button>
          </nav>

          <div className="top-actions">
            <button className="icon-button" title="Notifications">
              <Bell size={18} />
            </button>

            <button
              className="launch-button"
              onClick={() => setShowLaunch(true)}
            >
              <Rocket size={16} />
              Prepare Launch
            </button>

            <button
              className="mobile-menu"
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span className="live-dot" />
              ON-CHAIN DISCOVERY
            </div>

            <h1>
              Find the move
              <br />
              <span>before the crowd.</span>
            </h1>

            <p>
              Explore emerging tokens across Solana and Robinhood Chain.
              Track new launches, momentum, liquidity and volume from one
              independent discovery dashboard.
            </p>
          </div>

          <div className="hero-panel">
            <div className="hero-panel-header">
              <span>Network activity</span>
              <span className="live-pill">
                <Activity size={13} />
                LIVE CONCEPT
              </span>
            </div>

            <div className="activity-line">
              <div className="activity-bars">
                {[35, 50, 42, 65, 54, 78, 62, 88, 70, 94, 76, 100].map(
                  (height, index) => (
                    <span
                      key={index}
                      style={{ height: `${height}%` }}
                    />
                  )
                )}
              </div>

              <div className="activity-number">24/7</div>
              <div className="activity-caption">
                Discovery engine ready
              </div>
            </div>
          </div>
        </section>

        <section className="notice">
          <ShieldCheck size={17} />

          <span>
            <strong>Independent platform.</strong> FLASHGUYS is not affiliated
            with, endorsed by, or operated by Robinhood.
          </span>

          <span className="notice-chain">
            Robinhood Chain = chain network
          </span>
        </section>

        <section className="stats-grid">
          <StatCard
            icon={Layers3}
            label="Tracked Tokens"
            value={tokens.length}
            detail={`${activeChain === "all" ? "Both networks" : chainLabels[activeChain]}`}
          />

          <StatCard
            icon={BarChart3}
            label="24h Volume"
            value={formatMoney(totalVolume)}
            detail="Demo discovery dataset"
          />

          <StatCard
            icon={CircleDollarSign}
            label="Liquidity"
            value={formatMoney(totalLiquidity)}
            detail="Across displayed tokens"
          />

          <StatCard
            icon={Sparkles}
            label="Fresh Tokens"
            value={newTokens}
            detail="Under 3 hours old"
          />
        </section>

        <section className="control-panel">
          <div className="chain-tabs">
            {Object.entries(chainLabels).map(([key, label]) => (
              <button
                key={key}
                className={`chain-tab ${activeChain === key ? "active" : ""}`}
                onClick={() => setActiveChain(key)}
              >
                {key === "all" && <Globe2 size={15} />}
                {key === "solana" && <span className="tiny-solana">S</span>}
                {key === "robinhood" && <Layers3 size={15} />}
                {label}
              </button>
            ))}
          </div>

          <div className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search token, symbol or contract..."
            />

            {search && (
              <button
                className="clear-search"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </section>

        <section className="market-section">
          <div className="section-heading">
            <div>
              <div className="section-kicker">MARKET SCANNER</div>
              <h2>Token discovery</h2>
            </div>

            <div className="updated">
              <Clock3 size={14} />
              Updated {lastUpdated.toLocaleTimeString()}
            </div>
          </div>

          <div className="view-tabs">
            {views.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`view-tab ${activeView === id ? "active" : ""}`}
                onClick={() => setActiveView(id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <div className="token-table header">
              <div>Token</div>
              <div>Price</div>
              <div>24h</div>
              <div>Volume</div>
              <div>Liquidity</div>
              <div>Age</div>
              <div />
            </div>

            {loading && (
              <div className="loading-row">
                <div className="loader" />
                Updating discovery feed...
              </div>
            )}

            {!loading &&
              filteredTokens.map((token) => (
                <div className="token-table token-row" key={token.id}>
                  <div className="token-cell">
                    <TokenIcon token={token} />

                    <div className="token-info">
                      <div className="token-title">
                        {token.name}
                        {token.ageMinutes < 60 && (
                          <span className="new-tag">NEW</span>
                        )}
                      </div>

                      <div className="token-meta">
                        <span>{token.symbol}</span>
                        <ChainBadge chain={token.chain} />
                      </div>
                    </div>
                  </div>

                  <div className="price-cell">
                    {formatMoney(Number(token.price))}
                  </div>

                  <div
                    className={`change-cell ${
                      Number(token.change24h) >= 0 ? "positive" : "negative"
                    }`}
                  >
                    {Number(token.change24h) >= 0 ? "+" : ""}
                    {Number(token.change24h).toFixed(1)}%
                  </div>

                  <div>{formatMoney(Number(token.volume24h))}</div>

                  <div>{formatMoney(Number(token.liquidity))}</div>

                  <div className="age-cell">
                    <Clock3 size={14} />
                    {formatAge(Number(token.ageMinutes))}
                  </div>

                  <div>
                    <button className="row-action" title="Open token">
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </div>
              ))}

            {!loading && filteredTokens.length === 0 && (
              <div className="empty-state">
                <Search size={30} />
                <h3>No tokens found</h3>
                <p>Try another token name, symbol or contract address.</p>
              </div>
            )}
          </div>
        </section>

        <section className="discovery-grid">
          <div className="discovery-card">
            <div className="card-icon">
              <Bolt size={19} />
            </div>

            <div>
              <div className="card-label">EARLY SIGNALS</div>
              <h3>Built for the first wave.</h3>
              <p>
                The discovery layer is designed to surface fresh contracts,
                unusual volume, liquidity changes and momentum as real-time
                indexers are connected.
              </p>
            </div>
          </div>

          <div className="discovery-card">
            <div className="card-icon">
              <Database size={19} />
            </div>

            <div>
              <div className="card-label">DATA LAYER</div>
              <h3>One dashboard. Multiple chains.</h3>
              <p>
                Solana uses its native account/program model while Robinhood
                Chain uses EVM-compatible contract data. Both can feed the same
                normalized token model.
              </p>
            </div>
          </div>

          <div className="discovery-card">
            <div className="card-icon">
              <Rocket size={19} />
            </div>

            <div>
              <div className="card-label">LAUNCH PREP</div>
              <h3>Prepare before you publish.</h3>
              <p>
                Keep launch configuration, token metadata and deployment
                preparation separate from the public discovery interface.
              </p>

              <button
                className="text-button"
                onClick={() => setShowLaunch(true)}
              >
                Open launch preparation
                <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </section>

        <section className="data-status">
          <div className="status-left">
            <span
              className={`status-dot ${
                apiStatus === "demo" ? "demo" : "live"
              }`}
            />

            <span>
              Data source:{" "}
              <strong>
                {apiStatus === "demo"
                  ? "Demo / fallback dataset"
                  : "API discovery endpoint"}
              </strong>
            </span>
          </div>

          <span>
            Live chain indexing will replace fallback data after providers are
            configured.
          </span>
        </section>
      </main>

      <footer className="footer">
        <div>
          <strong>FLASHGUYS</strong>
          <span>Independent on-chain discovery.</span>
        </div>

        <div className="footer-links">
          <span>Solana</span>
          <span>Robinhood Chain</span>
          <span>Discovery</span>
          <span>Launch</span>
        </div>
      </footer>

      {showLaunch && (
        <div
          className="modal-backdrop"
          onClick={() => setShowLaunch(false)}
        >
          <div
            className="launch-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="section-kicker">FLASHGUYS LABS</div>
                <h2>Launch preparation</h2>
              </div>

              <button
                className="icon-button"
                onClick={() => setShowLaunch(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="launch-warning">
              <ShieldCheck size={17} />
              <span>
                This interface prepares launch information. It does not store
                or request private keys or seed phrases.
              </span>
            </div>

            <div className="form-grid">
              <label>
                Token name
                <input placeholder="FLASHGUYS" />
              </label>

              <label>
                Symbol
                <input placeholder="FLASH" />
              </label>

              <label>
                Network
                <select defaultValue="solana">
                  <option value="solana">Solana</option>
                  <option value="robinhood">Robinhood Chain</option>
                </select>
              </label>

              <label>
                Initial supply
                <input placeholder="1,000,000,000" />
              </label>

              <label className="full">
                Description
                <textarea
                  rows="4"
                  placeholder="Describe the project..."
                />
              </label>
            </div>

            <div className="modal-footer">
              <span>
                Private deployment credentials stay server-side.
              </span>

              <button
                className="primary-button"
                onClick={() => setShowLaunch(false)}
              >
                Save preparation
                <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
