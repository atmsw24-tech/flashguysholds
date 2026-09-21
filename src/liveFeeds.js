import { io } from "socket.io-client";

const SOLANA_SOCKET_URL = "https://sol.shrine.trade";
const ROBINHOOD_WS_URL =
  "wss://api.shrine.trade/rh/api/launches/ws";

const SOLANA_PROTOCOLS = [
  "PUMPFUN",
  "PUMPSWAP",
  "METEORA",
  "RAYDIUM",
  "ORCA",
  "BONK",
  "STONKFUN"
];

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url, timeoutMs = 8000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn("FLASHGUYS fetch failed:", url, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/*
|--------------------------------------------------------------------------
| SOLANA METADATA
|--------------------------------------------------------------------------
|
| Shrine's current metadata endpoint:
|
| https://sol.shrine.trade/metadata?mint=...
|
| It returns name, symbol, uri, protocol, pool, price, etc.
|
*/

async function getSolanaMetadata(mint) {
  if (!mint) return null;

  const url =
    `https://sol.shrine.trade/metadata?mint=${encodeURIComponent(mint)}`;

  return await getJson(url);
}

/*
|--------------------------------------------------------------------------
| SOLANA TOKEN INFO FALLBACK
|--------------------------------------------------------------------------
|
| Keep the token-info endpoint as a second source.
|
*/

async function getSolanaTokenInfo(mint) {
  if (!mint) return null;

  const url =
    `https://sol.shrine.trade/api/token-info?mint=${encodeURIComponent(mint)}`;

  return await getJson(url);
}

/*
|--------------------------------------------------------------------------
| OFF-CHAIN METADATA
|--------------------------------------------------------------------------
*/

function normalizeUri(uri) {
  if (!uri) return "";

  const value = String(uri).trim();

  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.replace("ipfs://", "")}`;
  }

  return value;
}

async function getUriMetadata(uri) {
  const normalized = normalizeUri(uri);

  if (!normalized) {
    return null;
  }

  const data = await getJson(normalized);

  if (!data) {
    return null;
  }

  return {
    image:
      clean(data.image) ||
      clean(data.imageUrl) ||
      null,

    description:
      clean(data.description) ||
      "",

    website:
      clean(data.website) ||
      "",

    twitter:
      clean(data.twitter) ||
      "",

    telegram:
      clean(data.telegram) ||
      ""
  };
}

/*
|--------------------------------------------------------------------------
| SOLANA TOKEN NORMALIZATION
|--------------------------------------------------------------------------
*/

async function buildSolanaToken(event) {
  if (!event) return null;

  const mint = clean(
    event.mint ||
    event.address
  );

  if (!mint) {
    return null;
  }

  console.log(
    "FLASHGUYS Solana launch detected:",
    event.protocol,
    mint
  );

  /*
   * First use whatever was included directly in the event.
   */
  let name = clean(event.name);
  let symbol = clean(event.symbol);
  let uri = clean(event.uri);

  let metadata = null;

  /*
   * Try the documented metadata endpoint.
   */
  metadata = await getSolanaMetadata(mint);

  /*
   * If it is temporarily unavailable, try token-info.
   */
  if (!metadata) {
    metadata = await getSolanaTokenInfo(mint);
  }

  /*
   * Metadata can take a moment to appear in the registry.
   * Retry twice before giving up.
   */
  if (!metadata && (!name || !symbol)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(1000);

      metadata = await getSolanaMetadata(mint);

      if (metadata) {
        break;
      }
    }
  }

  /*
   * Merge event + metadata.
   */
  if (metadata) {
    name =
      name ||
      clean(metadata.name);

    symbol =
      symbol ||
      clean(metadata.symbol);

    uri =
      uri ||
      clean(metadata.uri);
  }

  /*
   * If the event itself has no name/symbol and metadata is
   * temporarily unavailable, we DO NOT create "Unknown Token".
   *
   * We simply skip that event rather than putting junk into
   * the dashboard.
   */
  if (!name || !symbol) {
    console.warn(
      "FLASHGUYS: Solana token metadata unavailable yet:",
      mint
    );

    return null;
  }

  /*
   * Get image/social metadata.
   */
  let uriData = null;

  if (uri) {
    uriData = await getUriMetadata(uri);
  }

  const timestamp =
    Number(
      event.timestamp ||
      metadata?.timestamp ||
      Math.floor(Date.now() / 1000)
    );

  const ageMinutes = Number.isFinite(timestamp)
    ? Math.max(
        0,
        (Date.now() - timestamp * 1000) / 60000
      )
    : 0;

  const price =
    Number(
      metadata?.priceUSD ??
      metadata?.price ??
      event.priceUSD ??
      event.price ??
      0
    );

  const marketCap =
    Number(
      metadata?.marketCapUSD ??
      metadata?.marketCap ??
      event.marketCap ??
      0
    );

  return {
    id: `solana-${mint}`,

    chain: "solana",

    name,

    symbol,

    address: mint,

    mint,

    price: Number.isFinite(price)
      ? price
      : 0,

    change24h:
      Number(
        event.change24h ??
        metadata?.change24h ??
        0
      ) || 0,

    volume24h:
      Number(
        event.volume24h ??
        metadata?.volume24h ??
        0
      ) || 0,

    liquidity:
      Number(
        event.liquidity ??
        metadata?.liquidityUSD ??
        metadata?.liquidity ??
        0
      ) || 0,

    marketCap:
      Number.isFinite(marketCap)
        ? marketCap
        : 0,

    ageMinutes,

    timestamp,

    image:
      uriData?.image ||
      null,

    description:
      uriData?.description ||
      "",

    website:
      uriData?.website ||
      "",

    twitter:
      uriData?.twitter ||
      "",

    telegram:
      uriData?.telegram ||
      "",

    uri,

    protocol:
      clean(
        event.protocol ||
        metadata?.protocol
      ),

    pool:
      clean(
        event.pool ||
        metadata?.pool
      ),

    creator:
      clean(
        event.creator ||
        ""
      ),

    quote:
      clean(
        event.quote ||
        metadata?.quote
      ),

    source: "Shrine",

    live: true
  };
}

/*
|--------------------------------------------------------------------------
| SOLANA LIVE FEED
|--------------------------------------------------------------------------
*/

function startSolanaFeed({
  onToken,
  onStatus,
  onError
}) {
  console.log(
    "FLASHGUYS: connecting to Solana live feed..."
  );

  const socket = io(
    SOLANA_SOCKET_URL,
    {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    }
  );

  socket.on("connect", () => {
    console.log(
      "FLASHGUYS: Solana Socket connected:",
      socket.id
    );

    onStatus?.({
      chain: "Solana",
      connected: true
    });

    /*
     * Subscribe to every supported Solana launch source.
     */
    socket.emit(
      "subscribe_new_tokens",
      {
        protocols: SOLANA_PROTOCOLS
      }
    );

    console.log(
      "FLASHGUYS: subscribed to Solana launches:",
      SOLANA_PROTOCOLS
    );
  });

  socket.on("new_token", async (event) => {
    console.log(
      "FLASHGUYS NEW SOLANA TOKEN:",
      event
    );

    try {
      const token =
        await buildSolanaToken(event);

      if (!token) {
        console.log(
          "FLASHGUYS: waiting for metadata:",
          event?.mint
        );

        return;
      }

      console.log(
        "FLASHGUYS: adding Solana token:",
        token.name,
        token.symbol,
        token.address
      );

      onToken?.(token);
    } catch (error) {
      console.error(
        "FLASHGUYS: Solana token processing error:",
        error
      );

      onError?.(error);
    }
  });

  socket.on("token_update", (update) => {
    /*
     * Token updates are handled separately.
     * The launch event is what creates the new-token row.
     */

    console.log(
      "FLASHGUYS Solana token update:",
      update
    );
  });

  socket.on("connect_error", (error) => {
    console.error(
      "FLASHGUYS Solana connection error:",
      error
    );

    onStatus?.({
      chain: "Solana",
      connected: false
    });

    onError?.(error);
  });

  socket.on("disconnect", (reason) => {
    console.warn(
      "FLASHGUYS Solana disconnected:",
      reason
    );

    onStatus?.({
      chain: "Solana",
      connected: false
    });
  });

  return () => {
    console.log(
      "FLASHGUYS: stopping Solana feed"
    );

    socket.disconnect();
  };
}

/*
|--------------------------------------------------------------------------
| ROBINHOOD CHAIN
|--------------------------------------------------------------------------
*/

function buildRobinhoodToken(event) {
  if (!event) {
    return null;
  }

  const address = clean(
    event.token ||
    event.address
  );

  const name = clean(event.name);
  const symbol = clean(event.symbol);

  /*
   * Pons new_launch events contain name/symbol directly.
   *
   * new_pool events may have different fields and are not
   * necessarily launches, so we only create a dashboard
   * token when enough information is available.
   */

  if (!address || !name || !symbol) {
    console.warn(
      "FLASHGUYS: incomplete Robinhood event:",
      event
    );

    return null;
  }

  const timestamp =
    Number(
      event.timestamp ||
      Math.floor(Date.now() / 1000)
    );

  const ageMinutes = Number.isFinite(timestamp)
    ? Math.max(
        0,
        (Date.now() - timestamp * 1000) / 60000
      )
    : 0;

  return {
    id: `robinhood-${address}`,

    chain: "robinhood",

    name,

    symbol,

    address,

    token: address,

    price:
      Number(event.price || 0),

    change24h:
      Number(event.change24h || 0),

    volume24h:
      Number(event.volume24h || 0),

    liquidity:
      Number(event.liquidity || 0),

    marketCap:
      Number(event.marketCap || 0),

    ageMinutes,

    timestamp,

    image:
      event.image ||
      null,

    description:
      clean(event.description),

    website:
      clean(event.socials?.website),

    twitter:
      clean(event.socials?.twitter),

    telegram:
      clean(event.socials?.telegram),

    uri:
      clean(event.uri),

    protocol:
      clean(event.protocol),

    pairToken:
      clean(event.pairToken),

    creator:
      clean(event.deployer),

    txHash:
      clean(event.txHash),

    source: "Shrine",

    live: true
  };
}

/*
|--------------------------------------------------------------------------
| ROBINHOOD LIVE WEBSOCKET
|--------------------------------------------------------------------------
*/

function startRobinhoodFeed({
  onToken,
  onStatus,
  onError
}) {
  let ws = null;
  let stopped = false;
  let reconnectTimer = null;

  function connect() {
    if (stopped) return;

    console.log(
      "FLASHGUYS: connecting to Robinhood Chain live feed..."
    );

    ws = new WebSocket(
      ROBINHOOD_WS_URL
    );

    ws.onopen = () => {
      console.log(
        "FLASHGUYS: Robinhood Chain connected"
      );

      onStatus?.({
        chain: "Robinhood",
        connected: true
      });
    };

    ws.onmessage = (message) => {
      try {
        const event =
          JSON.parse(message.data);

        console.log(
          "FLASHGUYS ROBINHOOD EVENT:",
          event
        );

        /*
         * We want actual new launches.
         */
        if (
          event.type !== "new_launch"
        ) {
          return;
        }

        const token =
          buildRobinhoodToken(event);

        if (!token) {
          return;
        }

        console.log(
          "FLASHGUYS: adding Robinhood token:",
          token.name,
          token.symbol,
          token.address
        );

        onToken?.(token);
      } catch (error) {
        console.error(
          "FLASHGUYS Robinhood message error:",
          error
        );

        onError?.(error);
      }
    };

    ws.onerror = (error) => {
      console.error(
        "FLASHGUYS Robinhood WebSocket error:",
        error
      );

      onStatus?.({
        chain: "Robinhood",
        connected: false
      });

      onError?.(error);
    };

    ws.onclose = () => {
      console.warn(
        "FLASHGUYS Robinhood WebSocket closed"
      );

      onStatus?.({
        chain: "Robinhood",
        connected: false
      });

      if (!stopped) {
        reconnectTimer =
          setTimeout(
            connect,
            3000
          );
      }
    };
  }

  connect();

  return () => {
    stopped = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (ws) {
      ws.close();
    }
  };
}

/*
|--------------------------------------------------------------------------
| PUBLIC START FUNCTION
|--------------------------------------------------------------------------
*/

export function startLiveFeeds({
  onToken,
  onStatus,
  onError
}) {
  console.log(
    "================================================"
  );

  console.log(
    "FLASHGUYS LIVE DISCOVERY STARTING"
  );

  console.log(
    "Solana:",
    SOLANA_SOCKET_URL
  );

  console.log(
    "Robinhood:",
    ROBINHOOD_WS_URL
  );

  console.log(
    "================================================"
  );

  const stopSolana =
    startSolanaFeed({
      onToken,
      onStatus,
      onError
    });

  const stopRobinhood =
    startRobinhoodFeed({
      onToken,
      onStatus,
      onError
    });

  return () => {
    console.log(
      "FLASHGUYS: stopping all live feeds"
    );

    stopSolana?.();
    stopRobinhood?.();
  };
}
