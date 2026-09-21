import React, {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Search,
  Rocket,
  Eye,
  TrendingUp,
  Flame,
  BarChart3,
  RefreshCw,
  ExternalLink,
  Copy,
  X,
  Activity,
  Zap,
  ChevronDown
} from "lucide-react";

import {
  startLiveFeeds
} from "./liveFeeds";

const chainLabels = {
  all: "All Chains",
  solana: "Solana",
  robinhood: "Robinhood Chain"
};

const views = [
  {
    id: "trending",
    label: "Trending",
    icon: Flame
  },
  {
    id: "new",
    label: "New",
    icon: Zap
  },
  {
    id: "gainers",
    label: "Gainers",
    icon: TrendingUp
  },
  {
    id: "volume",
    label: "Volume",
    icon: BarChart3
  }
];

function isValidToken(token) {
  if (!token) {
    return false;
  }

  const name =
    typeof token.name === "string"
      ? token.name.trim()
      : "";

  const symbol =
    typeof token.symbol === "string"
      ? token.symbol.trim()
      : "";

  const address =
    String(
      token.address ||
      token.mint ||
      ""
    ).trim();

  if (!name || !symbol || !address) {
    return false;
  }

  const invalidNames = [
    "unknown",
    "unknown token",
    "new token",
    "undefined",
    "null"
  ];

  const invalidSymbols = [
    "unknown",
    "undefined",
    "null"
  ];

  if (
    invalidNames.includes(
      name.toLowerCase()
    )
  ) {
    return false;
  }

  if (
    invalidSymbols.includes(
      symbol.toLowerCase()
    )
  ) {
    return false;
  }

  return true;
}

function mergeTokens(
  current,
  incoming
) {
  const map = new Map();

  for (const token of current) {
    if (
      token?.id &&
      isValidToken(token)
    ) {
      map.set(
        token.id,
        token
      );
    }
  }

  for (const token of incoming) {
    if (
      token?.id &&
      isValidToken(token)
    ) {
      const existing =
        map.get(token.id);

      map.set(
        token.id,
        {
          ...existing,
          ...token
        }
      );
    }
  }

  return Array.from(
    map.values()
  );
}

function formatNumber(
  value
) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number === 0
  ) {
    return "$0";
  }

  if (
    Math.abs(number) >=
    1_000_000_000
  ) {
    return `$${(
      number / 1_000_000_000
    ).toFixed(2)}B`;
  }

  if (
    Math.abs(number) >=
    1_000_000
  ) {
    return `$${(
      number / 1_000_000
    ).toFixed(2)}M`;
  }

  if (
    Math.abs(number) >=
    1_000
  ) {
    return `$${(
      number / 1_000
    ).toFixed(1)}K`;
  }

  if (
    Math.abs(number) < 0.000001
  ) {
    return `$${number.toExponential(
      2
    )}`;
  }

  if (
    Math.abs(number) < 1
  ) {
    return `$${number.toFixed(
      8
    )}`;
  }

  return `$${number.toFixed(2)}`;
}

function formatAge(
  minutes
) {
  const value =
    Number(minutes);

  if (
    !Number.isFinite(value)
  ) {
    return "—";
  }

  if (value < 1) {
    return "Just now";
  }

  if (value < 60) {
    return `${Math.floor(
      value
    )}m`;
  }

  if (value < 1440) {
    return `${Math.floor(
      value / 60
    )}h`;
  }

  return `${Math.floor(
    value / 1440
  )}d`;
}

function formatPrice(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number === 0
  ) {
    return "$0";
  }

  if (
    number < 0.000001
  ) {
    return `$${number.toExponential(
      2
    )}`;
  }

  if (
    number < 0.01
  ) {
    return `$${number.toFixed(
      8
    )}`;
  }

  if (
    number < 1
  ) {
    return `$${number.toFixed(
      5
    )}`;
  }

  return `$${number.toFixed(
    2
  )}`;
}

function TokenIcon({
  token,
  large = false
}) {
  const [failed, setFailed] =
    useState(false);

  if (
    token.image &&
    !failed
  ) {
    return (
      <img
        src={token.image}
        alt={token.symbol}
        onError={() =>
          setFailed(true)
        }
        className={
          large
            ? "token-icon large"
            : "token-icon"
        }
      />
    );
  }

  return (
    <div
      className={
        large
          ? "token-icon large token-placeholder"
          : "token-icon token-placeholder"
      }
    >
      {String(
        token.symbol ||
          "?"
      )
        .slice(0, 2)
        .toUpperCase()}
    </div>
  );
}

function App() {
  const [
    tokens,
    setTokens
  ] = useState([]);

  const [
    activeChain,
    setActiveChain
  ] = useState("all");

  const [
    activeView,
    setActiveView
  ] = useState("new");

  const [
    search,
    setSearch
  ] = useState("");

  const [
    selectedToken,
    setSelectedToken
  ] = useState(null);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    lastUpdated,
    setLastUpdated
  ] = useState(
    new Date()
  );

  const [
    liveStatus,
    setLiveStatus
  ] = useState({
    Solana: false,
    Robinhood: false
  });

  const [
    copied,
    setCopied
  ] = useState(false);

  /*
   * START SOLANA LIVE FEED
   */

  useEffect(() => {
    setLoading(true);

    const stop =
      startLiveFeeds({
        onToken: (
          incomingToken
        ) => {
          if (
            !isValidToken(
              incomingToken
            )
          ) {
            return;
          }

          setTokens(
            (current) =>
              mergeTokens(
                current,
                [
                  incomingToken
                ]
              )
                .sort(
                  (
                    a,
                    b
                  ) =>
                    Number(
                      a.timestamp ||
                        0
                    ) -
                    Number(
                      b.timestamp ||
                        0
                    )
                )
                .slice(
                  0,
                  500
                )
          );

          setLoading(
            false
          );

          setLastUpdated(
            new Date()
          );
        },

        onUpdate:
          (
            update
          ) => {
            if (
              !update
            ) {
              return;
            }

            const mint =
              String(
                update.mint ||
                  ""
              ).trim();

            if (!mint) {
              return;
            }

            setTokens(
              (
                current
              ) =>
                current.map(
                  (
                    token
                  ) => {
                    if (
                      token.address !==
                        mint &&
                      token.mint !==
                        mint
                    ) {
                      return token;
                    }

                    return {
                      ...token,

                      price:
                        update.price ||
                        token.price,

                      marketCap:
                        update.marketCap ||
                        token.marketCap,

                      volume24h:
                        update.volume24h ||
                        token.volume24h,

                      liquidity:
                        update.liquidity ||
                        token.liquidity,

                      change24h:
                        update.change24h ||
                        token.change24h,

                      live: true
                    };
                  }
                )
            );

            setLastUpdated(
              new Date()
            );
          },

        onStatus:
          ({
            chain,
            connected
          }) => {
            setLiveStatus(
              (
                current
              ) => ({
                ...current,
                [chain]:
                  connected
              })
            );

            if (
              chain ===
              "Solana"
            ) {
              setLoading(
                false
              );
            }
          },

        onError:
          (
            error
          ) => {
            console.error(
              "FLASHGUYS live feed error:",
              error
            );

            setLoading(
              false
            );
          }
      });

    return () => {
      stop?.();
    };
  }, []);

  /*
   * FILTER TOKENS
   */

  const filteredTokens =
    useMemo(() => {
      let result =
        [...tokens];

      if (
        activeChain !==
        "all"
      ) {
        result =
          result.filter(
            (
              token
            ) =>
              token.chain ===
              activeChain
          );
      }

      if (
        search.trim()
      ) {
        const query =
          search
            .trim()
            .toLowerCase();

        result =
          result.filter(
            (
              token
            ) =>
              token.name
                .toLowerCase()
                .includes(
                  query
                ) ||
              token.symbol
                .toLowerCase()
                .includes(
                  query
                ) ||
              token.address
                .toLowerCase()
                .includes(
                  query
                )
          );
      }

      if (
        activeView ===
        "new"
      ) {
        result.sort(
          (
            a,
            b
          ) =>
            Number(
              a.ageMinutes ||
                0
            ) -
            Number(
              b.ageMinutes ||
                0
            )
        );
      }

      if (
        activeView ===
        "gainers"
      ) {
        result.sort(
          (
            a,
            b
          ) =>
            Number(
              b.change24h ||
                0
            ) -
            Number(
              a.change24h ||
                0
            )
        );
      }

      if (
        activeView ===
        "volume"
      ) {
        result.sort(
          (
            a,
            b
          ) =>
            Number(
              b.volume24h ||
                0
            ) -
            Number(
              a.volume24h ||
                0
            )
        );
      }

      if (
        activeView ===
        "trending"
      ) {
        result.sort(
          (
            a,
            b
          ) =>
            Number(
              b.volume24h ||
                0
            ) -
            Number(
              a.volume24h ||
                0
            )
        );
      }

      return result;
    }, [
      tokens,
      activeChain,
      activeView,
      search
    ]);

  /*
   * STATS
   */

  const totalVolume =
    tokens.reduce(
      (
        sum,
        token
      ) =>
        sum +
        Number(
          token.volume24h ||
            0
        ),
      0
    );

  const totalLiquidity =
    tokens.reduce(
      (
        sum,
        token
      ) =>
        sum +
        Number(
          token.liquidity ||
            0
        ),
      0
    );

  const newTokens =
    tokens.filter(
      (
        token
      ) =>
        Number(
          token.ageMinutes ||
            999999
        ) < 60
    ).length;

  function copyAddress(
    address
  ) {
    navigator.clipboard
      ?.writeText(
        address
      );

    setCopied(true);

    setTimeout(
      () =>
        setCopied(false),
      1500
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            F
          </div>

          <div>
            <div className="brand-name">
              FLASHGUYS
            </div>

            <div className="brand-subtitle">
              Discover what moves before everyone.
            </div>
          </div>
        </div>

        <div className="topbar-right">
          <div
            className={
              liveStatus.Solana
                ? "live-status online"
                : "live-status"
            }
          >
            <span className="live-dot" />

            {liveStatus.Solana
              ? "SOLANA LIVE"
              : "CONNECTING"}
          </div>

          <button
            className="launch-button"
            type="button"
          >
            <Rocket size={16} />
            Launch
          </button>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div>
            <div className="eyebrow">
              SOLANA MEMECOIN DISCOVERY
            </div>

            <h1>
              Find the move
              <br />
              before the crowd.
            </h1>

            <p>
              Real-time Solana token launches,
              market data and on-chain discovery.
            </p>
          </div>

          <div className="hero-status">
            <Activity size={18} />

            <div>
              <strong>
                {liveStatus.Solana
                  ? "Live discovery active"
                  : "Connecting to live discovery"}
              </strong>

              <span>
                Shrine Solana launch stream
              </span>
            </div>
          </div>
        </section>

        <section className="stats">
          <div className="stat">
            <span>Tracked Tokens</span>
            <strong>
              {tokens.length}
            </strong>
          </div>

          <div className="stat">
            <span>New &lt; 1h</span>
            <strong>
              {newTokens}
            </strong>
          </div>

          <div className="stat">
            <span>24h Volume</span>
            <strong>
              {formatNumber(
                totalVolume
              )}
            </strong>
          </div>

          <div className="stat">
            <span>Liquidity</span>
            <strong>
              {formatNumber(
                totalLiquidity
              )}
            </strong>
          </div>
        </section>

        <section className="controls">
          <div className="chain-tabs">
            {Object.entries(
              chainLabels
            ).map(
              ([
                key,
                label
              ]) => (
                <button
                  key={key}
                  type="button"
                  className={
                    activeChain ===
                    key
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setActiveChain(
                      key
                    )
                  }
                >
                  {label}

                  {key ===
                    "solana" &&
                    liveStatus.Solana && (
                      <span className="mini-live" />
                    )}
                </button>
              )
            )}
          </div>

          <div className="search-box">
            <Search size={16} />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search token or address..."
            />
          </div>
        </section>

        <section className="view-tabs">
          {views.map(
            ({
              id,
              label,
              icon: Icon
            }) => (
              <button
                key={id}
                type="button"
                className={
                  activeView ===
                  id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setActiveView(
                    id
                  )
                }
              >
                <Icon size={15} />
                {label}
              </button>
            )
          )}

          <div className="refresh-info">
            <RefreshCw
              size={14}
            />

            Updated{" "}
            {lastUpdated.toLocaleTimeString()}
          </div>
        </section>

        <section className="token-panel">
          <div className="panel-header">
            <div>
              <h2>
                {activeView ===
                "new"
                  ? "New Launches"
                  : activeView ===
                    "gainers"
                  ? "Top Gainers"
                  : activeView ===
                    "volume"
                  ? "Volume"
                  : "Trending"}
              </h2>

              <span>
                {filteredTokens.length} tokens
              </span>
            </div>

            <div className="panel-source">
              <span
                className={
                  liveStatus.Solana
                    ? "source-dot online"
                    : "source-dot"
                }
              />

              Shrine Live
            </div>
          </div>

          {loading &&
            filteredTokens.length ===
              0 && (
              <div className="empty-state">
                <RefreshCw
                  size={28}
                  className="spin"
                />

                <h3>
                  Connecting to Solana
                </h3>

                <p>
                  Waiting for live token launches...
                </p>
              </div>
            )}

          {!loading &&
            filteredTokens.length ===
              0 && (
              <div className="empty-state">
                <Zap size={28} />

                <h3>
                  Waiting for new launches
                </h3>

                <p>
                  New Solana tokens will appear here automatically.
                </p>
              </div>
            )}

          {filteredTokens.length >
            0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Price</th>
                    <th>24h</th>
                    <th>Market Cap</th>
                    <th>Liquidity</th>
                    <th>Volume</th>
                    <th>Age</th>
                    <th>Protocol</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTokens.map(
                    (
                      token
                    ) => (
                      <tr
                        key={
                          token.id
                        }
                        onClick={() =>
                          setSelectedToken(
                            token
                          )
                        }
                      >
                        <td>
                          <div className="token-cell">
                            <TokenIcon
                              token={
                                token
                              }
                            />

                            <div>
                              <strong>
                                {
                                  token.name
                                }
                              </strong>

                              <span>
                                $
                                {
                                  token.symbol
                                }
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          {formatPrice(
                            token.price
                          )}
                        </td>

                        <td
                          className={
                            Number(
                              token.change24h
                            ) >=
                            0
                              ? "positive"
                              : "negative"
                          }
                        >
                          {Number(
                            token.change24h ||
                              0
                          ) >=
                          0
                            ? "+"
                            : ""}
                          {Number(
                            token.change24h ||
                              0
                          ).toFixed(
                            2
                          )}
                          %
                        </td>

                        <td>
                          {formatNumber(
                            token.marketCap
                          )}
                        </td>

                        <td>
                          {formatNumber(
                            token.liquidity
                          )}
                        </td>

                        <td>
                          {formatNumber(
                            token.volume24h
                          )}
                        </td>

                        <td>
                          <span className="age">
                            {formatAge(
                              token.ageMinutes
                            )}
                          </span>
                        </td>

                        <td>
                          <span className="protocol">
                            {token.protocol ||
                              "Solana"}
                          </span>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="footer">
          <div>
            FLASHGUYS is an independent crypto discovery platform.
          </div>

          <div>
            Solana live launches powered by Shrine.
          </div>
        </footer>
      </main>

      {selectedToken && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setSelectedToken(
              null
            )
          }
        >
          <div
            className="token-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              className="modal-close"
              type="button"
              onClick={() =>
                setSelectedToken(
                  null
                )
              }
            >
              <X size={18} />
            </button>

            <div className="modal-token">
              <TokenIcon
                token={
                  selectedToken
                }
                large
              />

              <div>
                <h2>
                  {
                    selectedToken.name
                  }
                </h2>

                <span>
                  $
                  {
                    selectedToken.symbol
                  }
                </span>
              </div>
            </div>

            <div className="modal-stats">
              <div>
                <span>Price</span>
                <strong>
                  {formatPrice(
                    selectedToken.price
                  )}
                </strong>
              </div>

              <div>
                <span>Market Cap</span>
                <strong>
                  {formatNumber(
                    selectedToken.marketCap
                  )}
                </strong>
              </div>

              <div>
                <span>Liquidity</span>
                <strong>
                  {formatNumber(
                    selectedToken.liquidity
                  )}
                </strong>
              </div>

              <div>
                <span>Volume</span>
                <strong>
                  {formatNumber(
                    selectedToken.volume24h
                  )}
                </strong>
              </div>
            </div>

            <div className="address-box">
              <div>
                <span>Contract</span>

                <code>
                  {
                    selectedToken.address
                  }
                </code>
              </div>

              <button
                type="button"
                onClick={() =>
                  copyAddress(
                    selectedToken.address
                  )
                }
              >
                <Copy size={15} />

                {copied
                  ? "Copied"
                  : "Copy"}
              </button>
            </div>

            <div className="details-grid">
              <div>
                <span>Protocol</span>
                <strong>
                  {
                    selectedToken.protocol ||
                    "—"
                  }
                </strong>
              </div>

              <div>
                <span>Pool</span>
                <strong>
                  {
                    selectedToken.pool ||
                    "—"
                  }
                </strong>
              </div>

              <div>
                <span>Quote</span>
                <strong>
                  {
                    selectedToken.quote ||
                    "—"
                  }
                </strong>
              </div>

              <div>
                <span>Age</span>
                <strong>
                  {formatAge(
                    selectedToken.ageMinutes
                  )}
                </strong>
              </div>
            </div>

            {selectedToken.description && (
              <p className="description">
                {
                  selectedToken.description
                }
              </p>
            )}

            <div className="modal-links">
              {selectedToken.website && (
                <a
                  href={
                    selectedToken.website
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Website
                  <ExternalLink
                    size={14}
                  />
                </a>
              )}

              {selectedToken.twitter && (
                <a
                  href={
                    selectedToken.twitter
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  X
                  <ExternalLink
                    size={14}
                  />
                </a>
              )}

              {selectedToken.telegram && (
                <a
                  href={
                    selectedToken.telegram
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Telegram
                  <ExternalLink
                    size={14}
                  />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
