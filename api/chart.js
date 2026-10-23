const DEX = "https://api.dexscreener.com";
const GECKO = "https://api.geckoterminal.com/api/v2";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const address = req.query?.address;
  const fallbackPrice = Number(req.query?.fallbackPrice || 0);
  const fallbackPairAddress = String(req.query?.pairAddress || "");
  const chain = String(req.query?.chain || "sol").toLowerCase();
  const timeframe = String(req.query?.timeframe || "5m").toLowerCase();
  const tfMap = { "1m": {period:"minute",aggregate:1,limit:60}, "5m": {period:"minute",aggregate:5,limit:60}, "15m": {period:"minute",aggregate:15,limit:60}, "1h": {period:"hour",aggregate:1,limit:48}, "4h": {period:"hour",aggregate:4,limit:48}, "1d": {period:"day",aggregate:1,limit:30} };
  const tf = tfMap[timeframe] || tfMap["5m"];

  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "Missing token address", history: [] });
  }
  if (!["sol","solana","robinhood"].includes(chain)) {
    return res.status(400).json({ error: "Unsupported chart network.", history: [] });
  }
  const network = chain === "robinhood" ? "robinhood" : "solana";
  const dexChain = chain === "robinhood" ? "robinhood" : "solana";

  try {
    const pairResponse = await fetch(
      `${DEX}/token-pairs/v1/${dexChain}/${encodeURIComponent(address)}`,
      { headers: { Accept: "application/json" } }
    );
    const pairs = pairResponse.ok ? await pairResponse.json() : [];
    const pair = (Array.isArray(pairs) ? pairs : [])
      .filter((p) => Number(p.priceUsd) > 0)
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];

    // If DexScreener has no pair for this token, preserve the verified latest
    // price already supplied by the token feed rather than returning a blank chart.
    if (!pair) {
      // Try GeckoTerminal independently: some new pools are indexed there before
      // DexScreener exposes a token pair, especially on newly supported networks.
      let geckoPrice = 0;
      try {
        const fallbackPoolsResponse = await fetch(
          `${GECKO}/networks/${network}/tokens/${encodeURIComponent(address)}/pools`,
          { headers: { Accept: "application/json;version=20230302" } }
        );
        if (fallbackPoolsResponse.ok) {
          const fallbackPoolsPayload = await fallbackPoolsResponse.json();
          const rows = Array.isArray(fallbackPoolsPayload?.data) ? fallbackPoolsPayload.data : [];
          const matchingPool = rows.find((row) => {
            const baseId = row?.relationships?.base_token?.data?.id || "";
            return baseId.replace(/^token_/, "").toLowerCase() === address.toLowerCase()
              && Number(row?.attributes?.base_token_price_usd) > 0;
          });
          geckoPrice = Number(matchingPool?.attributes?.base_token_price_usd || 0);
        }
      } catch (fallbackError) {
        console.warn("Fallback chart price lookup failed:", fallbackError?.message || fallbackError);
      }
      const availablePrice = geckoPrice > 0 ? geckoPrice : fallbackPrice;
      if (availablePrice > 0) {
        return res.status(200).json({
          address, chain: network, timeframe, price: availablePrice,
          pairUrl: null, history: [],
          historyWarning: "Historical candles are not available for this market yet. Collecting observed prices from live market data.",
          updatedAt: new Date().toISOString()
        });
      }
      return res.status(404).json({ error: "No priced market pair or token-feed price is available yet.", history: [] });
    }

    // Always return the latest market price. Historical candles are an enhancement,
    // not a requirement for rendering a live chart.
    let history = [];
    let historyWarning = "";

    try {
      const poolsResponse = await fetch(
        `${GECKO}/networks/${network}/tokens/${encodeURIComponent(address)}/pools`,
        { headers: { Accept: "application/json;version=20230302" } }
      );

      if (poolsResponse.ok) {
        const poolsPayload = await poolsResponse.json();
        const pool = Array.isArray(poolsPayload?.data) ? poolsPayload.data[0] : null;
        const poolAddress = pool?.attributes?.address;

        if (poolAddress) {
          const candlesResponse = await fetch(
            `${GECKO}/networks/${network}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${tf.period}?aggregate=${tf.aggregate}&limit=${tf.limit}&currency=usd`,
            { headers: { Accept: "application/json;version=20230302" } }
          );

          if (candlesResponse.ok) {
            const candlesPayload = await candlesResponse.json();
            const rows = candlesPayload?.data?.attributes?.ohlcv_list;
            history = (Array.isArray(rows) ? rows : [])
              .map((row) => ({ time: Number(row[0]) * 1000, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), price: Number(row[4]) }))
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
      chain: network,
      timeframe,
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
