export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const apiKey =
    process.env.GMGN_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "GMGN_API_KEY is missing"
    });
  }

  const requestedChain =
    String(
      req.query.chain || "sol"
    ).toLowerCase();

  const chains =
    requestedChain === "all"
      ? ["sol", "robinhood"]
      : [requestedChain];

  const validChains = [
    "sol",
    "robinhood"
  ];

  for (const chain of chains) {
    if (!validChains.includes(chain)) {
      return res.status(400).json({
        success: false,
        error:
          `Invalid chain: ${chain}`
      });
    }
  }

  try {
    const allTokens = [];
    const errors = [];

    for (const chain of chains) {

      /*
       * GMGN Trenches
       *
       * new_creation =
       * newly created tokens
       *
       * Robinhood Chain is officially
       * supported by GMGN.
       */

      const url =
        `https://openapi.gmgn.ai/v1/trenches?chain=${encodeURIComponent(
          chain
        )}`;

      const response =
        await fetch(url, {
          method: "POST",

          headers: {
            "X-APIKEY": apiKey,
            "Content-Type":
              "application/json",
            "Accept":
              "application/json",
            "User-Agent":
              "FLASHGUYS/1.0"
          },

          body: JSON.stringify({
            type: [
              "new_creation"
            ],
            limit: 80
          })
        });

      const text =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(text);
      } catch {
        errors.push({
          chain,
          status:
            response.status,
          error:
            "GMGN returned non-JSON response",
          response:
            text.slice(0, 500)
        });

        continue;
      }

      if (!response.ok) {
        errors.push({
          chain,
          status:
            response.status,
          error:
            data?.message ||
            data?.error ||
            "GMGN request failed"
        });

        continue;
      }

      /*
       * GMGN returns:
       *
       * data.new_creation
       */

      const newTokens =
        data?.data?.new_creation;

      if (
        !Array.isArray(
          newTokens
        )
      ) {
        errors.push({
          chain,
          status:
            response.status,
          error:
            "GMGN did not return a new_creation array",
          responseKeys:
            data?.data
              ? Object.keys(
                  data.data
                )
              : []
        });

        continue;
      }

      for (
        const token
        of newTokens
      ) {

        const address =
          token.address ||
          "";

        if (!address) {
          continue;
        }

        const createdTimestamp =
          Number(
            token.created_timestamp ||
            0
          );

        let ageMinutes = null;

        if (
          createdTimestamp > 0
        ) {
          ageMinutes =
            Math.max(
              0,
              Math.floor(
                (
                  Date.now() / 1000 -
                  createdTimestamp
                ) / 60
              )
            );
        }

        const logo =
          token.logo ||
          token.logo_url ||
          token.image ||
          null;

        allTokens.push({

          id:
            `${chain}-${address}`,

          chain,

          address,

          name:
            token.name ||
            token.symbol ||
            "Unknown Token",

          symbol:
            token.symbol ||
            "UNKNOWN",

          logo,

          image:
            logo,

          price:
            Number(
              token.price || 0
            ),

          marketCap:
            Number(
              token.usd_market_cap ||
              token.market_cap ||
              0
            ),

          liquidity:
            Number(
              token.liquidity ||
              0
            ),

          volume1h:
            Number(
              token.volume_1h ||
              0
            ),

          volume24h:
            Number(
              token.volume_24h ||
              0
            ),

          swaps1m:
            Number(
              token.swaps_1m ||
              0
            ),

          swaps1h:
            Number(
              token.swaps_1h ||
              0
            ),

          swaps24h:
            Number(
              token.swaps_24h ||
              0
            ),

          buys24h:
            Number(
              token.buys_24h ||
              0
            ),

          sells24h:
            Number(
              token.sells_24h ||
              0
            ),

          holders:
            Number(
              token.holder_count ||
              0
            ),

          netBuy24h:
            Number(
              token.net_buy_24h ||
              0
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
     * Remove duplicate tokens.
     */

    const unique =
      new Map();

    for (
      const token
      of allTokens
    ) {

      const key =
        `${token.chain}:${token.address}`;

      if (
        !unique.has(key)
      ) {
        unique.set(
          key,
          token
        );
      }
    }

    const tokens =
      Array.from(
        unique.values()
      );

    /*
     * Newest first.
     */

    tokens.sort(
      (a, b) =>
        (
          b.createdAt || 0
        ) -
        (
          a.createdAt || 0
        )
    );

    return res.status(200).json({

      success: true,

      source: "GMGN",

      live: true,

      chain:
        requestedChain,

      count:
        tokens.length,

      errors,

      tokens

    });

  } catch (error) {

    console.error(
      "FLASHGUYS GMGN error:",
      error
    );

    return res.status(500).json({

      success: false,

      live: false,

      error:
        error?.message ||
        "GMGN request failed",

      cause:
        error?.cause
          ? String(
              error.cause
            )
          : null

    });
  }
}
