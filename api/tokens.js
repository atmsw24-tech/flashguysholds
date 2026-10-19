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

async function getLatestProfiles() {
  const response = await fetch(`${DEX}/token-profiles/latest/v1`);
  if (!response.ok) throw new Error(`DEX Screener profiles returned ${response.status}`);
  const profiles = await response.json();
  return Array.isArray(profiles) ? profiles : [];
}

// DexScreener supports up to 30 token addresses per request. Batch them rather
// than issuing one request per coin; this avoids rate-limit pressure on refresh.
async function getTokenPairs(chainId, addresses) {
  const unique = [...new Set(addresses.filter(Boolean))];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));

  const batches = await Promise.all(chunks.map(async (chunk) => {
    try {
      const url = `${DEX}/tokens/v1/${chainId}/${chunk.map(encodeURIComponent).join(",")}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`DexScreener batch lookup failed (${chainId}): ${response.status}`);
        return [];
      }
      const pairs = await response.json();
      return Array.isArray(pairs) ? pairs : [];
    } catch (error) {
      console.warn(`DexScreener batch lookup error (${chainId}):`, error?.message || error);
      return [];
    }
  }));
  return batches.flat();
}

// Holder counts are only shown when returned by an indexed data provider.
// Birdeye exposes total holder counts for Solana tokens; a plain RPC balance
// query cannot reliably provide a total count without indexing every account.
async function getSolanaHolderCount(address) {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey || !address) return null;
  try {
    const url = `https://public-api.birdeye.so/defi/v3/token/holder?address=${encodeURIComponent(address)}&offset=0&limit=1`;
    const response = await fetch(url, {
      headers: { accept: "application/json", "X-API-KEY": apiKey, "x-chain": "solana" }
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const total = payload?.data?.total ?? payload?.data?.totalHolders ?? payload?.data?.holderCount;
    return Number.isFinite(Number(total)) && total !== null ? Number(total) : null;
  } catch (error) {
    console.warn("Solana holder lookup failed:", error?.message || error);
    return null;
  }
}

async function addHolderCounts(tokens) {
  // Keep optional holder lookups bounded so one feed refresh cannot fan out
  // into hundreds of paid provider calls. Missing counts remain null, not zero.
  const solana = tokens.filter((token) => token.chain === "sol").slice(0, 20);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, solana.length) }, async () => {
    while (cursor < solana.length) {
      const token = solana[cursor++];
      token.holders = await getSolanaHolderCount(token.address);
    }
  });
  await Promise.all(workers);
  return tokens;
}

function bestPairForToken(pairs, address) {
  const key = String(address || "").toLowerCase();
  return pairs
    .filter((pair) =>
      String(pair.baseToken?.address || "").toLowerCase() === key
      && Number(pair.priceUsd) > 0
    )
    .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0] || null;
}

function toMarketToken(profile, pair, chain) {
  if (!pair) return null;
  return {
    id: pair.pairAddress || profile.tokenAddress,
    chain,
    address: profile.tokenAddress,
    name: pair.baseToken?.name || "Unknown",
    symbol: pair.baseToken?.symbol || "???",
    price: Number(pair.priceUsd || 0),
    marketCap: Number(pair.marketCap || pair.fdv || 0),
    liquidity: Number(pair.liquidity?.usd || 0),
    volume1h: Number(pair.volume?.h1 || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    change24h: Number(pair.priceChange?.h24 || 0),
    pairAddress: pair.pairAddress || null,
    pairUrl: pair.url || profile.url || null,
    logo: pair.info?.imageUrl || profile.icon || null,
    createdAt: pair.pairCreatedAt || null,
    priceHistory: []
  };
}

async function getSolanaTokens(profiles) {
  const selected = profiles
    .filter((token) => token.chainId === "solana" && token.tokenAddress)
    .slice(0, 80);
  const pairs = await getTokenPairs("solana", selected.map((token) => token.tokenAddress));
  return selected.map((profile) => toMarketToken(profile, bestPairForToken(pairs, profile.tokenAddress), "sol")).filter(Boolean);
}

async function getRobinhoodTokens(profiles) {
  const selected = profiles
    .filter((token) => token.chainId === "robinhood" && token.tokenAddress)
    .slice(0, 80);
  const pairs = await getTokenPairs("robinhood", selected.map((token) => token.tokenAddress));
  return selected.map((profile) => toMarketToken(profile, bestPairForToken(pairs, profile.tokenAddress), "robinhood")).filter(Boolean);
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
    const profiles = await getLatestProfiles();
    const [solanaResult, robinhoodResult] = await Promise.allSettled([
      chain === "robinhood" ? Promise.resolve([]) : getSolanaTokens(profiles),
      chain === "sol" ? Promise.resolve([]) : getRobinhoodTokens(profiles)
    ]);

    const tokens = await addHolderCounts([
      ...(solanaResult.status === "fulfilled" ? solanaResult.value : []),
      ...(robinhoodResult.status === "fulfilled" ? robinhoodResult.value : [])
    ]);

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
