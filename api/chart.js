
const DEX = "https://api.dexscreener.com";

export default async function handler(req, res) {
  const address = req.query.address;

  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "Missing token address" });
  }

  try {
    const response = await fetch(
      `${DEX}/token-pairs/v1/solana/${encodeURIComponent(address)}`
    );

    if (!response.ok) {
      return res.status(502).json({ error: "Market data unavailable" });
    }

    const pairs = await response.json();

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(404).json({ error: "No market pairs found" });
    }

    const pair = pairs
      .filter((p) => Number(p.priceUsd) > 0)
      .sort(
        (a, b) =>
          Number(b.liquidity?.usd || 0) -
          Number(a.liquidity?.usd || 0)
      )[0];

    if (!pair) {
      return res.status(404).json({ error: "No valid price available" });
    }

    const now = Date.now();
    const changes = [
      { label: "5m", value: pair.priceChange?.m5 },
      { label: "1h", value: pair.priceChange?.h1 },
      { label: "6h", value: pair.priceChange?.h6 },
      { label: "24h", value: pair.priceChange?.h24 }
    ];

    return res.status(200).json({
      address,
      price: Number(pair.priceUsd),
      pairUrl: pair.url,
      changes: changes
        .filter((x) => Number.isFinite(Number(x.value)))
        .map((x, i) => ({
          time: now - (3 - i) * 60 * 60 * 1000,
          label: x.label,
          changePercent: Number(x.value)
        }))
    });
  } catch (error) {
    console.error("Chart API error:", error.message);
    return res.status(502).json({ error: "Chart request failed" });
  }
}
