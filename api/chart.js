const DEX = "https://api.dexscreener.com";
const GECKO = "https://api.geckoterminal.com/api/v2";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const address = req.query?.address;
  const chain = String(req.query?.chain || "sol").toLowerCase();

  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "Missing token address", history: [] });
  }
  if (chain !== "sol" && chain !== "solana") {
    return res.status(400).json({
      error: "Historical chart is currently supported for Solana tokens only.",
      history: []
    });
  }

  try {
    const pairResponse = await fetch(
      `${DEX}/token-pairs/v1/solana/${encodeURIComponent(address)}`
    );
    if (!pairResponse.ok) {
      return res.status(502).json({ error: "Market data unavailable", history: [] });
    }

    const pairs = await pairResponse.json();
    const pair = (Array.isArray(pairs) ? pairs : [])
      .filter((p) => Number(p.priceUsd) > 0 && p.pairAddress)
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];

    if (!pair) {
      return res.status(404).json({ error: "No market pair found for this token", history: [] });
    }

    const poolsResponse = await fetch(
      `${GECKO}/networks/solana/tokens/${encodeURIComponent(address)}/pools`,
      { headers: { Accept: "application/json;version=20230302" } }
    );

    if (!poolsResponse.ok) {
      return res.status(502).json({
        error: "Price is available, but historical chart provider is temporarily unavailable.",
        price: Number(pair.priceUsd),
        pairUrl: pair.url,
        history: []
      });
    }

    const poolsPayload = await poolsResponse.json();
    const pools = Array.isArray(poolsPayload?.data) ? poolsPayload.data : [];
    const pool = pools[0];
    if (!pool?.attributes?.address) {
      return res.status(404).json({
        error: "Historical candles are not available for this token yet.",
        price: Number(pair.priceUsd),
        pairUrl: pair.url,
        history: []
      });
    }

    const ohlcvResponse = await fetch(
      `${GECKO}/networks/solana/pools/${encodeURIComponent(pool.attributes.address)}/ohlcv/hour?aggregate=1&limit=24&currency=usd`,
      { headers: { Accept: "application/json;version=20230302" } }
    );
    if (!ohlcvResponse.ok) {
      return res.status(502).json({
        error: "Historical chart data is temporarily unavailable.",
        price: Number(pair.priceUsd),
        pairUrl: pair.url,
        history: []
      });
    }

    const ohlcvPayload = await ohlcvResponse.json();
    const rows = ohlcvPayload?.data?.attributes?.ohlcv_list;
    const history = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        time: Number(row[0]) * 1000,
        price: Number(row[4])
      }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0)
      .sort((a, b) => a.time - b.time);

    return res.status(200).json({
      address,
      price: Number(pair.priceUsd),
      pairUrl: pair.url,
      history,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Chart API error:", error?.message || error);
    return res.status(502).json({ error: "Chart request failed", history: [] });
  }
}
