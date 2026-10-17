const DEX = "https://api.dexscreener.com";
const GECKO = "https://api.geckoterminal.com/api/v2";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const address = req.query?.address;
  const chain = String(req.query?.chain || "sol").toLowerCase();

  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "Missing token address", history: [] });
  }
  if (chain !== "sol" && chain !== "solana") {
    return res.status(400).json({ error: "Charts currently support Solana tokens only.", history: [] });
  }

  try {
    const pairResponse = await fetch(
      `${DEX}/token-pairs/v1/solana/${encodeURIComponent(address)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!pairResponse.ok) {
      return res.status(502).json({ error: `Market provider returned ${pairResponse.status}`, history: [] });
    }

    const pairs = await pairResponse.json();
    const pair = (Array.isArray(pairs) ? pairs : [])
      .filter((p) => Number(p.priceUsd) > 0)
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];

    if (!pair) {
      return res.status(404).json({ error: "No priced market pair found for this token.", history: [] });
    }

    // Always return the latest market price. Historical candles are an enhancement,
    // not a requirement for rendering a live chart.
    let history = [];
    let historyWarning = "";

    try {
      const poolsResponse = await fetch(
        `${GECKO}/networks/solana/tokens/${encodeURIComponent(address)}/pools`,
        { headers: { Accept: "application/json;version=20230302" } }
      );

      if (poolsResponse.ok) {
        const poolsPayload = await poolsResponse.json();
        const pool = Array.isArray(poolsPayload?.data) ? poolsPayload.data[0] : null;
        const poolAddress = pool?.attributes?.address;

        if (poolAddress) {
          const candlesResponse = await fetch(
            `${GECKO}/networks/solana/pools/${encodeURIComponent(poolAddress)}/ohlcv/hour?aggregate=1&limit=24&currency=usd`,
            { headers: { Accept: "application/json;version=20230302" } }
          );

          if (candlesResponse.ok) {
            const candlesPayload = await candlesResponse.json();
            const rows = candlesPayload?.data?.attributes?.ohlcv_list;
            history = (Array.isArray(rows) ? rows : [])
              .map((row) => ({ time: Number(row[0]) * 1000, price: Number(row[4]) }))
              .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0)
              .sort((a, b) => a.time - b.time);
          } else {
            historyWarning = "Historical candles are temporarily unavailable; showing live price samples.";
          }
        } else {
          historyWarning = "Historical candles are not available yet; showing live price samples.";
        }
      } else {
        historyWarning = "Historical candles are temporarily unavailable; showing live price samples.";
      }
    } catch (historyError) {
      console.error("Historical candle lookup failed:", historyError?.message || historyError);
      historyWarning = "Historical candles are temporarily unavailable; showing live price samples.";
    }

    return res.status(200).json({
      address,
      price: Number(pair.priceUsd),
      pairUrl: pair.url || null,
      history,
      historyWarning,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Chart API error:", error?.message || error);
    return res.status(502).json({ error: "Unable to fetch the latest token price.", history: [] });
  }
}
