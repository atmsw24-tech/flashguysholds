/*
 * Client-side market data for FLASHGUYS.
 *
 * This project is a Vite SPA, so the serverless route in /api only runs on
 * Vercel. DexScreener's public API is CORS-enabled, so we fetch current
 * Solana meme coin data directly from the browser. This keeps real data
 * flowing in both the local preview and production.
 *
 * Robinhood Chain has no public REST snapshot (Shrine only exposes it over a
 * WebSocket), so those tokens arrive via the live feed in liveFeeds.js.
 */

const DEXSCREENER = "https://api.dexscreener.com";

// Verified, high-liquidity Solana memecoin mints used as a stable base set
// so the feed always has real current data even if trending is slow/empty.
const CURATED_SOLANA_MINTS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF (dogwifhat)
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ7i3XvW", // BOME
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", // MEW
  "5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC" // MOODENG
];

async function safeJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getTrendingSolanaMints() {
  const boosts = await safeJson(`${DEXSCREENER}/token-boosts/top/v1`);

  if (!Array.isArray(boosts)) return [];

  return boosts
    .filter((item) => item.chainId === "solana" && item.tokenAddress)
    .map((item) => item.tokenAddress);
}

function pickBestPair(pairs) {
  // A token can trade in many pools; keep the deepest one.
  return pairs.reduce((best, pair) => {
    const liquidity = Number(pair?.liquidity?.usd || 0);
    const bestLiquidity = Number(best?.liquidity?.usd || 0);
    return liquidity > bestLiquidity ? pair : best;
  }, pairs[0]);
}

function normalizeDexPair(pair) {
  const createdAt = Number(pair.pairCreatedAt || 0);
  const ageMinutes = createdAt
    ? Math.max(0, Math.floor((Date.now() - createdAt) / 60000))
    : 0;

  return {
    id: `solana-${pair.baseToken.address}`,
    chain: "solana",
    name: pair.baseToken.name || "Unknown Token",
    symbol: pair.baseToken.symbol || "UNKNOWN",
    address: pair.baseToken.address || "",
    price: Number(pair.priceUsd || 0),
    change24h: Number(pair.priceChange?.h24 || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    liquidity: Number(pair.liquidity?.usd || 0),
    marketCap: Number(pair.marketCap || pair.fdv || 0),
    ageMinutes,
    image: pair.info?.imageUrl || null,
    source: "DexScreener"
  };
}

/**
 * Fetch current Solana meme coins from DexScreener.
 * Returns a normalized, volume-sorted array (may be empty on failure).
 */
export async function fetchSolanaMemecoins() {
  const trending = await getTrendingSolanaMints();

  // De-duplicate: curated blue chips first, then trending discoveries.
  const mints = Array.from(
    new Set([...CURATED_SOLANA_MINTS, ...trending])
  ).slice(0, 30); // DexScreener tokens endpoint accepts up to 30 addresses.

  if (mints.length === 0) return [];

  const pairs = await safeJson(
    `${DEXSCREENER}/tokens/v1/solana/${mints.join(",")}`
  );

  if (!Array.isArray(pairs)) return [];

  // Group all pairs by base token, then keep the deepest pool per token.
  const byToken = new Map();

  for (const pair of pairs) {
    const address = pair?.baseToken?.address;
    if (!address) continue;

    if (!byToken.has(address)) byToken.set(address, []);
    byToken.get(address).push(pair);
  }

  const tokens = [];

  for (const tokenPairs of byToken.values()) {
    const best = pickBestPair(tokenPairs);
    if (!best) continue;

    const token = normalizeDexPair(best);

    // Keep only tokens with a real, tradable market.
    if (token.price > 0 && token.liquidity > 0) {
      tokens.push(token);
    }
  }

  tokens.sort((a, b) => b.volume24h - a.volume24h);

  return tokens;
}
