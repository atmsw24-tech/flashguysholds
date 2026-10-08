import React, { useEffect, useMemo, useState } from "react";
import { fetchGMGNTokens } from "./marketData";
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
  const history =
    token?.priceHistory ||
    token?.chart ||
    [];

  if (!Array.isArray(history) || history.length < 2) {
    return (
      <div className="chart-empty">
        Chart data unavailable for this token.
      </div>
    );
  }

  const values = history
    .map((item) => {
      if (typeof item === "number") {
        return item;
      }

      return Number(
        item?.price ??
        item?.value ??
        0
      );
    })
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return (
      <div className="chart-empty">
        Chart data unavailable for this token.
      </div>
    );
  }

  const width = 700;
  const height = 220;
  const padding = 12;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / (values.length - 1)) *
          (width - padding * 2);

      const y =
        height -
        padding -
        ((value - min) / range) *
          (height - padding * 2);

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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

  async function loadTokens() {
    try {
      setLoading(true);
      setError("");

      const data =
        await fetchGMGNTokens(chain);

      setTokens(
        Array.isArray(data) ? data : []
      );

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
                Showing{" "}
                {filteredTokens.length} tokens
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

      <TokenModal
        token={selectedToken}
        onClose={() =>
          setSelectedToken(null)
        }
      />
    </div>
  );
}
