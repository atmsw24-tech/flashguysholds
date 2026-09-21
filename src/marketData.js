/*
 * FLASHGUYS - Solana Market Data
 *
 * Gets live Solana token market data from DexScreener.
 *
 * IMPORTANT:
 * - Never creates "Unknown Token"
 * - Never creates "UNKNOWN"
 * - Tokens without real metadata are ignored
 * - Uses real token name, symbol, address, price,
 *   volume, liquidity, market cap and image
 */

const DEXSCREENER = "https://api.dexscreener.com";

// Known Solana tokens used as a stable fallback set.
const CURATED_SOLANA_MINTS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ7i3XvW", // BOME
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", // MEW
  "5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC"  // MOODENG
];


/*
 * Safe JSON request
 */

async function safeJson(url, timeoutMs = 8000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      console.warn(
        "FLASHGUYS DexScreener HTTP error:",
        response.status,
        url
      );

      return null;
    }

    return await response.json();

  } catch (error) {
    console.warn(
      "FLASHGUYS DexScreener request failed:",
      error
    );

    return null;

  } finally {
    clearTimeout(timer);
  }
}


/*
 * Get currently boosted/trending Solana tokens.
 */

async function getTrendingSolanaMints() {
  const boosts = await safeJson(
    `${DEXSCREENER}/token-boosts/top/v1`
  );

  if (!Array.isArray(boosts)) {
    return [];
  }

  return boosts
    .filter(
      (item) =>
        item &&
        item.chainId === "solana" &&
        item.tokenAddress
    )
    .map(
      (item) => item.tokenAddress
    )
    .filter(Boolean);
}


/*
 * Select the deepest liquidity pair.
 */

function pickBestPair(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return null;
  }

  return pairs.reduce((best, pair) => {
    const liquidity = Number(
      pair?.liquidity?.usd || 0
    );

    const bestLiquidity = Number(
      best?.liquidity?.usd || 0
    );

    return liquidity > bestLiquidity
      ? pair
      : best;
  }, pairs[0]);
}


/*
 * Convert a DexScreener pair into the
 * format used by FLASHGUYS.
 */

function normalizeDexPair(pair) {
  if (!pair || !pair.baseToken) {
    return null;
  }

  const baseToken = pair.baseToken;

  const name =
    typeof baseToken.name === "string"
      ? baseToken.name.trim()
      : "";

  const symbol =
    typeof baseToken.symbol === "string"
      ? baseToken.symbol.trim()
      : "";

  const address =
    typeof baseToken.address === "string"
      ? baseToken.address.trim()
      : "";

  /*
   * THIS IS THE IMPORTANT PART.
   *
   * If DexScreener does not give us a real
   * name or symbol, we completely ignore
   * the token instead of displaying:
   *
   * "Unknown Token"
   * "UNKNOWN"
   */

  if (!name || !symbol || !address) {
    console.log(
      "FLASHGUYS: skipping token with incomplete metadata",
      {
        name,
        symbol,
        address
      }
    );

    return null;
  }


  /*
   * Pair creation time
   */

  const createdAt =
    Number(pair.pairCreatedAt || 0);

  const ageMinutes = createdAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - createdAt) / 60000
        )
      )
    : 0;


  /*
   * Market values
   */

  const price = Number(
    pair.priceUsd || 0
  );

  const change24h = Number(
    pair.priceChange?.h24 || 0
  );

  const volume24h = Number(
    pair.volume?.h24 || 0
  );

  const liquidity = Number(
    pair.liquidity?.usd || 0
  );

  const marketCap = Number(
    pair.marketCap ||
    pair.fdv ||
    0
  );


  /*
   * Image
   */

  const image =
    pair.info?.imageUrl ||
    pair.info?.header ||
    null;


  /*
   * Return normalized token.
   */

  return {
    id:
      `solana-${address}`,

    chain:
      "solana",

    name,
    symbol,
    address,

    mint:
      address,

    price:
      Number.isFinite(price)
        ? price
        : 0,

    change24h:
      Number.isFinite(change24h)
        ? change24h
        : 0,

    volume24h:
      Number.isFinite(volume24h)
        ? volume24h
        : 0,

    liquidity:
      Number.isFinite(liquidity)
        ? liquidity
        : 0,

    marketCap:
      Number.isFinite(marketCap)
        ? marketCap
        : 0,

    ageMinutes,

    image,

    pairAddress:
      pair.pairAddress || "",

    chainId:
      pair.chainId || "solana",

    url:
      pair.url || "",

    dexId:
      pair.dexId || "",

    quoteToken:
      pair.quoteToken || null,

    labels:
      Array.isArray(pair.labels)
        ? pair.labels
        : [],

    source:
      "DexScreener",

    live:
      true
  };
}


/*
 * Fetch Solana tokens.
 */

export async function fetchSolanaMemecoins() {

  try {

    console.log(
      "FLASHGUYS: fetching Solana tokens..."
    );


    /*
     * Get trending addresses.
     */

    const trending =
      await getTrendingSolanaMints();


    /*
     * Combine curated + trending.
     */

    const mints = Array.from(
      new Set([
        ...CURATED_SOLANA_MINTS,
        ...trending
      ])
    )
      .filter(Boolean)
      .slice(0, 30);


    if (mints.length === 0) {

      console.warn(
        "FLASHGUYS: no Solana token addresses found"
      );

      return [];
    }


    /*
     * Ask DexScreener for the actual
     * market information.
     */

    const pairs = await safeJson(
      `${DEXSCREENER}/tokens/v1/solana/${mints.join(",")}`
    );


    if (!Array.isArray(pairs)) {

      console.warn(
        "FLASHGUYS: DexScreener returned no pairs"
      );

      return [];
    }


    /*
     * Group pairs by token address.
     */

    const byToken =
      new Map();

    for (const pair of pairs) {

      const address =
        pair?.baseToken?.address;

      if (!address) {
        continue;
      }

      if (!byToken.has(address)) {
        byToken.set(
          address,
          []
        );
      }

      byToken
        .get(address)
        .push(pair);
    }


    /*
     * Normalize tokens.
     */

    const tokens = [];

    for (const tokenPairs of byToken.values()) {

      const best =
        pickBestPair(tokenPairs);

      if (!best) {
        continue;
      }

      const token =
        normalizeDexPair(best);

      /*
       * Ignore incomplete tokens.
       */

      if (!token) {
        continue;
      }


      /*
       * Ignore tokens without an active
       * tradable market.
       */

      if (
        token.price <= 0 ||
        token.liquidity <= 0
      ) {
        continue;
      }


      tokens.push(token);
    }


    /*
     * Highest volume first.
     */

    tokens.sort(
      (a, b) =>
        b.volume24h -
        a.volume24h
    );


    console.log(
      `FLASHGUYS: ${tokens.length} valid Solana tokens loaded`
    );


    return tokens;

  } catch (error) {

    console.error(
      "FLASHGUYS Solana market data error:",
      error
    );

    /*
     * NEVER return fake tokens.
     */

    return [];
  }
}


/*
 * Price formatter.
 */

export function formatTokenPrice(value) {

  const price =
    Number(value);

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return "$0";
  }

  if (price >= 1) {

    return `$${price.toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 4
      }
    )}`;

  }

  if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  }

  if (price >= 0.000001) {
    return `$${price.toFixed(8)}`;
  }

  return `$${price.toExponential(2)}`;
}


/*
 * Number formatter.
 */

export function formatNumber(value) {

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  if (number >= 1_000_000_000) {
    return `${(
      number / 1_000_000_000
    ).toFixed(2)}B`;
  }

  if (number >= 1_000_000) {
    return `${(
      number / 1_000_000
    ).toFixed(2)}M`;
  }

  if (number >= 1_000) {
    return `${(
      number / 1_000
    ).toFixed(2)}K`;
  }

  return number.toFixed(0);
}
