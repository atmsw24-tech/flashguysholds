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
// Birdeye's holder-profile endpoint returns holder summary data for Solana.
async function getHolderCount(token) {
  // Birdeye's holder-profile endpoint is Solana-only. Do not label EVM-chain
  // counts as unavailable from this provider as if the request were supported.
  if (!token?.address || (token.chain !== "sol" && token.chain !== "solana")) return null;
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://public-api.birdeye.so/token/v1/holder-profile?token_address=${encodeURIComponent(token.address)}&include_zero_balance=false`,
      {
        headers: {
          accept: "application/json",
          "X-API-KEY": apiKey,
          "x-chain": "solana"
        }
      }
    );
    if (!response.ok) {
      console.warn(`Birdeye holder-profile failed: ${response.status}`);
      return null;
    }

    const payload = await response.json();
    const data = payload?.data || {};
    // Provider response shapes may expose the count under different names.
    // Only accept a finite, non-negative number; never turn missing data into 0.
    const candidates = [
      data.holder_count,
      data.holderCount,
      data.total_holders,
      data.totalHolders,
      data.total_holder,
      data.totalHolder,
      data.holders_count,
      data.holdersCount,
      data.holder,
      data.token?.holder_count,
      data.token?.holderCount,
      data.token?.holders,
      data.summary?.holder_count,
      data.summary?.holderCount,
      data.summary?.totalHolders
    ];
    for (const candidate of candidates) {
      const raw = candidate && typeof candidate === "object"
        ? (candidate.total ?? candidate.count ?? candidate.holder_count ?? candidate.holderCount)
        : candidate;
      if (raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
        return Number(raw);
      }
    }
    console.warn("Birdeye holder-profile response had no recognized holder-count field");
    return null;
  } catch (error) {
    console.warn("Birdeye holder lookup failed:", error?.message || error);
    return null;
  }
}

async function addHolderCounts(tokens) {
  // Limit per-refresh enrichment to avoid an unbounded number of provider calls.
  // Missing counts remain null; never represent missing data as zero.
  const candidates = tokens.filter((token) => token.chain === "sol" || token.chain === "solana" || token.chain === "robinhood").slice(0, 50);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(5, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const token = candidates[cursor++];
      token.holders = await getHolderCount(token);
      token.holderSource = token.holders !== null ? "Birdeye indexed data" : null;
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
    // Prefer the live pair's image, then the token profile icon. Some newly
    // launched tokens only have an image URI in their launch metadata.
    logo: pair.info?.imageUrl || profile.icon || profile.image || null,
    image: pair.info?.imageUrl || profile.icon || profile.image || null,
    description: profile.description || pair.info?.description || null,
    website: (pair.info?.websites || profile.links || []).find((link) => String(link.type || "").toLowerCase() === "website" || link.url)?.url || null,
    socials: (pair.info?.socials || profile.links || []).map((link) => ({ type: link.type || link.platform || link.label || "link", url: link.url || (link.handle ? `https://${String(link.platform || link.type || "").toLowerCase()}.com/${link.handle.replace(/^@/, "")}` : null) })).filter((link) => link.url),
    fdv: Number(pair.fdv || 0),
    dexId: pair.dexId || null,
    txns5m: pair.txns?.m5 || null,
    txns1h: pair.txns?.h1 || null,
    txns24h: pair.txns?.h24 || null,
    buys24h: Number(pair.txns?.h24?.buys || 0),
    sells24h: Number(pair.txns?.h24?.sells || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    pairCreatedAt: pair.pairCreatedAt || null,
    createdAt: pair.pairCreatedAt || null,
    priceHistory: []
  };
}

async function getGeckoTerminalSolanaPools() {
  // Discover newly indexed Solana pools independently of DexScreener's
  // promotional token-profile feed, which omits many fresh launches.
  try {
    const response = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1&include=base_token,quote_token",
      { headers: { accept: "application/json" } }
    );
    if (!response.ok) {
      console.warn(`GeckoTerminal Solana new-pools returned ${response.status}`);
      return [];
    }
    const payload = await response.json();
    const included = new Map(
      (Array.isArray(payload.included) ? payload.included : [])
        .filter((item) => item.type === "token")
        .map((item) => [item.id, item.attributes || {}])
    );
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows.map((pool) => {
      const attrs = pool.attributes || {};
      const rel = pool.relationships || {};
      const baseId = rel.base_token?.data?.id;
      const base = included.get(baseId) || {};
      const address = base.address || (baseId ? baseId.replace(/^token_/, "") : null);
      if (!address) return null;
      const volume = attrs.volume_usd || {};
      const change = attrs.price_change_percentage || {};
      return {
        id: pool.id,
        chain: "sol",
        address,
        name: base.name || String(attrs.name || "Unknown").split(" / ")[0],
        symbol: base.symbol || "???",
        price: Number(attrs.base_token_price_usd || 0),
        marketCap: Number(attrs.market_cap_usd || attrs.fdv_usd || 0),
        liquidity: Number(attrs.reserve_in_usd || 0),
        volume1h: Number(volume.h1 || 0),
        volume24h: Number(volume.h24 || 0),
        change24h: Number(change.h24 || 0),
        createdAt: attrs.pool_created_at || null,
        pairCreatedAt: attrs.pool_created_at || null,
        logo: base.image_url || null,
        image: base.image_url || null,
        pairAddress: attrs.address || null,
        pairUrl: `https://www.geckoterminal.com/solana/pools/${attrs.address || pool.id}`,
        dexId: attrs.dex_id || null,
        source: "GeckoTerminal",
        protocol: attrs.dex_id || null,
        holders: null,
        holderSource: null
      };
    }).filter(Boolean);
  } catch (error) {
    console.warn("GeckoTerminal Solana discovery failed:", error?.message || error);
    return [];
  }
}

async function getSolanaTokens(profiles) {
  // DexScreener profile discovery alone misses many brand-new Solana launches.
  // Combine it with GeckoTerminal's indexed new-pools feed so fresh pools can
  // appear even when they have not been promoted in token profiles.
  const selected = profiles
    .filter((token) => token.chainId === "solana" && token.tokenAddress)
    .slice(0, 120);
  const [pairs, geckoTokens] = await Promise.all([
    getTokenPairs("solana", selected.map((token) => token.tokenAddress)),
    getGeckoTerminalSolanaPools()
  ]);
  const dexTokens = selected
    .map((profile) => toMarketToken(profile, bestPairForToken(pairs, profile.tokenAddress), "sol"))
    .filter(Boolean)
    .map((token) => ({ ...token, protocol: "PUMPFUN/PUMPSWAP", source: "DexScreener" }));

  const byAddress = new Map();
  for (const token of [...geckoTokens, ...dexTokens]) {
    const key = String(token.address || "").toLowerCase();
    if (!key) continue;
    const existing = byAddress.get(key);
    // Prefer more complete market data while retaining metadata from either source.
    if (!existing) {
      byAddress.set(key, token);
    } else {
      const preferred = Number(token.liquidity || 0) >= Number(existing.liquidity || 0) ? token : existing;
      byAddress.set(key, { ...existing, ...token, ...preferred,
        logo: preferred.logo || existing.logo || token.logo || null,
        image: preferred.image || existing.image || token.image || null,
        pairUrl: preferred.pairUrl || existing.pairUrl || token.pairUrl || null,
        source: existing.source === token.source ? existing.source : "GeckoTerminal + DexScreener"
      });
    }
  }
  return [...byAddress.values()].sort((a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

async function getGeckoTerminalRobinhoodPools() {
  // DexScreener's latest-profile list is a small promotional list, not a
  // complete token directory. Use GeckoTerminal's indexed new-pools feed as
  // an additional discovery source for Robinhood Chain (network id: robinhood).
  try {
    const response = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=1&include=base_token,quote_token",
      { headers: { accept: "application/json" } }
    );
    if (!response.ok) {
      console.warn(`GeckoTerminal Robinhood new-pools returned ${response.status}`);
      return [];
    }
    const payload = await response.json();
    const included = new Map(
      (Array.isArray(payload.included) ? payload.included : [])
        .filter((item) => item.type === "token")
        .map((item) => [item.id, item.attributes || {}])
    );
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows.map((pool) => {
      const attrs = pool.attributes || {};
      const rel = pool.relationships || {};
      const baseId = rel.base_token?.data?.id;
      const base = included.get(baseId) || {};
      const address = base.address || (baseId ? baseId.replace(/^token_/, "") : null);
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
      const volume = attrs.volume_usd || {};
      const change = attrs.price_change_percentage || {};
      return {
        id: pool.id,
        chain: "robinhood",
        address,
        name: base.name || String(attrs.name || "Unknown").split(" / ")[0],
        symbol: base.symbol || "???",
        price: Number(attrs.base_token_price_usd || 0),
        marketCap: Number(attrs.market_cap_usd || attrs.fdv_usd || 0),
        liquidity: Number(attrs.reserve_in_usd || 0),
        volume1h: Number(volume.h1 || 0),
        volume24h: Number(volume.h24 || 0),
        change24h: Number(change.h24 || 0),
        createdAt: attrs.pool_created_at || null,
        logo: base.image_url || null,
        image: base.image_url || null,
        pairAddress: attrs.address || null,
        pairUrl: `https://www.geckoterminal.com/robinhood/pools/${attrs.address || pool.id}`,
        dexId: attrs.dex_id || null,
        source: "GeckoTerminal",
        protocol: attrs.dex_id || null,
        holders: null,
        holderSource: null
      };
    }).filter(Boolean);
  } catch (error) {
    console.warn("GeckoTerminal Robinhood discovery failed:", error?.message || error);
    return [];
  }
}

async function getRobinhoodTokens(profiles) {
  const selected = profiles
    .filter((token) => token.chainId === "robinhood" && token.tokenAddress)
    .slice(0, 80);
  const pairs = selected.length
    ? await getTokenPairs("robinhood", selected.map((token) => token.tokenAddress))
    : [];
  const dexTokens = selected
    .map((profile) => toMarketToken(profile, bestPairForToken(pairs, profile.tokenAddress), "robinhood"))
    .filter(Boolean);
  const geckoTokens = await getGeckoTerminalRobinhoodPools();

  // Prefer the pair with the most useful liquidity/price data when the same
  // contract is listed by both sources. Never fabricate missing prices or CA.
  const byAddress = new Map();
  for (const token of [...geckoTokens, ...dexTokens]) {
    const key = String(token.address || "").toLowerCase();
    if (!key) continue;
    const existing = byAddress.get(key);
    if (!existing || (Number(token.liquidity || 0) > Number(existing.liquidity || 0))) {
      byAddress.set(key, { ...existing, ...token });
    }
  }
  return [...byAddress.values()].sort((a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

export default async function handler(req, res) {
  // Let Vercel cache market data briefly; websocket feeds handle live launches.
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=45");
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
    // Keep the Robinhood feed independent: if DexScreener's profile endpoint
    // is unavailable, GeckoTerminal can still provide Robinhood new pools.
    const profiles = await getLatestProfiles().catch((error) => {
      console.warn("DexScreener latest profiles unavailable:", error?.message || error);
      return [];
    });
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
      source: chain === "robinhood" ? "GeckoTerminal + DexScreener" : "DexScreener",
      note: null,
      warnings: errors
    });
  } catch (error) {
    console.error("Token feed error:", error?.message || error);
    return send(res, 502, { success: false, error: "Unable to fetch live token data", tokens: [] });
  }
}
