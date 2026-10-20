import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchGMGNTokens } from "./marketData";
import { startLiveFeeds, subscribeLiveToken } from "./liveFeeds";
import AccountPanel from "./AccountPanel";
import "./styles.css";

const MAX_VISIBLE_TOKENS = 100;
const MAX_STORED_TOKENS = 1500;

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

  const logoUrl = token.logo || token.image || token.imageUrl;

  if (logoUrl && !imageError) {
    return (
      <div className="token-logo">
        <img
          src={logoUrl}
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

function TokenSparkline({ token }) {
  const history = Array.isArray(token.priceHistory)
    ? token.priceHistory.map((point) => Number(point.price)).filter((price) => Number.isFinite(price) && price > 0).slice(-24)
    : [];
  if (history.length < 2) {
    return <span className="sparkline-empty" title="Waiting for real price updates">Waiting…</span>;
  }
  const width = 96;
  const height = 30;
  const pad = 2;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || Math.max(max * 0.001, 1e-12);
  const points = history.map((price, index) => {
    const x = pad + (index / Math.max(1, history.length - 1)) * (width - pad * 2);
    const y = height - pad - ((price - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const rising = history[history.length - 1] >= history[0];
  return (
    <svg className="token-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Recent ${token.symbol || "token"} price movement`}>
      <polyline points={points} fill="none" stroke={rising ? "#55d88a" : "#ff6f7d"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TokenRow({ token, onClick }) {
  const change = Number(token.change24h || 0);
  const [copiedCA, setCopiedCA] = useState(false);
  const contractAddress = String(token.address || token.mint || "").trim();

  async function copyContractAddress(event) {
    event.stopPropagation();
    if (!contractAddress) return;
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopiedCA(true);
      window.setTimeout(() => setCopiedCA(false), 1500);
    } catch (error) {
      // Keep the address visible so it can still be selected and copied manually.
      setCopiedCA(false);
    }
  }

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

      <td>
        {contractAddress ? (
          <div className="contract-address-cell" title={contractAddress}>
            <code>{`${contractAddress.slice(0, 5)}…${contractAddress.slice(-5)}`}</code>
            <button type="button" className="copy-ca-button" onClick={copyContractAddress} aria-label={`Copy contract address for ${token.symbol || token.name || "token"}`}>
              {copiedCA ? "Copied!" : "Copy CA"}
            </button>
          </div>
        ) : <span className="sparkline-empty">Pending…</span>}
      </td>

      <td>{formatPrice(token.price)}</td>

      <td className="sparkline-cell"><TokenSparkline token={token} /></td>

      <td>{formatNumber(token.marketCap)}</td>

      <td>{formatNumber(token.liquidity)}</td>

      <td>{formatNumber(token.volume1h)}</td>

      <td>{Number.isFinite(Number(token.holders)) && token.holders !== null && token.holders !== undefined ? Number(token.holders).toLocaleString() : "Unavailable"}</td>

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
        const currentPrice = Number(data.price);
        if (currentPrice > 0) setLivePrice(currentPrice);
        const points = Array.isArray(data.history) ? data.history
          .map((point) => ({ time: Number(point.time), price: Number(point.price) }))
          .filter((point) => point.time > 0 && point.price > 0) : [];
        setHistory((previous) => {
          const merged = new Map();
          [...points, ...previous].forEach((point) => merged.set(point.time, point));
          // Add a timestamped sample of the latest provider price so the chart can move
          // even when the websocket has no trade update for this token.
          if (currentPrice > 0) merged.set(Date.now(), { time: Date.now(), price: currentPrice });
          return [...merged.values()].sort((a, b) => a.time - b.time).slice(-180);
        });
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
              <div className="stat-label">Holders</div>
              <div className="stat-value">{token.holders !== null && token.holders !== undefined ? Number(token.holders).toLocaleString() : "Unavailable"}</div>
            </div>

            <div className="stat">
              <div className="stat-label">24h Volume</div>
              <div className="stat-value">{formatNumber(token.volume24h)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">1h Volume</div>
              <div className="stat-value">{formatNumber(token.volume1h)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Fully Diluted Value</div>
              <div className="stat-value">{formatNumber(token.fdv)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">24h Buys / Sells</div>
              <div className="stat-value">{Number(token.buys24h || 0).toLocaleString()} / {Number(token.sells24h || 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">Price Chart</div>
            <PriceChart token={token} />
          </div>

          <section className="token-extra-details" style={{ marginTop: 18 }}>
            <h3>Token Details</h3>
            <p><strong>Contract / Mint address:</strong> <code style={{ overflowWrap: "anywhere" }}>{token.address || token.mint || "Unavailable"}</code></p>
            <p><strong>Network:</strong> {token.chain === "robinhood" ? "Robinhood Chain" : "Solana"}</p>
            <p><strong>Launch source:</strong> {token.protocol || token.dexId || "Unavailable"}</p>
            <p><strong>Creator wallet:</strong> <code style={{ overflowWrap: "anywhere" }}>{token.creator || "Unavailable from source"}</code></p>
            <p><strong>Total supply:</strong> {Number(token.supply) > 0 ? Number(token.supply).toLocaleString() : "Unavailable from source"}</p>
            <p><strong>Token decimals:</strong> {Number(token.decimals) > 0 ? token.decimals : "Unavailable from source"}</p>
            <p><strong>Launch time:</strong> {token.createdAt ? new Date(Number(token.createdAt) < 1e12 ? Number(token.createdAt) * 1000 : Number(token.createdAt)).toLocaleString() : "Unavailable"}</p>
            <p><strong>Pair created:</strong> {token.pairCreatedAt ? new Date(Number(token.pairCreatedAt)).toLocaleString() : "Not paired yet / unavailable"}</p>
            <p><strong>Bonding curve graduated:</strong> {typeof token.graduated === "boolean" ? (token.graduated ? "Yes" : "No") : "Unavailable"}</p>
            <p><strong>Description:</strong> {token.description || "Not provided by token metadata"}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              {(token.address && token.chain !== "robinhood" ? [{ type: "Pump.fun page", url: `https://pump.fun/coin/${encodeURIComponent(token.address)}` }, { type: "Solscan", url: `https://solscan.io/token/${encodeURIComponent(token.address)}` }] : []).concat(token.pairUrl ? [{ type: "Trading pair", url: token.pairUrl }] : [], token.website ? [{ type: "Website", url: token.website }] : [], token.twitter ? [{ type: "X / Twitter", url: token.twitter.startsWith("http") ? token.twitter : `https://x.com/${token.twitter.replace(/^@/, "")}` }] : [], token.telegram ? [{ type: "Telegram", url: token.telegram.startsWith("http") ? token.telegram : `https://t.me/${token.telegram.replace(/^@/, "")}` }] : [], Array.isArray(token.socials) ? token.socials : []).map((link, index) => <a key={index} href={link.url} target="_blank" rel="noreferrer">{link.type || "Link"}</a>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LaunchPage() {
  const [walletStatus, setWalletStatus] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);

  async function addRobinhoodNetwork() {
    const ethereum = window.ethereum;
    if (!ethereum) {
      setWalletStatus("Install or open an EVM wallet such as Robinhood Wallet or MetaMask, then try again.");
      return;
    }
    setNetworkBusy(true);
    setWalletStatus("");
    try {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x1237",
          chainName: "Robinhood Chain",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
          blockExplorerUrls: ["https://robinhoodchain.blockscout.com"]
        }]
      });
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setWalletStatus(accounts?.[0] ? "Wallet connected to Robinhood Chain." : "Network added. Connect your wallet to continue.");
    } catch (error) {
      setWalletStatus(error?.message || "Could not connect to Robinhood Chain. Check your wallet and try again.");
    } finally {
      setNetworkBusy(false);
    }
  }

  return (
    <div className="launch-page">
      <h1>Launch on FLASHBOYS</h1>
      <p>Choose a chain. FLASHBOYS opens the official Solana creation page and helps you connect to Robinhood Chain.</p>
      <div className="launch-options">
        <div className="launch-option">
          <h3>Solana</h3>
          <p>Create a real token directly on Pump.fun. You will complete the details and approve any transaction in Pump.fun with your own wallet.</p>
          <a className="launch-button" href="https://pump.fun/create" target="_blank" rel="noreferrer">
            Create Token on Pump.fun ↗
          </a>
        </div>
        <div className="launch-option">
          <h3>Robinhood Chain</h3>
          <p>Connect an EVM wallet to Robinhood Chain. Token creation requires deploying an ERC-20 smart contract and paying network gas in ETH. Test on testnet before using real funds.</p>
          <button className="launch-button" type="button" onClick={addRobinhoodNetwork} disabled={networkBusy}>
            {networkBusy ? "Connecting…" : "Connect Wallet to Robinhood Chain"}
          </button>
          {walletStatus ? <p role="status" style={{ overflowWrap: "anywhere" }}>{walletStatus}</p> : null}
          <a className="launch-button" href="https://docs.robinhood.com/chain/deploy-smart-contracts/" target="_blank" rel="noreferrer">
            Open Token Contract Deployment Guide ↗
          </a>
          <a href="https://robinhoodchain.blockscout.com/" target="_blank" rel="noreferrer">Open Robinhood Chain Explorer</a>
          <p style={{ fontSize: 12, opacity: 0.8 }}>The wallet/network connection is wired here. In-app ERC-20 deployment is not yet implemented, so this page will not claim a token was created.</p>
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

  const [tokenView, setTokenView] = useState("new");

  const [tokens, setTokens] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [remoteSearchTokens, setRemoteSearchTokens] = useState([]);
  const [remoteSearchStatus, setRemoteSearchStatus] = useState("");

  const [selectedToken, setSelectedToken] =
    useState(null);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [liveLaunchCount, setLiveLaunchCount] = useState(0);
  const seenLiveLaunches = useRef(new Set());

  const [accountOpen, setAccountOpen] = useState(() => {
    try {
      return !localStorage.getItem("flashguys.auth.session");
    } catch {
      return true;
    }
  });

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

  // Apply follow-up Pump.fun metadata as soon as the IPFS/metadata gateway responds.
  useEffect(() => {
    const handleTokenMetadata = (event) => {
      const patch = event?.detail;
      const address = String(patch?.address || patch?.mint || "").toLowerCase();
      if (!address) return;
      const applyPatch = (token) => {
        if (String(token.address || token.mint || "").toLowerCase() !== address) return token;
        return {
          ...token,
          ...(patch.image ? { image: patch.image, logo: patch.image } : {}),
          ...(patch.description ? { description: patch.description } : {}),
          ...(patch.website ? { website: patch.website } : {}),
          ...(patch.twitter ? { twitter: patch.twitter } : {}),
          ...(patch.telegram ? { telegram: patch.telegram } : {})
        };
      };
      setTokens((previous) => previous.map(applyPatch));
      setSelectedToken((previous) => previous ? applyPatch(previous) : previous);
    };
    window.addEventListener("flashguys:solana-token", handleTokenMetadata);
    return () => window.removeEventListener("flashguys:solana-token", handleTokenMetadata);
  }, []);

  // Start the real-time Solana socket once for the whole app.
  useEffect(() => {
    const stop = startLiveFeeds({
      onToken: (newToken) => {
        if (!newToken?.address) return;
        setTokens((previous) => {
          const mintKey = String(newToken.address || newToken.mint).toLowerCase();
          const exists = previous.some((item) => String(item.address || item.mint || "").toLowerCase() === mintKey);
          if (exists) return previous.map((item) => {
            if (String(item.address || item.mint || "").toLowerCase() !== mintKey) return item;
            const history = Array.isArray(item.priceHistory) ? [...item.priceHistory] : [];
            const price = Number(newToken.price);
            const timestamp = Number(newToken.timestamp) > 0
              ? (Number(newToken.timestamp) < 1e12 ? Number(newToken.timestamp) * 1000 : Number(newToken.timestamp))
              : Date.now();
            if (price > 0 && (!history.length || Math.abs(Number(history[history.length - 1]?.price) - price) > 0 || timestamp - Number(history[history.length - 1]?.time || 0) >= 5000)) {
              history.push({ time: timestamp, price });
            }
            return { ...item, ...newToken, priceHistory: history.slice(-24) };
          });
          const seeded = { ...newToken, priceHistory: Number(newToken.price) > 0 ? [{ time: Date.now(), price: Number(newToken.price) }] : [] };
          return [seeded, ...previous].slice(0, MAX_STORED_TOKENS);
        });
      },
      onUpdate: (update) => {
        if (!update?.mint) return;
        const applyUpdate = (item) => {
          if (String(item.address || item.mint || "").toLowerCase() !== String(update.mint).toLowerCase()) return item;
          const nextPrice = Number(update.price);
          const previousHistory = Array.isArray(item.priceHistory) ? item.priceHistory : [];
          const nextHistory = nextPrice > 0
            ? [...previousHistory, { time: Number(update.timestamp) > 0 ? Number(update.timestamp) * 1000 : Date.now(), price: nextPrice }].slice(-24)
            : previousHistory;
          return {
            ...item,
            ...(nextPrice > 0 ? { price: nextPrice, priceHistory: nextHistory } : {}),
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

  const loadingTokensRef = useRef(false);

  async function loadTokens() {
    // Do not let a slow API request overlap the next refresh.
    if (loadingTokensRef.current) return;
    loadingTokensRef.current = true;
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
          if (current) {
            const previousHistory = Array.isArray(token.priceHistory) ? token.priceHistory : [];
            const apiHistory = Array.isArray(current.priceHistory) ? current.priceHistory : [];
            const nextHistory = [...previousHistory];
            const observedPrice = Number(current.price);
            const now = Date.now();
            if (observedPrice > 0 && (!nextHistory.length || now - Number(nextHistory[nextHistory.length - 1]?.time || 0) >= 5000)) {
              nextHistory.push({ time: now, price: observedPrice });
            }
            merged.set(key, {
              ...token,
              ...current,
              priceHistory: [...nextHistory, ...apiHistory].sort((x, y) => Number(x.time || 0) - Number(y.time || 0)).slice(-24)
            });
          } else {
            merged.set(key, token);
          }
        });
        return [...merged.values()].sort((a, b) => Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0)).slice(0, MAX_VISIBLE_TOKENS * 3);
      });

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);

      // Keep previously loaded and live tokens visible when a refresh fails.
      // A temporary API error must never wipe the existing market list.
      setError(err?.message || "Unable to refresh token data.");
    } finally {
      loadingTokensRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (page === "launch") {
      return;
    }

    loadTokens();

    // WebSocket feeds deliver new launches instantly; REST is only a backup
    // market-data refresh, so polling every 15s is lighter on the browser/API.
    const interval = setInterval(
      loadTokens,
      15000
    );

    return () => clearInterval(interval);
  }, [chain, page]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setRemoteSearchTokens([]);
      setRemoteSearchStatus("");
      return;
    }

    let cancelled = false;
    setRemoteSearchStatus("Searching live token markets…");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&chain=${encodeURIComponent(chain)}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.success) throw new Error(data.error || "Search unavailable");
        setRemoteSearchTokens(Array.isArray(data.tokens) ? data.tokens : []);
        setRemoteSearchStatus(data.tokens?.length ? `Found ${data.tokens.length} matching live market result(s).` : "No matching live market found.");
      } catch (error) {
        if (cancelled) return;
        setRemoteSearchTokens([]);
        setRemoteSearchStatus("Live search is temporarily unavailable.");
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, chain]);

  const filteredTokens = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    const combined = new Map();
    [...tokens, ...remoteSearchTokens].forEach((token) => {
      const key = String(token.address || token.mint || token.id || "").toLowerCase();
      if (key) combined.set(key, { ...combined.get(key), ...token });
    });
    let result = [...combined.values()];

    if (chain !== "all") {
      result = result.filter((token) => {
        const tokenChain = String(token.chain || "").toLowerCase();
        if (chain === "sol") return tokenChain === "sol" || tokenChain === "solana";
        return tokenChain === chain;
      });
    }

    if (query) {
      result = result.filter((token) => {
        const name =
          token.name?.toLowerCase() || "";

        const symbol =
          token.symbol?.toLowerCase() || "";

        const address = String(token.address || token.mint || "").toLowerCase();

        return (
          name.includes(query) ||
          symbol.includes(query) ||
          address.includes(query)
        );
      });
    }

    if (tokenView === "top") {
      // Rank daily leaders using reported 24h volume first, then daily change
      // and liquidity as tie-breakers. No artificial scores are displayed.
      result.sort((a, b) =>
        (Number(b.volume24h || 0) - Number(a.volume24h || 0)) ||
        (Number(b.change24h || 0) - Number(a.change24h || 0)) ||
        (Number(b.liquidity || 0) - Number(a.liquidity || 0))
      );
    } else if (tokenView === "trending") {
      // Rank trending tokens using reported short-term activity and momentum.
      result.sort((a, b) =>
        (Number(b.volume1h || 0) - Number(a.volume1h || 0)) ||
        (Number(b.change1h || 0) - Number(a.change1h || 0)) ||
        (Number(b.liquidity || 0) - Number(a.liquidity || 0))
      );
    } else {
      result.sort((a, b) =>
        Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0)
      );
    }

    return result.slice(
      0,
      MAX_VISIBLE_TOKENS
    );
  }, [tokens, remoteSearchTokens, chain, search, tokenView]);

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

          FLASHBOYS
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
            className={page === "trending" ? "active" : ""}
            onClick={() => { setPage("trending"); setTokenView("trending"); }}
          >
            Trending
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
        <button type="button" className="flashboys-launch-cta" onClick={() => setPage("launch")} aria-label="Open FLASHBOYS token launch options"><span className="flashboys-launch-bolt" aria-hidden="true">⚡</span><span>Launch FLASHBOYS</span></button>
        <button className="account-open-button" onClick={() => setAccountOpen(true)}>
          <span className="account-open-icon" aria-hidden="true">↗</span><span className="account-open-label">Account / Connect Wallet</span>
        </button>
      </header>

      <main className="main">
        {page === "launch" ? (
          <LaunchPage />
        ) : (
          <>
            <section className="hero">
              <h1>
                {page === "trending" ? <>Track the <span>trend</span> before the crowd.</> : <>Find the <span>move</span> before the crowd.</>}
              </h1>

              <p>
                {page === "trending" ? "Trending tokens ranked by reported short-term volume, momentum, and liquidity." : "Discover new tokens across Solana and Robinhood Chain in one place."}
              </p>
            </section>

            <section className="controls">
              <div className="chain-tabs" aria-label="Token view">
                <button className={tokenView === "new" ? "active" : ""} onClick={() => { setTokenView("new"); setPage("discover"); }}>New Tokens</button>
                <button className={tokenView === "top" ? "active" : ""} onClick={() => { setTokenView("top"); setPage("discover"); }}>Daily Top Tokens</button>
                <button className={tokenView === "trending" ? "active" : ""} onClick={() => { setTokenView("trending"); setPage("trending"); }}>Trending</button>
              </div>
              <div className="chain-tabs" aria-label="Blockchain filter">
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
              {search.trim().length >= 2 && (
                <div className="search-status" role="status">
                  {remoteSearchStatus || "Searching live token markets…"}
                </div>
              )}
            </section>

            <section className="token-card">
              {loading && tokens.length === 0 ? (
                <div className="status">
                  Loading tokens...
                </div>
              ) : error && filteredTokens.length === 0 ? (
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
                      <th>Contract Address</th>
                      <th>Price</th>
                      <th>Chart</th>
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

            {error && filteredTokens.length > 0 ? <div className="status error">Refresh issue: {error}. Keeping previously loaded coins visible.</div> : null}
            <div
              style={{
                marginTop: "14",
                display: "flex",
                justifyContent:
                  "space-between",
                color: "#626c7b",
                fontSize: "12px"
              }}
            >
              <span>
                {tokenView === "top" ? "Daily Top Tokens" : tokenView === "trending" ? "Trending Tokens" : "Newest Tokens"} · Showing {filteredTokens.length} tokens · Live launches detected this session: {liveLaunchCount}
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
        FLASHBOYS — Independent crypto
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
