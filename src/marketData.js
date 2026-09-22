const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "/api";

async function requestTokens(chain) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 15000);

  try {
    const response =
      await fetch(
        `${API_BASE}/tokens?chain=${encodeURIComponent(chain)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          signal: controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        `Token API returned ${response.status}`
      );
    }

    const data =
      await response.json();

    if (!data.success) {
      throw new Error(
        data.error ||
        "Token API failed"
      );
    }

    if (!Array.isArray(data.tokens)) {
      return [];
    }

    return data.tokens.map(
      (token) => ({
        ...token,

        /*
         * Normalize all possible image fields.
         */
        logo:
          token.logo ||
          token.image ||
          token.logo_url ||
          null,

        image:
          token.image ||
          token.logo ||
          token.logo_url ||
          null
      })
    );

  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGMGNTokens(
  chain = "sol"
) {
  try {
    return await requestTokens(chain);

  } catch (error) {
    console.error(
      "FLASHGUYS GMGN error:",
      error
    );

    return [];
  }
}

export async function fetchSolanaMemecoins() {
  return fetchGMGNTokens("sol");
}

export async function fetchRobinhoodTokens() {
  return fetchGMGNTokens("robinhood");
}

export async function fetchAllGMGNTokens() {
  return fetchGMGNTokens("all");
}
