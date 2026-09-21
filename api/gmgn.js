export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const apiKey = process.env.GMGN_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "GMGN_API_KEY is missing"
    });
  }

  const chain =
    String(req.query.chain || "sol").toLowerCase();

  const chains =
    chain === "all"
      ? ["sol", "robinhood"]
      : [chain];

  try {
    const allTokens = [];

    for (const currentChain of chains) {
      const response = await fetch(
        "https://api.gmgn.ai/v1/trenches",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },

          body: JSON.stringify({
            chain: currentChain,
            type: ["new_creation"],
            limit: 80
          })
        }
      );

      const raw = await response.text();

      if (!response.ok) {
        console.error(
          "GMGN error:",
          response.status,
          raw
        );

        continue;
      }

      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        console.error(
          "GMGN returned invalid JSON:",
          raw
        );

        continue;
      }

      /*
       * GMGN documents:
       *
       * data.new_creation
       *
       * for newly-created tokens.
       */

      const tokens =
        data?.data?.new_creation || [];

      if (!Array.isArray(tokens)) {
        console.error(
          "Unexpected GMGN response:",
          JSON.stringify(data)
        );

        continue;
      }

      for (const token of tokens) {
        /*
         * These are the actual GMGN trenches
         * fields documented by GMGN.
         */

        const address =
          token.address || "";

        const name =
          token.name || "";

        const symbol =
          token.symbol || "";

        /*
         * Do NOT display "Unknown Token"
         * when GMGN doesn't provide metadata.
         *
         * Instead, skip the incomplete record.
         */

        if (!address || !name || !symbol) {
          continue;
        }

        const createdTimestamp =
          Number(
            token.created_timestamp || 0
          );

        const ageMinutes =
          createdTimestamp > 0
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() / 1000 -
                    createdTimestamp) /
                    60
                )
              )
            : null;

        allTokens.push({
          id:
            `${currentChain}-${address}`,

          chain:
            currentChain,

          address,

          name,

          symbol,

          logo:
            token.logo || null,

          price:
            Number(token.price || 0),

          marketCap:
            Number(
              token.usd_market_cap || 0
            ),

          liquidity:
            Number(
              token.liquidity || 0
            ),

          volume1h:
            Number(
              token.volume_1h || 0
            ),

          volume24h:
            Number(
              token.volume_24h || 0
            ),

          swaps1m:
            Number(
              token.swaps_1m || 0
            ),

          swaps1h:
            Number(
              token.swaps_1h || 0
            ),

          swaps24h:
            Number(
              token.swaps_24h || 0
            ),

          buys24h:
            Number(
              token.buys_24h || 0
            ),

          sells24h:
            Number(
              token.sells_24h || 0
            ),

          holders:
            Number(
              token.holder_count || 0
            ),

          netBuy24h:
            Number(
              token.net_buy_24h || 0
            ),

          launchpad:
            token.launchpad_platform ||
            "",

          exchange:
            token.exchange ||
            "",

          createdAt:
            createdTimestamp,

          ageMinutes
        });
      }
    }

    /*
     * Remove duplicates.
     */

    const unique =
      new Map();

    for (const token of allTokens) {
      const key =
        `${token.chain}:${token.address}`;

      if (!unique.has(key)) {
        unique.set(key, token);
      }
    }

    const tokens =
      Array.from(unique.values());

    /*
     * Newest first.
     */

    tokens.sort(
      (a, b) =>
        (b.createdAt || 0) -
        (a.createdAt || 0)
    );

    return res.status(200).json({
      success: true,
      source: "GMGN",
      live: true,
      count: tokens.length,
      tokens
    });

  } catch (error) {
    console.error(
      "GMGN API error:",
      error
    );

    return res.status(500).json({
      success: false,
      live: false,
      error:
        error?.message ||
        "GMGN request failed"
    });
  }
}
