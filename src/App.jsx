import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchGMGNTokens } from "./marketData";
import { startLiveFeeds, subscribeLiveToken } from "./liveFeeds";
import AccountPanel from "./AccountPanel";
import "./styles.css";

const MAX_VISIBLE_TOKENS = 50;

function formatNumber(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) {
    return `$${(number / 1_000_000_000).toFixed(2)}B`;
  }

  if (number >= 1_000_000) {
    return `$${(number / 1_000_000).toFixed(2)}M`;
  }

  if (number >= 1_000) {
    return `$${(number / 1_000).toFixed(1)}K`;
  }

  return `$${number.toFixed(0)}`;
}

function formatPrice(value) {
  const number = Number(value || 0);

  if (number === 0) return "$0";

  if (number < 0.000001) {
    return `$${number.toExponential(2)}`;
  }

  if (number < 0.01) {
    return `$${number.toFixed(6)}`;
  }

  if (number < 1) {
    return `$${number.toFixed(4)}`;
  }

  return `$${number.toFixed(2)}`;
}

function formatAge(createdAt) {
  const time = Number(createdAt || Date.now());
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - time) / 60000)
  );

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function TokenLogo({ token }) {
  const [imageError, setImageError] = useState(false);

  if (token.logo && !imageError) {
    return (
      <div className="token-logo">
        <img
          src={token.logo}
          alt={token.symbol || token.name || "Token"}
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  const letter =
    (token.symbol || token.name || "?")
      .charAt(0)
      .toUpperCase();

  return <div className="token-logo">{letter}</div>;
}

function TokenRow({ token, onClick }) {
  const change = Number(token.change24h || 0);

  return (
    <tr
      className="token-row"
      onClick={() => onClick(token)}
      style={{ cursor: "pointer" }}
    >
      <td>
        <div className="token-name">
          <TokenLogo token={token} />

          <div>
            <strong>
              {token.name || "Unknown Token"}
            </strong>

            <div className="token-symbol">
              ${token.symbol || "UNKNOWN"}
            </div>
          </div>
        </div>
      </td>

      <td>
        <span className="chain-badge">
          {token.chain === "robinhood"
            ? "Robinhood"
            : "Solana"}
        </span>
      </td>

      <td>{formatPrice(token.price)}</td>

      <td>{formatNumber(token.marketCap)}</td>

      <td>{formatNumber(token.liquidity)}</td>

      <td>{formatNumber(token.volume1h)}</td>

      <td>{Number(token.holders || 0).toLocaleString()}</td>

      <td
        style={{
          color: change >= 0 ? "#55d88a" : "#ff6f7d",
          fontWeight: 700
        }}
      >
        {change >= 0 ? "+" : ""}
        {change.toFixed(1)}%
      </td>

      <td>{formatAge(token.createdAt)}</td>
    </tr>
  );
}

function PriceChart({ token }) {
  const [history, setHistory] = useState([]);
  const [chartError, setChartError] = useState("");
  const [chartLoading, setChartLoading] = useState(true);
  const [livePrice, setLivePrice] = useState(Number(token?.price || 0));
  const [updatedAt, setUpdatedAt] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const mint = token?.address || token?.mint;
    const isSolana = token?.chain === "solana" || token?.chain === "sol" || !token?.chain;

    if (!mint || !isSolana) {
      setHistory([]);
      setChartLoading(false);
      setLiveConnected(false);
      setChartError(!mint ? "Token address is missing." : "Real-time trade chart is currently supported for Solana tokens only.");
      return undefined;
    }

    const appendPoint = (price, time = Date.now()) => {
      const value = Number(price);
      if (!(value > 0) || !Number.isFinite(value)) return;
      setLivePrice(value);
      setHistory((previous) => {
        const next = [...previous, { time: Number(time) || Date.now(), price: value }]
          .filter((point) => Number.isFinite(point.time) && point.price > 0)
          .sort((a, b) => a.time - b.time);
        // Keep actual provider history plus recent real-time updates.
        return next.slice(-180);
      });
      setUpdatedAt(new Date());
      setChartError("");
    };

    const handleLiveUpdate = (event) => {
      const update = event?.detail;
      const updateMint = String(update?.mint || "").toLowerCase();
      if (!updateMint || updateMint !== String(mint).toLowerCase()) return;
      const price = Number(update.price);
      if (price > 0) {
        appendPoint(price, Number(update.timestamp) > 0
          ? Number(update.timestamp) * 1000
          : Date.now());
        setLiveConnected(true);
      }
    };

    window.addEventListener("flashguys:solana-update", handleLiveUpdate);
    const subscribed = subscribeLiveToken(mint);
    setLiveConnected(Boolean(subscribed));

    async function loadInitialHistory() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(
          `/api/chart?address=${encodeURIComponent(mint)}&chain=sol&_=${Date.now()}`,
          { cache: "no-store", headers: { Accept: "application/json" } }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Market data unavailable");
        if (cancelled) return;
        if (Number(data.price) > 0) setLivePrice(Number(data.price));
        const points = Array.isArray(data.history) ? data.history
          .map((point) => ({ time: Number(point.time), price: Number(point.price) }))
          .filter((point) => point.time > 0 && point.price > 0) : [];
        if (points.length) {
          setHistory((previous) => {
            const merged = new Map();
            [...points, ...previous].forEach((point) => merged.set(point.time, point));
            return [...merged.values()].sort((a, b) => a.time - b.time).slice(-180);
          });
        } else if (Number(data.price) > 0) {
          appendPoint(Number(data.price));
        }
        setUpdatedAt(new Date());
        if (data.historyWarning) setChartError(data.historyWarning);
      } catch (error) {
        if (!cancelled) setChartError(error?.message || "Could not load market data.");
      } finally {
        inFlight = false;
        if (!cancelled) setChartLoading(false);
      }
    }

    loadInitialHistory();
    // Fallback price refresh; the live socket above is the primary chart update source.
    const fallback = setInterval(loadInitialHistory, 10000);
    return () => {
      cancelled = true;
      clearInterval(fallback);
      window.removeEventListener("flashguys:solana-update", handleLiveUpdate);
    };
  }, [token?.address, token?.mint, token?.chain]);

  const values = history
    .map((item) => ({ time: Number(item?.time || Date.now()), price: Number(item?.price ?? item?.value ?? item) }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0);

  if (values.length < 2) {
    return (
      <div className="chart-empty">
        {chartLoading ? "Connecting to live market data..." : (chartError || "Waiting for live market updates.")}
      </div>
    );
  }

  const width = 700;
  const height = 220;
  const padding = 12;
  const min = Math.min(...values.map((point) => point.price));
  const max = Math.max(...values.map((point) => point.price));
  const range = max - min || Math.max(max * 0.002, 0.000000001);
  const points = values.map((point, index) => {
    const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.price - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px", fontSize: "12px" }}>
        <strong>Live price: {formatPrice(livePrice)}</strong>
        <span style={{ color: liveConnected ? "#16a34a" : "#7b8493" }}>
          {liveConnected ? "LIVE FEED" : (updatedAt ? `Last update ${updatedAt.toLocaleTimeString()}` : "Connecting...")}
        </span>
      </div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Live Solana token price chart">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ fontSize: "11px", color: "#7b8493", marginTop: "6px" }}>
        Updates from the live token feed when new market updates arrive.
      </div>
      {chartError ? <div className="chart-empty">{chartError}</div> : null}
    </div>
  );
}

function TokenModal({ token, onClose }) {
  if (!token) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="modal-header">
          <div className="modal-title">
            <TokenLogo token={token} />

            <div>
              <h2>
                {token.name || "Unknown Token"}
              </h2>

              <div className="token-symbol">
                ${token.symbol || "UNKNOWN"}
              </div>
            </div>
          </div>

          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-label">
                Price
              </div>

              <div className="stat-value">
                {formatPrice(token.price)}
              </div>
            </div>

            <div className="stat">
              <div className="stat-label">
                Market Cap
              </div>

              <div className="stat-value">
                {formatNumber(token.marketCap)}
              </div>
            </div>

            <div className="stat">
              <div className="stat-label">
                Liquidity
              </div>

              <div className="stat-value">
                {formatNumber(token.liquidity)}
              </div>
            </div>

            <div className="stat">
              <div className="stat-label">
                Holders
              </div>

              <div className="stat-value">
                {Number(
                  token.holders || 0
                ).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">
              Price Chart
            </div>

            <PriceChart token={token} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LaunchPage() {
  return (
    <div className="launch-page">
      <h1>Launch a Token</h1>

      <p>
        Choose a launch ecosystem for your
        project.
      </p>

      <div className="launch-options">
        <div className="launch-option">
          <h3>Solana</h3>

          <p>
            Launch through a supported Solana
            token launch platform.
          </p>

          <a
            className="launch-button"
            href="https://pump.fun/"
            target="_blank"
            rel="noreferrer"
          >
            Open Pump.fun
          </a>
        </div>

        <div className="launch-option">
          <h3>Robinhood Chain</h3>

          <p>
            Explore the Robinhood Chain ecosystem
            and its token infrastructure.
          </p>

          <button
            className="launch-button"
            onClick={() =>
              alert(
                "Robinhood Chain launch tools will be added here."
              )
            }
          >
            Coming Soon
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] =
    useState("discover");

  const [chain, setChain] =
    useState("all");

  const [tokens, setTokens] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [selectedToken, setSelectedToken] =
    useState(null);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [liveLaunchCount, setLiveLaunchCount] = useState(0);
  const seenLiveLaunches = useRef(new Set());

  const [accountOpen, setAccountOpen] = useState(false);

  // Count unique launch events from the live feed during this browser session.
  useEffect(() => {
    const handleNewLaunch = (event) => {
      const mint = String(event?.detail?.mint || "").trim().toLowerCase();
      if (!mint || seenLiveLaunches.current.has(mint)) return;
      seenLiveLaunches.current.add(mint);
      setLiveLaunchCount(seenLiveLaunches.current.size);
    };
    window.addEventListener("flashguys:new-launch", handleNewLaunch);
    return () => window.removeEventListener("flashguys:new-launch", handleNewLaunch);
  }, []);

  // Start the real-time Solana socket once for the whole app.
  useEffect(() => {
    const stop = startLiveFeeds({
      onToken: (newToken) => {
        if (!newToken?.address) return;
        setTokens((previous) => {
          const exists = previous.some((item) => item.address === newToken.address);
          if (exists) return previous.map((item) =>
            item.address === newToken.address ? { ...item, ...newToken } : item
          );
          return [newToken, ...previous].slice(0, MAX_VISIBLE_TOKENS * 3);
        });
      },
      onUpdate: (update) => {
        if (!update?.mint) return;
        const applyUpdate = (item) => {
          if (String(item.address || item.mint || "").toLowerCase() !== String(update.mint).toLowerCase()) return item;
          return {
            ...item,
            ...(Number(update.price) > 0 ? { price: Number(update.price) } : {}),
            ...(Number(update.marketCap) > 0 ? { marketCap: Number(update.marketCap) } : {}),
            ...(Number(update.volume24h) > 0 ? { volume24h: Number(update.volume24h) } : {}),
            ...(Number(update.liquidity) > 0 ? { liquidity: Number(update.liquidity) } : {}),
            ...(Number(update.change24h) ? { change24h: Number(update.change24h) } : {}),
            live: true
          };
        };
        setTokens((previous) => previous.map(applyUpdate));
        setSelectedToken((previous) => previous ? applyUpdate(previous) : previous);
      },
      onStatus: (status) => {
        console.log("FLASHGUYS live feed status:", status);
      },
      onError: (err) => {
        console.warn("FLASHGUYS live feed unavailable:", err?.message || err);
      }
    });
    return () => stop?.();
  }, []);

  async function loadTokens() {
    try {
      setLoading(true);
      setError("");

      const data =
        await fetchGMGNTokens(chain);

      // Merge API results with live launches instead of erasing launches
      // received from the socket between polling requests.
      const apiTokens = Array.isArray(data) ? data : [];
      setTokens((previous) => {
        const merged = new Map();
        apiTokens.forEach((token) => {
          const key = String(token.address || token.mint || token.id || "").toLowerCase();
          if (key) merged.set(key, token);
        });
        previous.forEach((token) => {
          const key = String(token.address || token.mint || token.id || "").toLowerCase();
          if (!key) return;
          const current = merged.get(key);
          merged.set(key, current ? { ...token, ...current } : token);
        });
        return [...merged.values()].sort((a, b) => Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0)).slice(0, MAX_VISIBLE_TOKENS * 3);
      });

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to load tokens."
      );

      setTokens([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (page !== "discover") {
      return;
    }

    loadTokens();

    const interval = setInterval(
      loadTokens,
      10000
    );

    return () => clearInterval(interval);
  }, [chain, page]);

  const filteredTokens = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    let result = [...tokens];

    if (chain !== "all") {
      result = result.filter(
        (token) =>
          token.chain === chain
      );
    }

    if (query) {
      result = result.filter((token) => {
        const name =
          token.name?.toLowerCase() || "";

        const symbol =
          token.symbol?.toLowerCase() || "";

        return (
          name.includes(query) ||
          symbol.includes(query)
        );
      });
    }

    result.sort(
      (a, b) =>
        Number(b.createdAt || 0) -
        Number(a.createdAt || 0)
    );

    return result.slice(
      0,
      MAX_VISIBLE_TOKENS
    );
  }, [tokens, chain, search]);

  return (
    <div className="app">
      <header className="header">
        <button
          className="logo"
          onClick={() =>
            setPage("discover")
          }
          style={{
            border: 0,
            background: "transparent",
            color: "inherit",
            cursor: "pointer"
          }}
        >
          <span className="logo-mark">
            F
          </span>

          FLASHGUYS
        </button>

        <nav className="nav">
          <button
            className={
              page === "discover"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("discover")
            }
          >
            Discover
          </button>

          <button
            className={
              page === "launch"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("launch")
            }
          >
            Launch
          </button>
        </nav>
        <button className="account-open-button" onClick={() => setAccountOpen(true)}>
          <span className="account-open-icon">↗</span> Account / Connect Wallet
        </button>
      </header>

      <main className="main">
        {page === "launch" ? (
          <LaunchPage />
        ) : (
          <>
            <section className="hero">
              <h1>
                Find the{" "}
                <span>
                  move
                </span>{" "}
                before the crowd.
              </h1>

              <p>
                Discover new tokens across
                Solana and Robinhood Chain
                in one place.
              </p>
            </section>

            <section className="controls">
              <div className="chain-tabs">
                <button
                  className={
                    chain === "all"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setChain("all")
                  }
                >
                  All
                </button>

                <button
                  className={
                    chain === "sol"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setChain("sol")
                  }
                >
                  Solana
                </button>

                <button
                  className={
                    chain === "robinhood"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setChain("robinhood")
                  }
                >
                  Robinhood
                </button>
              </div>

              <input
                className="search"
                type="search"
                placeholder="Search tokens..."
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />
            </section>

            <section className="token-card">
              {loading ? (
                <div className="status">
                  Loading tokens...
                </div>
              ) : error ? (
                <div className="status error">
                  {error}
                </div>
              ) : filteredTokens.length ===
                0 ? (
                <div className="status">
                  No tokens found.
                </div>
              ) : (
                <table className="token-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Chain</th>
                      <th>Price</th>
                      <th>Market Cap</th>
                      <th>Liquidity</th>
                      <th>Volume 1h</th>
                      <th>Holders</th>
                      <th>24h</th>
                      <th>Age</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredTokens.map(
                      (token) => (
                        <TokenRow
                          key={
                            token.id ||
                            `${token.chain}-${token.symbol}`
                          }
                          token={token}
                          onClick={
                            setSelectedToken
                          }
                        />
                      )
                    )}
                  </tbody>
                </table>
              )}
            </section>

            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent:
                  "space-between",
                color: "#626c7b",
                fontSize: "12px"
              }}
            >
              <span>
                Showing {filteredTokens.length} tokens · Live launches detected this session: {liveLaunchCount}
              </span>

              <span>
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString()}`
                  : ""}
              </span>
            </div>
          </>
        )}
      </main>

      <footer className="footer">
        FLASHGUYS — Independent crypto
        discovery platform.
      </footer>

      {accountOpen ? <AccountPanel onClose={() => setAccountOpen(false)} /> : null}

      <TokenModal
        token={selectedToken}
        onClose={() =>
          setSelectedToken(null)
        }
      />
    </div>
  );
}
