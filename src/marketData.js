const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "/api";

function normalizeToken(token) {
  const chain =
    token.chain === "robinhood" || token.network === "robinhood"
      ? "robinhood"
      : "sol";

  return {
    ...token,

    chain,

    logo:
      token.logo ||
      token.image ||
      token.logo_url ||
      null,

    image:
      token.image ||
      token.logo ||
      token.logo_url ||
      null,

    createdAt:
      token.createdAt ||
      token.timestamp ||
      Date.now(),

    price: Number(
      token.price ??
      token.priceUSD ??
      0
    ),

    marketCap: Number(
      token.marketCap ??
      token.mcapUSD ??
      0
    ),

    liquidity: Number(
      token.liquidity ??
      token.liquidityUSD ??
      0
    ),

    volume1h: Number(
      token.volume1h ??
      token.volume1hUSD ??
      0
    ),

    volume24h: Number(
      token.volume24h ??
      token.volumeUSD24h ??
      token.volume24h ??
      0
    ),

    change24h: Number(
      token.change24h ??
      0
    ),

    holders: Number(
      token.holders ??
      0
    ),
  };
}

export async function fetchGMGNTokens(chain = "all") {
  const response = await fetch(
    `${API_BASE}/tokens?chain=${encodeURIComponent(chain)}`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Token API returned ${response.status}`
    );
  }

  const data = await response.json();

  if (
    !data.success ||
    !Array.isArray(data.tokens)
  ) {
    throw new Error(
      data.error ||
      "Token API returned no token list"
    );
  }

  const normalized =
    data.tokens.map(normalizeToken);

  if (chain === "all") {
    return normalized;
  }

  return normalized.filter(
    (token) => token.chain === chain
  );
}

export const fetchSolanaMemecoins = () =>
  fetchGMGNTokens("sol");

export const fetchRobinhoodTokens = () =>
  fetchGMGNTokens("robinhood");

export const fetchAllGMGNTokens = () =>
  fetchGMGNTokens("all");
