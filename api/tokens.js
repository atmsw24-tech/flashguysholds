
const DEX = "https://api.dexscreener.com";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=20");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await fetch(`${DEX}/token-profiles/latest/v1`);

    if (!response.ok) {
      throw new Error(`DEX Screener returned ${response.status}`);
    }

    const profiles = await response.json();

    const solana = (Array.isArray(profiles) ? profiles : [])
      .filter((token) => token.chainId === "solana")
      .slice(0, 30);

    const results = await Promise.all(
      solana.map(async (token) => {
        try {
          const r = await fetch(
            `${DEX}/token-pairs/v1/solana/${encodeURIComponent(token.tokenAddress)}`
          );

          if (!r.ok) return null;

          const pairs = await r.json();
          if (!Array.isArray(pairs) || !pairs.length) return null;

          const pair = pairs
            .filter((p) => p.priceUsd && Number(p.priceUsd) > 0)
            .sort(
              (a, b) =>
                Number(b.liquidity?.usd || 0) -
                Number(a.liquidity?.usd || 0)
            )[0];

          if (!pair) return null;

          return {
            chain: "solana",
            address: token.tokenAddress,
            name: pair.baseToken?.name || "Unknown",
            symbol: pair.baseToken?.symbol || "???",
            price: Number(pair.priceUsd),
            marketCap: Number(pair.marketCap || pair.fdv || 0),
            liquidity: Number(pair.liquidity?.usd || 0),
            volume24h: Number(pair.volume?.h24 || 0),
            change24h: Number(pair.priceChange?.h24 || 0),
            pairAddress: pair.pairAddress,
            pairUrl: pair.url || token.url,
            image: pair.info?.imageUrl || token.icon || null,
            createdAt: pair.pairCreatedAt || null
          };
        } catch {
          return null;
        }
      })
    );

    return res.status(200).json({
      tokens: results.filter(Boolean),
      updatedAt: new Date().toISOString(),
      source: "dexscreener",
      note: "Recent token profiles with available Solana market pairs"
    });
  } catch (error) {
    console.error("Token feed error:", error.message);
    return res.status(502).json({
      error: "Unable to fetch live token data",
      tokens: []
    });
  }
}
