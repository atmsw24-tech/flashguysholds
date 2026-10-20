const DEX = "https://api.dexscreener.com";

function toToken(pair, query) {
  const q = String(query || "").trim().toLowerCase();
  const base = pair.baseToken || {};
  const quote = pair.quoteToken || {};
  const matched = String(base.address || "").toLowerCase() === q ? base
    : String(quote.address || "").toLowerCase() === q ? quote
    : base;
  const isBase = String(matched.address || "").toLowerCase() === String(base.address || "").toLowerCase();

  return {
    id: pair.pairAddress || matched.address,
    chain: pair.chainId === "robinhood" ? "robinhood" : pair.chainId === "solana" ? "sol" : pair.chainId,
    address: matched.address || "",
    name: matched.name || "Unknown",
    symbol: matched.symbol || "???",
    price: Number(isBase ? pair.priceUsd : pair.priceNative) || 0,
    marketCap: Number(pair.marketCap || pair.fdv || 0),
    liquidity: Number(pair.liquidity?.usd || 0),
    volume1h: Number(pair.volume?.h1 || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    change24h: Number(pair.priceChange?.h24 || 0),
    pairAddress: pair.pairAddress || null,
    pairUrl: pair.url || null,
    logo: pair.info?.imageUrl || null,
    createdAt: pair.pairCreatedAt || null,
    priceHistory: [],
    source: "DexScreener search"
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=10");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, tokens: [], error: "Method not allowed" });
  }

  const q = String(req.query?.q || "").trim();
  const requestedChain = String(req.query?.chain || "all").toLowerCase();
  if (q.length < 2) return res.status(200).json({ success: true, tokens: [] });
  if (!["all", "sol", "solana", "robinhood"].includes(requestedChain)) {
    return res.status(400).json({ success: false, tokens: [], error: "Unsupported chain" });
  }

  try {
    let rawPairs = [];
    const looksLikeAddress = q.length >= 32;

    if (looksLikeAddress) {
      // Exact Solana mint searches should query token pools directly. A
      // general text search can omit newly launched or low-liquidity mints.
      const chainIds = requestedChain === "robinhood"
        ? ["robinhood"]
        : requestedChain === "sol" || requestedChain === "solana"
          ? ["solana"]
          : ["solana", "robinhood"];

      const responses = await Promise.all(chainIds.map(async (chainId) => {
        const response = await fetch(`${DEX}/token-pairs/v1/${chainId}/${encodeURIComponent(q)}`, {
          headers: { Accept: "application/json" }
        });
        if (!response.ok) return [];
        const payload = await response.json();
        return Array.isArray(payload) ? payload : [];
      }));
      rawPairs = responses.flat();
    } else {
      const response = await fetch(`${DEX}/latest/dex/search?q=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`DexScreener search returned ${response.status}`);
      const data = await response.json();
      rawPairs = Array.isArray(data?.pairs) ? data.pairs : [];
    }

    const queryLower = q.toLowerCase();
    const pairs = rawPairs
      .filter((pair) => {
        const chain = String(pair.chainId || "").toLowerCase();
        if (requestedChain === "sol" || requestedChain === "solana") return chain === "solana";
        if (requestedChain === "robinhood") return chain === "robinhood";
        return true;
      })
      .filter((pair) => {
        if (!looksLikeAddress) return true;
        return [pair.baseToken?.address, pair.quoteToken?.address]
          .some((address) => String(address || "").toLowerCase() === queryLower);
      })
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));

    const unique = new Map();
    for (const pair of pairs) {
      const token = toToken(pair, q);
      const key = String(token.address || "").toLowerCase();
      if (key && !unique.has(key)) unique.set(key, token);
    }
    return res.status(200).json({
      success: true,
      query: q,
      source: "DexScreener",
      tokens: [...unique.values()].slice(0, 30)
    });
  } catch (error) {
    console.error("Token search failed:", error?.message || error);
    return res.status(502).json({ success: false, tokens: [], error: "Live token search temporarily unavailable" });
  }
}
