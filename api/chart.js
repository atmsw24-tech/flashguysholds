const DEX = "https://api.dexscreener.com";
const GECKO = "https://api.geckoterminal.com/api/v2";
const HEADERS = { Accept: "application/json;version=20230302" };

const TIMEFRAMES = {
  "1m": { period: "minute", aggregate: 1, limit: 60 },
  "5m": { period: "minute", aggregate: 5, limit: 60 },
  "15m": { period: "minute", aggregate: 15, limit: 60 },
  "1h": { period: "hour", aggregate: 1, limit: 48 },
  "4h": { period: "hour", aggregate: 4, limit: 48 },
  "1d": { period: "day", aggregate: 1, limit: 30 },
};

function tokenAddressFromPool(pool, side) {
  const id = pool?.relationships?.[side + "_token"]?.data?.id || "";
  return String(id).replace(/^(?:token_|solana_|robinhood_)/i, "").toLowerCase();
}

function poolLiquidity(pool) {
  return Number(pool?.attributes?.reserve_in_usd || pool?.attributes?.reserve_usd || 0);
}

function cleanCandles(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.map((row) => ({
    time: Number(row?.[0]) * 1000,
    open: Number(row?.[1]),
    high: Number(row?.[2]),
    low: Number(row?.[3]),
    close: Number(row?.[4]),
    price: Number(row?.[4]),
    volume: Number(row?.[5] || 0),
  })).filter((candle) => {
    const valid = Number.isFinite(candle.time)
      && candle.time > 0
      && Number.isFinite(candle.open) && candle.open > 0
      && Number.isFinite(candle.high) && candle.high > 0
      && Number.isFinite(candle.low) && candle.low > 0
      && Number.isFinite(candle.close) && candle.close > 0
      && candle.high >= Math.max(candle.open, candle.close)
      && candle.low <= Math.min(candle.open, candle.close);
    if (!valid || seen.has(candle.time)) return false;
    seen.add(candle.time);
    return true;
  }).sort((a, b) => a.time - b.time);
}

async function fetchJson(url, headers = { Accept: "application/json" }) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const address = String(req.query?.address || "").trim();
  const fallbackPrice = Number(req.query?.fallbackPrice || 0);
  const chain = String(req.query?.chain || "sol").toLowerCase();
  const timeframe = String(req.query?.timeframe || "5m").toLowerCase();
  const tf = TIMEFRAMES[timeframe] || TIMEFRAMES["5m"];

  if (!address) {
    return res.status(400).json({ error: "Missing token address", history: [] });
  }
  if (!["sol", "solana", "robinhood"].includes(chain)) {
    return res.status(400).json({ error: "Unsupported chart network.", history: [] });
  }

  const network = chain === "robinhood" ? "robinhood" : "solana";

  try {
    // DexScreener supplies the freshest quote and candidate pairs. Prefer the
    // deepest priced pool so a tiny illiquid pair doesn't dominate the chart.
    let pairs = [];
    try {
      const payload = await fetchJson(
        `${DEX}/token-pairs/v1/${network}/${encodeURIComponent(address)}`
      );
      pairs = Array.isArray(payload) ? payload : [];
    } catch (error) {
      console.warn("DexScreener chart quote lookup failed:", error?.message || error);
    }

    const pricedPairs = pairs
      .filter((pair) => Number(pair?.priceUsd) > 0)
      .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
    const pair = pricedPairs[0] || null;
    let price = Number(pair?.priceUsd || 0);
    let history = [];
    let historyWarning = "";
    let poolAddress = "";

    // GeckoTerminal OHLCV belongs to a specific pool. Match the token as the
    // pool's BASE asset before requesting candles; using an unrelated first pool
    // can draw the wrong asset's price history.
    try {
      const poolPayload = await fetchJson(
        `${GECKO}/networks/${network}/tokens/${encodeURIComponent(address)}/pools`,
        HEADERS
      );
      const pools = Array.isArray(poolPayload?.data) ? poolPayload.data : [];
      const matchingPools = pools.filter((pool) =>
        tokenAddressFromPool(pool, "base").toLowerCase() === address.toLowerCase()
      ).sort((a, b) => poolLiquidity(b) - poolLiquidity(a));
      const pool = matchingPools[0] || null;
      poolAddress = String(pool?.attributes?.address || "");

      if (pool && !price) {
        price = Number(pool?.attributes?.base_token_price_usd || 0);
      }

      if (poolAddress) {
        const candlePayload = await fetchJson(
          `${GECKO}/networks/${network}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${tf.period}?aggregate=${tf.aggregate}&limit=${tf.limit}&currency=usd`,
          HEADERS
        );
        history = cleanCandles(candlePayload?.data?.attributes?.ohlcv_list);
        if (!history.length) {
          historyWarning = "No historical candles are indexed for this pool yet. Live price samples will appear as new market updates arrive.";
        }
      } else {
        historyWarning = "No matching indexed pool was found for historical candles yet. Live price samples will appear as market updates arrive.";
      }
    } catch (error) {
      console.warn("GeckoTerminal candle lookup failed:", error?.message || error);
      historyWarning = "Historical candles are temporarily unavailable. Showing observed market prices when available.";
    }

    if (!(price > 0) && fallbackPrice > 0) price = fallbackPrice;
    if (!(price > 0)) {
      return res.status(404).json({
        error: "No priced market pair or token-feed price is available yet.",
        address, chain: network, timeframe, history: [],
      });
    }

    return res.status(200).json({
      address,
      chain: network,
      timeframe,
      price,
      pairUrl: pair?.url || null,
      pairAddress: pair?.pairAddress || poolAddress || null,
      history,
      historyWarning,
      source: pair ? "DexScreener + GeckoTerminal" : "GeckoTerminal/token feed",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chart API error:", error?.message || error);
    return res.status(502).json({ error: "Unable to fetch the latest token price.", history: [] });
  }
}
