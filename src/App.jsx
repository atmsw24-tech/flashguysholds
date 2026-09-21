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

import { startLiveFeeds } from "./liveFeeds";
import { fetchSolanaMemecoins } from "./marketData";


/* =========================================================
   DEMO DATA
========================================================= */

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
  {
    id: "trending",
    label: "Trending",
    icon: Flame
  },
  {
    id: "new",
    label: "New",
    icon: Sparkles
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


/* =========================================================
   FORMATTERS
========================================================= */

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "$0";
  }

  if (number >= 1000000) {
    return `$${(number / 1000000).toFixed(2)}M`;
  }

  if (number >= 1000) {
    return `$${(number / 1000).toFixed(1)}K`;
  }

  if (number >= 1) {
    return `$${number.toFixed(2)}`;
  }

  if (number >= 0.01) {
    return `$${number.toFixed(4)}`;
  }

  if (number === 0) {
    return "$0";
  }

  return `$${number.toFixed(8)}`;
}


function formatAge(minutes) {
  const value = Number(minutes);

  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value < 60) {
    return `${Math.floor(value)}m`;
  }

  const hours = Math.floor(value / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}


function shortenAddress(address) {
  if (!address) {
    return "—";
  }

  const value = String(address);

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}


function chainName(chain) {
  return chain === "solana"
    ? "Solana"
    : "Robinhood Chain";
}


/* =========================================================
   TOKEN HELPERS
========================================================= */

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
    typeof token.address === "string"
      ? token.address.trim()
      : "";

  /*
   * This is the key protection.
   *
   * A token without a real name or symbol
   * is never displayed.
   */

  if (!name || !symbol) {
    return false;
  }

  /*
   * Reject the old placeholder values
   * even if another source sends them.
   */

  const badNames = [
    "unknown",
    "unknown token",
    "new token"
  ];

  const badSymbols = [
    "unknown"
  ];

  if (
    badNames.includes(
      name.toLowerCase()
    )
  ) {
    return false;
  }

  if (
    badSymbols.includes(
      symbol.toLowerCase()
    )
  ) {
    return false;
  }

  /*
   * A live token should also have an address.
   */

  if (!address) {
    return false;
  }

  return true;
}


function mergeTokens(current, incoming) {
  const map = new Map();

  /*
   * Add current tokens first.
   */

  for (const token of current) {
    if (isValidToken(token)) {
      map.set(
        token.id,
        token
      );
    }
  }

  /*
   * Add incoming valid tokens.
   */

  for (const token of incoming) {
    if (!isValidToken(token)) {
      continue;
    }

    const existing =
      map.get(token.id);

    /*
     * Partial live updates should update
     * price/liquidity but should NOT erase
     * the existing name/symbol/image.
     */

    map.set(
      token.id,
      {
        ...existing,
        ...token,

        name:
          token.name ||
          existing?.name,

        symbol:
          token.symbol ||
          existing?.symbol,

        address:
          token.address ||
          existing?.address,

        image:
          token.image ||
          existing?.image
      }
    );
  }

  return Array.from(
    map.values()
  );
}


/* =========================================================
   UI COMPONENTS
========================================================= */

function ChainBadge({ chain }) {
  return (
    <span className={`chain-badge ${chain}`}>
      <span className="chain-dot" />
      {chainName(chain)}
    </span>
  );
}


function TokenIcon({ token }) {
  const [failed, setFailed] =
    useState(false);

  if (
    token?.image &&
    !failed
  ) {
    return (
      <div
        className={`token-icon ${token.chain} has-image`}
      >
        <img
          src={token.image}
          alt={`${token.name} logo`}
          loading="lazy"
          onError={() =>
            setFailed(true)
          }
        />
      </div>
    );
  }

  const symbol =
    typeof token?.symbol === "string"
      ? token.symbol
      : "";

  return (
    <div
      className={`token-icon ${
        token?.chain || ""
      }`}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}


function StatCard({
  icon: Icon,
  label,
  value,
  detail
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        <Icon size={18} />
      </div>

      <div>
        <div className="stat-label">
          {label}
        </div>

        <div className="stat-value">
          {value}
        </div>

        {detail && (
          <div className="stat-detail">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}


/* =========================================================
   APP
========================================================= */

function App() {
  const [tokens, setTokens] =
    useState([]);

  const [activeChain, setActiveChain] =
    useState("all");

  const [activeView, setActiveView] =
    useState("trending");

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [showLaunch, setShowLaunch] =
    useState(false);

  const [lastUpdated, setLastUpdated] =
    useState(new Date());

  const [apiStatus, setApiStatus] =
    useState("loading");

  const [selectedToken, setSelectedToken] =
    useState(null);

  const [liveStatus, setLiveStatus] =
    useState({
      solana: false,
      robinhood: false
    });


  /* =======================================================
     LOAD SOLANA MARKET DATA
  ======================================================= */

  async function loadTokens() {
    setLoading(true);

    try {

      const solanaTokens =
        await fetchSolanaMemecoins();


      /*
       * Only accept valid tokens.
       */

      const validSolanaTokens =
        Array.isArray(solanaTokens)
          ? solanaTokens.filter(
              isValidToken
            )
          : [];


      if (
        validSolanaTokens.length > 0
      ) {

        setTokens(
          (current) =>
            mergeTokens(
              current,
              validSolanaTokens
            )
        );

        setApiStatus(
          (current) =>
            current === "live"
              ? "live"
              : "api"
        );

      } else {

        setApiStatus(
          (current) =>
            current === "live"
              ? "live"
              : "empty"
        );
      }

    } catch (error) {

      console.warn(
        "FLASHGUYS market data error:",
        error
      );

      /*
       * Only use demo data if absolutely
       * nothing exists.
       */

      setTokens(
        (current) =>
          current.length > 0
            ? current
            : DEMO_TOKENS.filter(
                isValidToken
              )
      );

      setApiStatus(
        (current) =>
          current === "live"
            ? "live"
            : "demo"
      );

    } finally {

      setLastUpdated(
        new Date()
      );

      setLoading(false);
    }
  }


  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    loadTokens();
  }, []);


  /* =======================================================
     LIVE FEEDS
  ======================================================= */

  useEffect(() => {

    const stopLiveFeeds =
      startLiveFeeds({

        onStatus: (status) => {

          const key =
            status.chain === "Solana"
              ? "solana"
              : "robinhood";


          setLiveStatus(
            (current) => ({
              ...current,
              [key]:
                status.connected
            })
          );


          if (
            status.connected
          ) {

            setApiStatus(
              "live"
            );

            setLastUpdated(
              new Date()
            );
          }
        },


        onToken: (incomingToken) => {

          if (!incomingToken) {
            return;
          }


          /*
           * Do NOT create placeholders.
           */

          const incomingName =
            typeof incomingToken.name === "string"
              ? incomingToken.name.trim()
              : "";

          const incomingSymbol =
            typeof incomingToken.symbol === "string"
              ? incomingToken.symbol.trim()
              : "";

          const incomingAddress =
            incomingToken.address ||
            incomingToken.mint ||
            "";


          /*
           * If this is only a partial price update,
           * update an existing token but never create
           * a brand-new incomplete row.
           */

          const incomingId =
            incomingToken.id ||
            (
              incomingToken.chain &&
              incomingAddress
                ? `${incomingToken.chain}-${incomingAddress}`
                : ""
            );


          if (!incomingId) {

            console.log(
              "FLASHGUYS: ignored live event without ID:",
              incomingToken
            );

            return;
          }


          /*
           * Check whether the token already exists.
           */

          setTokens(
            (currentTokens) => {

              const existingIndex =
                currentTokens.findIndex(
                  (item) =>
                    item.id ===
                    incomingId
                );


              /*
               * Existing token:
               *
               * We can safely update its
               * price/volume/liquidity even
               * if this event has no metadata.
               */

              if (
                existingIndex !== -1
              ) {

                const existing =
                  currentTokens[
                    existingIndex
                  ];


                const updated = [
                  ...currentTokens
                ];


                updated[
                  existingIndex
                ] = {

                  ...existing,

                  ...incomingToken,

                  id:
                    existing.id,

                  name:
                    incomingName ||
                    existing.name,

                  symbol:
                    incomingSymbol ||
                    existing.symbol,

                  address:
                    incomingAddress ||
                    existing.address,

                  price:
                    Number.isFinite(
                      Number(
                        incomingToken.price
                      )
                    )
                      ? Number(
                          incomingToken.price
                        )
                      : existing.price,

                  change24h:
                    Number.isFinite(
                      Number(
                        incomingToken.change24h
                      )
                    )
                      ? Number(
                          incomingToken.change24h
                        )
                      : existing.change24h,

                  volume24h:
                    Number.isFinite(
                      Number(
                        incomingToken.volume24h
                      )
                    )
                      ? Number(
                          incomingToken.volume24h
                        )
                      : existing.volume24h,

                  liquidity:
                    Number.isFinite(
                      Number(
                        incomingToken.liquidity
                      )
                    )
                      ? Number(
                          incomingToken.liquidity
                        )
                      : existing.liquidity,

                  live:
                    true
                };


                return updated;
              }


              /*
               * NEW token:
               *
               * It MUST have a real name,
               * symbol and address.
               */

              if (
                !incomingName ||
                !incomingSymbol ||
                !incomingAddress
              ) {

                console.log(
                  "FLASHGUYS: ignored incomplete new token:",
                  incomingToken
                );

                return currentTokens;
              }


              /*
               * Reject placeholder names.
               */

              const badNames = [
                "unknown",
                "unknown token",
                "new token"
              ];

              const badSymbols = [
                "unknown"
              ];


              if (
                badNames.includes(
                  incomingName.toLowerCase()
                ) ||
                badSymbols.includes(
                  incomingSymbol.toLowerCase()
                )
              ) {

                console.log(
                  "FLASHGUYS: rejected placeholder token:",
                  incomingToken
                );

                return currentTokens;
              }


              /*
               * Create a genuine new token.
               */

              const token = {

                ...incomingToken,

                id:
                  incomingId,

                name:
                  incomingName,

                symbol:
                  incomingSymbol,

                address:
                  incomingAddress,

                price:
                  Number(
                    incomingToken.price || 0
                  ),

                change24h:
                  Number(
                    incomingToken.change24h || 0
                  ),

                volume24h:
                  Number(
                    incomingToken.volume24h || 0
                  ),

                liquidity:
                  Number(
                    incomingToken.liquidity || 0
                  ),

                marketCap:
                  Number(
                    incomingToken.marketCap || 0
                  ),

                live:
                  true
              };


              return [
                token,
                ...currentTokens
              ].slice(
                0,
                200
              );
            }
          );


          setApiStatus(
            "live"
          );

          setLastUpdated(
            new Date()
          );
        },


        onError: (error) => {

          console.warn(
            "FLASHGUYS live feed:",
            error
          );
        }
      });


    return () => {
      stopLiveFeeds?.();
    };

  }, []);


  /* =======================================================
     FILTER + SORT
  ======================================================= */

  const filteredTokens =
    useMemo(() => {

      let result =
        tokens.filter(
          isValidToken
        );


      /*
       * Chain filter.
       */

      if (
        activeChain !== "all"
      ) {

        result =
          result.filter(
            (token) =>
              token.chain ===
              activeChain
          );
      }


      /*
       * Search.
       */

      const normalizedSearch =
        search
          .trim()
          .toLowerCase();


      if (
        normalizedSearch
      ) {

        result =
          result.filter(
            (token) => {

              const name =
                String(
                  token.name || ""
                ).toLowerCase();

              const symbol =
                String(
                  token.symbol || ""
                ).toLowerCase();

              const address =
                String(
                  token.address || ""
                ).toLowerCase();

              return (
                name.includes(
                  normalizedSearch
                ) ||
                symbol.includes(
                  normalizedSearch
                ) ||
                address.includes(
                  normalizedSearch
                )
              );
            }
          );
      }


      /*
       * Newest.
       */

      if (
        activeView === "new"
      ) {

        result.sort(
          (a, b) =>
            Number(
              a.ageMinutes || 0
            ) -
            Number(
              b.ageMinutes || 0
            )
        );
      }


      /*
       * Gainers.
       */

      if (
        activeView === "gainers"
      ) {

        result.sort(
          (a, b) =>
            Number(
              b.change24h || 0
            ) -
            Number(
              a.change24h || 0
            )
        );
      }


      /*
       * Volume.
       */

      if (
        activeView === "volume"
      ) {

        result.sort(
          (a, b) =>
            Number(
              b.volume24h || 0
            ) -
            Number(
              a.volume24h || 0
            )
        );
      }


      /*
       * Trending.
       */

      if (
        activeView === "trending"
      ) {

        result.sort(
          (a, b) => {

            const scoreA =
              Number(
                a.change24h || 0
              ) *
                0.5 +
              Math.log10(
                Number(
                  a.volume24h || 0
                ) + 1
              ) *
                10;

            const scoreB =
              Number(
                b.change24h || 0
              ) *
                0.5 +
              Math.log10(
                Number(
                  b.volume24h || 0
                ) + 1
              ) *
                10;

            return (
              scoreB -
              scoreA
            );
          }
        );
      }


      return result;

    }, [
      tokens,
      activeChain,
      activeView,
      search
    ]);


  /* =======================================================
     STATS
  ======================================================= */

  const totalVolume =
    tokens.reduce(
      (sum, token) =>
        sum +
        Number(
          token.volume24h || 0
        ),
      0
    );


  const totalLiquidity =
    tokens.reduce(
      (sum, token) =>
        sum +
        Number(
          token.liquidity || 0
        ),
      0
    );


  const newTokens =
    tokens.filter(
      (token) =>
        isValidToken(token) &&
        Number(
          token.ageMinutes
        ) < 180
    ).length;


  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="app-shell">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="topbar">

        <div className="topbar-inner">

          <button
            className="brand"
            onClick={() => {

              setActiveView(
                "trending"
              );

              setActiveChain(
                "all"
              );

              setSearch("");

            }}
          >

            <div className="brand-mark">
              <Zap
                size={20}
                fill="currentColor"
              />
            </div>

            <div>

              <div className="brand-name">
                FLASHGUYS
              </div>

              <div className="brand-tagline">
                Discover what moves before everyone.
              </div>

            </div>

          </button>


          <nav
            className={`main-nav ${
              menuOpen
                ? "open"
                : ""
            }`}
          >

            <button
              className="nav-link active"
            >
              Discover
            </button>

            <button
              className="nav-link"
              onClick={() =>
                setShowLaunch(
                  true
                )
              }
            >
              Launch
            </button>

            <button
              className="nav-link"
            >
              Watchlist
            </button>

          </nav>


          <div className="top-actions">

            <button
              className="icon-button"
              title="Notifications"
            >
              <Bell size={18} />
            </button>

            <button
              className="launch-button"
              onClick={() =>
                setShowLaunch(
                  true
                )
              }
            >
              <Rocket size={16} />
              Prepare Launch
            </button>

            <button
              className="mobile-menu"
              onClick={() =>
                setMenuOpen(
                  (value) =>
                    !value
                )
              }
            >
              {menuOpen ? (
                <X size={20} />
              ) : (
                <Menu size={20} />
              )}
            </button>

          </div>

        </div>

      </header>


      {/* =================================================
          MAIN
      ================================================= */}

      <main className="page">

        {/* HERO */}

        <section className="hero">

          <div>

            <div className="eyebrow">

              <span className="live-dot" />

              ON-CHAIN DISCOVERY

            </div>


            <h1>
              Find the move
              <br />
              <span>
                before the crowd.
              </span>
            </h1>


            <p>
              Explore emerging tokens across
              Solana and Robinhood Chain.
              Track new launches, momentum,
              liquidity and volume from one
              independent discovery dashboard.
            </p>

          </div>


          <div className="hero-panel">

            <div className="hero-panel-header">

              <span>
                Network activity
              </span>

              <span className="live-pill">

                <Activity size={13} />

                LIVE CONCEPT

              </span>

            </div>


            <div className="activity-line">

              <div className="activity-bars">

                {[
                  35,
                  50,
                  42,
                  65,
                  54,
                  78,
                  62,
                  88,
                  70,
                  94,
                  76,
                  100
                ].map(
                  (
                    height,
                    index
                  ) => (
                    <span
                      key={index}
                      style={{
                        height:
                          `${height}%`
                      }}
                    />
                  )
                )}

              </div>


              <div className="activity-number">
                24/7
              </div>

              <div className="activity-caption">
                Discovery engine ready
              </div>

            </div>

          </div>

        </section>


        {/* NOTICE */}

        <section className="notice">

          <ShieldCheck size={17} />

          <span>
            <strong>
              Independent platform.
            </strong>{" "}
            FLASHGUYS is not affiliated
            with, endorsed by, or operated
            by Robinhood.
          </span>

          <span className="notice-chain">
            Robinhood Chain = chain network
          </span>

        </section>


        {/* STATS */}

        <section className="stats-grid">

          <StatCard
            icon={Layers3}
            label="Tracked Tokens"
            value={tokens.length}
            detail={
              activeChain === "all"
                ? "Both networks"
                : chainLabels[
                    activeChain
                  ]
            }
          />


          <StatCard
            icon={BarChart3}
            label="24h Volume"
            value={formatMoney(
              totalVolume
            )}
            detail="Live market data"
          />


          <StatCard
            icon={CircleDollarSign}
            label="Liquidity"
            value={formatMoney(
              totalLiquidity
            )}
            detail="Across displayed tokens"
          />


          <StatCard
            icon={Sparkles}
            label="Fresh Tokens"
            value={newTokens}
            detail="Under 3 hours old"
          />

        </section>


        {/* CONTROLS */}

        <section className="control-panel">

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
                  className={`chain-tab ${
                    activeChain === key
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setActiveChain(
                      key
                    )
                  }
                >

                  {key === "all" && (
                    <Globe2 size={15} />
                  )}

                  {key === "solana" && (
                    <span className="tiny-solana">
                      S
                    </span>
                  )}

                  {key === "robinhood" && (
                    <Layers3 size={15} />
                  )}

                  {label}

                </button>

              )
            )}

          </div>


          <div className="search-box">

            <Search size={17} />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search token, symbol or contract..."
            />


            {search && (
              <button
                className="clear-search"
                onClick={() =>
                  setSearch("")
                }
              >
                <X size={14} />
              </button>
            )}

          </div>

        </section>


        {/* MARKET */}

        <section className="market-section">

          <div className="section-heading">

            <div>

              <div className="section-kicker">
                MARKET SCANNER
              </div>

              <h2>
                Token discovery
              </h2>

            </div>


            <div className="updated">

              <Clock3 size={14} />

              Updated{" "}
              {lastUpdated.toLocaleTimeString()}

            </div>

          </div>


          <div className="view-tabs">

            {views.map(
              ({
                id,
                label,
                icon: Icon
              }) => (

                <button
                  key={id}
                  className={`view-tab ${
                    activeView === id
                      ? "active"
                      : ""
                  }`}
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

          </div>


          <div className="table-wrap">

            <div className="token-table header">

              <div>
                Token
              </div>

              <div>
                Price
              </div>

              <div>
                24h
              </div>

              <div>
                Volume
              </div>

              <div>
                Liquidity
              </div>

              <div>
                Age
              </div>

              <div />

            </div>


            {loading && (
              <div className="loading-row">

                <div className="loader" />

                Updating discovery feed...

              </div>
            )}


            {!loading &&
              filteredTokens.map(
                (token) => (

                  <div
                    className="token-table token-row"
                    key={token.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedToken(
                        token
                      )
                    }
                    onKeyDown={(
                      event
                    ) => {

                      if (
                        event.key ===
                          "Enter" ||
                        event.key ===
                          " "
                      ) {

                        event.preventDefault();

                        setSelectedToken(
                          token
                        );
                      }

                    }}
                  >

                    <div className="token-cell">

                      <TokenIcon
                        token={token}
                      />

                      <div className="token-info">

                        <div className="token-title">

                          {token.name}

                          {Number(
                            token.ageMinutes
                          ) < 60 && (
                            <span className="new-tag">
                              NEW
                            </span>
                          )}

                        </div>


                        <div className="token-meta">

                          <span>
                            {token.symbol}
                          </span>

                          <ChainBadge
                            chain={
                              token.chain
                            }
                          />

                        </div>

                      </div>

                    </div>


                    <div className="price-cell">
                      {formatMoney(
                        Number(
                          token.price
                        )
                      )}
                    </div>


                    <div
                      className={`change-cell ${
                        Number(
                          token.change24h
                        ) >= 0
                          ? "positive"
                          : "negative"
                      }`}
                    >

                      {Number(
                        token.change24h
                      ) >= 0
                        ? "+"
                        : ""}

                      {Number(
                        token.change24h
                      ).toFixed(1)}
                      %

                    </div>


                    <div>
                      {formatMoney(
                        Number(
                          token.volume24h
                        )
                      )}
                    </div>


                    <div>
                      {formatMoney(
                        Number(
                          token.liquidity
                        )
                      )}
                    </div>


                    <div className="age-cell">

                      <Clock3 size={14} />

                      {formatAge(
                        Number(
                          token.ageMinutes
                        )
                      )}

                    </div>


                    <div>

                      <button
                        className="row-action"
                        title="Open token"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedToken(token);
                        }}
                      >
                        <ArrowUpRight
                          size={16}
                        />
                      </button>

                    </div>

                  </div>

                )
              )}


            {!loading &&
              filteredTokens.length === 0 && (

                <div className="empty-state">

                  <Search size={30} />

                  <h3>
                    No tokens found
                  </h3>

                  <p>
                    Try another token name,
                    symbol or contract address.
                  </p>

                </div>

              )}

          </div>

        </section>


        {/* DISCOVERY CARDS */}

        <section className="discovery-grid">

          <div className="discovery-card">

            <div className="card-icon">
              <Bolt size={19} />
            </div>

            <div>

              <div className="card-label">
                EARLY SIGNALS
              </div>

              <h3>
                Built for the first wave.
              </h3>

              <p>
                The discovery layer is designed
                to surface fresh contracts,
                unusual volume, liquidity changes
                and momentum as real-time
                indexers are connected.
              </p>

            </div>

          </div>


          <div className="discovery-card">

            <div className="card-icon">
              <Database size={19} />
            </div>

            <div>

              <div className="card-label">
                DATA LAYER
              </div>

              <h3>
                One dashboard. Multiple chains.
              </h3>

              <p>
                Solana uses its native
                account/program model while
                Robinhood Chain uses EVM-compatible
                contract data. Both can feed the
                same normalized token model.
              </p>

            </div>

          </div>


          <div className="discovery-card">

            <div className="card-icon">
              <Rocket size={19} />
            </div>

            <div>

              <div className="card-label">
                LAUNCH PREP
              </div>

              <h3>
                Prepare before you publish.
              </h3>

              <p>
                Keep launch configuration,
                token metadata and deployment
                preparation separate from the
                public discovery interface.
              </p>


              <button
                className="text-button"
                onClick={() =>
                  setShowLaunch(
                    true
                  )
                }
              >

                Open launch preparation

                <ArrowUpRight size={15} />

              </button>

            </div>

          </div>

        </section>


        {/* DATA STATUS */}

        <section className="data-status">

          <div className="status-left">

            <span
              className={`status-dot ${
                apiStatus === "demo"
                  ? "demo"
                  : "live"
              }`}
            />

            <span>

              Data source:{" "}

              <strong>

                {apiStatus === "demo"
                  ? "Demo / offline fallback"
                  : apiStatus === "live"
                    ? "Live feeds + DexScreener"
                    : apiStatus === "loading"
                      ? "Loading market data..."
                      : "DexScreener market data"}

              </strong>

            </span>

          </div>


          <span>

            Solana meme coins from
            DexScreener; Robinhood Chain
            launches stream live over WebSocket.

          </span>

        </section>

      </main>


      {/* =================================================
          FOOTER
      ================================================= */}

      <footer className="footer">

        <div>

          <strong>
            FLASHGUYS
          </strong>

          <span>
            Independent on-chain discovery.
          </span>

        </div>


        <div className="footer-links">

          <span>
            Solana
          </span>

          <span>
            Robinhood Chain
          </span>

          <span>
            Discovery
          </span>

          <span>
            Launch
          </span>

        </div>

      </footer>


      {/* =================================================
          TOKEN MODAL
      ================================================= */}

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

            <div className="modal-header">

              <div className="token-modal-title">

                <TokenIcon
                  token={
                    selectedToken
                  }
                />

                <div>

                  <h2>

                    {selectedToken.name}

                    <span className="token-modal-symbol">
                      {selectedToken.symbol}
                    </span>

                  </h2>

                  <ChainBadge
                    chain={
                      selectedToken.chain
                    }
                  />

                </div>

              </div>


              <button
                className="icon-button"
                onClick={() =>
                  setSelectedToken(
                    null
                  )
                }
              >
                <X size={18} />
              </button>

            </div>


            <div className="token-modal-stats">

              <div className="modal-stat">

                <span>
                  Price
                </span>

                <strong>
                  {formatMoney(
                    Number(
                      selectedToken.price
                    )
                  )}
                </strong>

              </div>


              <div className="modal-stat">

                <span>
                  24h
                </span>

                <strong
                  className={
                    Number(
                      selectedToken.change24h
                    ) >= 0
                      ? "positive"
                      : "negative"
                  }
                >

                  {Number(
                    selectedToken.change24h
                  ) >= 0
                    ? "+"
                    : ""}

                  {Number(
                    selectedToken.change24h
                  ).toFixed(1)}
                  %

                </strong>

              </div>


              <div className="modal-stat">

                <span>
                  Volume
                </span>

                <strong>
                  {formatMoney(
                    Number(
                      selectedToken.volume24h
                    )
                  )}
                </strong>

              </div>


              <div className="modal-stat">

                <span>
                  Liquidity
                </span>

                <strong>
                  {formatMoney(
                    Number(
                      selectedToken.liquidity
                    )
                  )}
                </strong>

              </div>


              {Number(
                selectedToken.marketCap
              ) > 0 && (

                <div className="modal-stat">

                  <span>
                    Market Cap
                  </span>

                  <strong>
                    {formatMoney(
                      Number(
                        selectedToken.marketCap
                      )
                    )}
                  </strong>

                </div>

              )}


              <div className="modal-stat">

                <span>
                  Age
                </span>

                <strong>
                  {formatAge(
                    Number(
                      selectedToken.ageMinutes
                    )
                  )}
                </strong>

              </div>

            </div>


            <div className="token-chart">

              {selectedToken.pairAddress ? (

                <iframe
                  title={`${selectedToken.symbol} price chart`}
                  src={`https://dexscreener.com/${
                    selectedToken.chainId ||
                    "solana"
                  }/${
                    selectedToken.pairAddress
                  }?embed=1&theme=dark&info=0&trades=0`}
                  loading="lazy"
                />

              ) : (

                <div className="chart-empty">

                  <BarChart3 size={26} />

                  <p>
                    Live chart is not available
                    for this token yet. It streams
                    in over the live feed before a
                    market index is ready.
                  </p>

                </div>

              )}

            </div>


            <div className="token-modal-footer">

              <div className="token-address">

                <span>
                  Contract
                </span>

                <code>
                  {shortenAddress(
                    selectedToken.address
                  )}
                </code>

              </div>


              {(
                selectedToken.url ||
                selectedToken.pairAddress
              ) && (

                <a
                  className="primary-button"
                  href={
                    selectedToken.url ||
                    `https://dexscreener.com/${
                      selectedToken.chainId ||
                      "solana"
                    }/${
                      selectedToken.pairAddress
                    }`
                  }
                  target="_blank"
                  rel="noreferrer"
                >

                  Open on DexScreener

                  <ExternalLink
                    size={15}
                  />

                </a>

              )}

            </div>

          </div>

        </div>

      )}


      {/* =================================================
          LAUNCH MODAL
      ================================================= */}

      {showLaunch && (

        <div
          className="modal-backdrop"
          onClick={() =>
            setShowLaunch(
              false
            )
          }
        >

          <div
            className="launch-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <div className="section-kicker">
                  FLASHGUYS LABS
                </div>

                <h2>
                  Launch preparation
                </h2>

              </div>


              <button
                className="icon-button"
                onClick={() =>
                  setShowLaunch(
                    false
                  )
                }
              >
                <X size={18} />
              </button>

            </div>


            <div className="launch-warning">

              <ShieldCheck size={17} />

              <span>
                This interface prepares launch
                information. It does not store or
                request private keys or seed phrases.
              </span>

            </div>


            <div className="form-grid">

              <label>

                Token name

                <input
                  placeholder="FLASHGUYS"
                />

              </label>


              <label>

                Symbol

                <input
                  placeholder="FLASH"
                />

              </label>


              <label>

                Network

                <select
                  defaultValue="solana"
                >

                  <option value="solana">
                    Solana
                  </option>

                  <option value="robinhood">
                    Robinhood Chain
                  </option>

                </select>

              </label>


              <label>

                Initial supply

                <input
                  placeholder="1,000,000,000"
                />

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
                Private deployment credentials
                stay server-side.
              </span>


              <button
                className="primary-button"
                onClick={() =>
                  setShowLaunch(
                    false
                  )
                }
              >

                Save preparation

                <ArrowUpRight
                  size={15}
                />

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}


export default App;
