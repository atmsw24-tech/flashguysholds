const DEX = "https://api.dexscreener.com";

function send(res, status, body) {
  return res.status(status).json(body);
}

function normalizeRobinhoodPayload(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.tokens)
      ? payload.tokens
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return rows.map((token) => ({
    ...token,
    chain: "robinhood",
    address: token.address || token.tokenAddress || token.contractAddress || token.id,
    name: token.name || token.baseToken?.name || "Unknown",
    symbol: token.symbol || token.baseToken?.symbol || "???",
    price: Number(token.price ?? token.priceUsd ?? 0),
    marketCap: Number(token.marketCap ?? token.fdv ?? 0),
    liquidity: Number(token.liquidity ?? token.liquidity?.usd ?? 0),
    volume1h: Number(token.volume1h ?? token.volume?.h1 ?? 0),
    volume24h: Number(token.volume24h ?? token.volume?.h24 ?? 0),
    change24h: Number(token.change24h ?? token.priceChange?.h24 ?? 0),
    createdAt: token.createdAt || token.pairCreatedAt || token.timestamp || Date.now(),
    logo: token.logo || token.image || token.info?.imageUrl || null
  })).filter((token) => token.address);
}

async function getSolanaTokens() {
  const response = await fetch(`${DEX}/token-profiles/latest/v1`);
  if (!response.ok) throw new Error(`DEX Screener returned ${response.status}`);

  const profiles = await response.json();
  const solanaProfiles = (Array.isArray(profiles) ? profiles : [])
    .filter((token) => token.chainId === "solana" && token.tokenAddress)
    .slice(0, 40);

  const results = await Promise.all(solanaProfiles.map(async (token) => {
    try {
      const r = await fetch(`${DEX}/token-pairs/v1/solana/${encodeURIComponent(token.tokenAddress)}`);
      if (!r.ok) return null;
      const pairs = await r.json();
      if (!Array.isArray(pairs) || !pairs.length) return null;

      const pair = pairs
        .filter((p) => Number(p.priceUsd) > 0)
        .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];

      if (!pair) return null;

      return {
        id: pair.pairAddress || token.tokenAddress,
        chain: "sol",
        address: token.tokenAddress,
        name: pair.baseToken?.name || "Unknown",
        symbol: pair.baseToken?.symbol || "???",
        price: Number(pair.priceUsd || 0),
        marketCap: Number(pair.marketCap || pair.fdv || 0),
        liquidity: Number(pair.liquidity?.usd || 0),
        volume1h: Number(pair.volume?.h1 || 0),
        volume24h: Number(pair.volume?.h24 || 0),
        change24h: Number(pair.priceChange?.h24 || 0),
        pairAddress: pair.pairAddress || null,
        pairUrl: pair.url || token.url || null,
        logo: pair.info?.imageUrl || token.icon || null,
        createdAt: pair.pairCreatedAt || null,
        priceHistory: []
      };
    } catch (error) {
      console.error("Pair lookup failed:", error?.message || error);
      return null;
    }
  }));

  return results.filter(Boolean);
}

async function getRobinhoodTokens() {
  // Use DexScreener's real Robinhood Chain market data directly, rather than
  // requiring an undocumented custom feed URL in Vercel.
  const response = await fetch(`${DEX}/token-profiles/latest/v1`);
  if (!response.ok) throw new Error(`DexScreener profiles returned ${response.status}`);

  const profiles = await response.json();
  const robinhoodProfiles = (Array.isArray(profiles) ? profiles : [])
    .filter((token) => token.chainId === "robinhood" && token.tokenAddress)
    .slice(0, 40);

  const results = await Promise.all(robinhoodProfiles.map(async (token) => {
    try {
      const r = await fetch(`${DEX}/token-pairs/v1/robinhood/${encodeURIComponent(token.tokenAddress)}`);
      if (!r.ok) return null;
      const pairs = await r.json();
      if (!Array.isArray(pairs) || !pairs.length) return null;

      // Only use a market where the profile's contract is the base token,
      // so the returned price and symbol refer to the same asset.
      const pair = pairs
        .filter((p) =>
          String(p.baseToken?.address || "").toLowerCase() === String(token.tokenAddress).toLowerCase()
          && Number(p.priceUsd) > 0
        )
        .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];

      if (!pair) return null;

      return {
        id: pair.pairAddress || token.tokenAddress,
        chain: "robinhood",
        address: token.tokenAddress,
        name: pair.baseToken?.name || "Unknown",
        symbol: pair.baseToken?.symbol || "???",
        price: Number(pair.priceUsd || 0),
        marketCap: Number(pair.marketCap || pair.fdv || 0),
        liquidity: Number(pair.liquidity?.usd || 0),
        volume1h: Number(pair.volume?.h1 || 0),
        volume24h: Number(pair.volume?.h24 || 0),
        change24h: Number(pair.priceChange?.h24 || 0),
        pairAddress: pair.pairAddress || null,
        pairUrl: pair.url || token.url || null,
        logo: pair.info?.imageUrl || token.icon || null,
        createdAt: pair.pairCreatedAt || null,
        priceHistory: []
      };
    } catch (error) {
      console.error("Robinhood pair lookup failed:", error?.message || error);
      return null;
    }
  }));

  return results.filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=10");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { success: false, error: "Method not allowed", tokens: [] });
  }

  const requested = String(req.query?.chain || "all").toLowerCase();
  const chain = requested === "solana" ? "sol" : requested;

  if (!["all", "sol", "robinhood"].includes(chain)) {
    return send(res, 400, { success: false, error: "Unsupported chain. Use all, sol, or robinhood.", tokens: [] });
  }

  try {
    const [solanaResult, robinhoodResult] = await Promise.allSettled([
      chain === "robinhood" ? Promise.resolve([]) : getSolanaTokens(),
      chain === "sol" ? Promise.resolve([]) : getRobinhoodTokens()
    ]);

    const tokens = [
      ...(solanaResult.status === "fulfilled" ? solanaResult.value : []),
      ...(robinhoodResult.status === "fulfilled" ? robinhoodResult.value : [])
    ];

    const errors = [];
    if (solanaResult.status === "rejected") errors.push("Solana feed temporarily unavailable");
    if (robinhoodResult.status === "rejected") errors.push("Robinhood Chain feed temporarily unavailable");

    if (!tokens.length && errors.length) {
      return send(res, 502, { success: false, error: errors.join("; "), tokens: [] });
    }

    return send(res, 200, {
      success: true,
      tokens,
      updatedAt: new Date().toISOString(),
      source: "DexScreener",
      note: null,
      warnings: errors
    });
  } catch (error) {
    console.error("Token feed error:", error?.message || error);
    return send(res, 502, { success: false, error: "Unable to fetch live token data", tokens: [] });
  }
}
