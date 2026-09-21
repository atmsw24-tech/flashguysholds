const DEXSCREENER = "https://api.dexscreener.com";

const CURATED_SOLANA_MINTS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ7i3XvW",
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
  "5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC"
];

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
      }
    });

    if (!response.ok) {
      console.warn(
        "FLASHGUYS API response:",
        response.status,
        url
      );

      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(
      "FLASHGUYS API request failed:",
      url,
      error
    );

    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getTrendingSolanaMints() {
  const latest = await safeJson(
    `${DEXSCREENER}/token-boosts/latest/v1`
  );

  const top = await safeJson(
    `${DEXSCREENER}/token-boosts/top/v1`
  );

  const all = [
    ...(Array.isArray(latest) ? latest : []),
    ...(Array.isArray(top) ? top : [])
  ];

  return all
    .filter(
      (item) =>
        item?.chainId === "solana" &&
        item?.tokenAddress
    )
    .map(
      (item) =>
        item.tokenAddress
    );
}

function pickBestPair(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return null;
  }

  return pairs.reduce(
    (best, pair) => {
      const liquidity =
        Number(pair?.liquidity?.usd) || 0;

      const bestLiquidity =
        Number(best?.liquidity?.usd) || 0;

      return liquidity > bestLiquidity
        ? pair
        : best;
    },
    pairs[0]
  );
}

function normalizeDexPair(pair) {
  if (!pair) {
    return null;
  }

  const address =
    String(
      pair?.baseToken?.address || ""
    ).trim();

  const name =
    String(
      pair?.baseToken?.name || ""
    ).trim();

  const symbol =
    String(
      pair?.baseToken?.symbol || ""
    ).trim();

  /*
   * NEVER create fake names.
   *
   * If DexScreener has no metadata, ignore
   * the pair instead of displaying:
   *
   * Unknown Token
   * UNKNOWN
   */

  if (!address || !name || !symbol) {
    console.warn(
      "FLASHGUYS: skipping incomplete Solana pair:",
      address
    );

    return null;
  }

  const createdAt =
    Number(pair.pairCreatedAt || 0);

  const ageMinutes =
    createdAt > 0
      ? Math.max(
          0,
          (Date.now() - createdAt) / 60000
        )
      : null;

  const price =
    Number(pair.priceUsd || 0);

  const liquidity =
    Number(pair.liquidity?.usd || 0);

  const volume24h =
    Number(pair.volume?.h24 || 0);

  const marketCap =
    Number(
      pair.marketCap ||
      pair.fdv ||
      0
    );

  return {
    id: `solana-${address}`,

    chain: "solana",

    name,

    symbol,

    address,

    mint: address,

    price:
      Number.isFinite(price)
        ? price
        : 0,

    change24h:
      Number(
        pair.priceChange?.h24 || 0
      ),

    volume24h,

    liquidity,

    marketCap,

    ageMinutes,

    image:
      pair.info?.imageUrl ||
      null,

    pairAddress:
      pair.pairAddress ||
      "",

    chainId:
      pair.chainId ||
      "solana",

    url:
      pair.url ||
      "",

    dexId:
      pair.dexId ||
      "",

    source: "DexScreener",

    live: true
  };
}

export async function fetchSolanaMemecoins() {
  try {
    const trending =
      await getTrendingSolanaMints();

    const mints = Array.from(
      new Set([
        ...CURATED_SOLANA_MINTS,
        ...trending
      ])
    ).slice(0, 50);

    if (mints.length === 0) {
      return [];
    }

    const pairs =
      await safeJson(
        `${DEXSCREENER}/tokens/v1/solana/${mints.join(",")}`
      );

    if (!Array.isArray(pairs)) {
      return [];
    }

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

    const tokens = [];

    for (const tokenPairs of byToken.values()) {
      const best =
        pickBestPair(tokenPairs);

      const token =
        normalizeDexPair(best);

      /*
       * Only add a properly identified token.
       */
      if (
        token &&
        token.name &&
        token.symbol &&
        token.address
      ) {
        tokens.push(token);
      }
    }

    tokens.sort(
      (a, b) =>
        (b.volume24h || 0) -
        (a.volume24h || 0)
    );

    return tokens;
  } catch (error) {
    console.error(
      "FLASHGUYS Solana market data error:",
      error
    );

    return [];
  }
}
