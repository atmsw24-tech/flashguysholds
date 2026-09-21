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

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(
        "FLASHGUYS HTTP error:",
        response.status,
        url
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(
      "FLASHGUYS fetch failed:",
      url,
      error
    );

    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   SOLANA METADATA
   ============================================================ */

async function getSolanaMetadata(mint) {
  if (!mint) return null;

  return await getJson(
    `https://sol.shrine.trade/metadata?mint=${encodeURIComponent(
      mint
    )}`
  );
}

/* ============================================================
   SOLANA TOKEN INFO
   ============================================================ */

async function getSolanaTokenInfo(mint) {
  if (!mint) return null;

  return await getJson(
    `https://sol.shrine.trade/api/token-info?mint=${encodeURIComponent(
      mint
    )}`
  );
}

/* ============================================================
   OFF-CHAIN METADATA
   ============================================================ */

function normalizeUri(uri) {
  if (!uri) return "";

  let value = String(uri).trim();

  if (value.startsWith("ipfs://")) {
    value = `https://ipfs.io/ipfs/${value.substring(7)}`;
  }

  return value;
}

async function getUriMetadata(uri) {
  const normalized = normalizeUri(uri);

  if (!normalized) return null;

  const data = await getJson(normalized, 6000);

  if (!data) return null;

  return {
    image:
      clean(data.image) ||
      clean(data.imageUrl) ||
      null,

    description:
      clean(data.description),

    website:
      clean(data.website),

    twitter:
      clean(data.twitter) ||
      clean(data.extensions?.twitter),

    telegram:
      clean(data.telegram) ||
      clean(data.extensions?.telegram)
  };
}

/* ============================================================
   SOLANA TOKEN BUILDER
   ============================================================ */

async function buildSolanaToken(event) {
  if (!event) return null;

  const mint = clean(
    event.mint ||
    event.address
  );

  if (!mint) {
    console.warn(
      "FLASHGUYS: Solana event has no mint:",
      event
    );

    return null;
  }

  console.log(
    "FLASHGUYS: Solana token detected:",
    mint,
    event.protocol
  );

  /*
   * New tokens can arrive before their metadata has
   * propagated to the Shrine metadata registry.
   *
   * Therefore we retry the registry a few times.
   */

  let metadata = null;
  let tokenInfo = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    metadata =
      await getSolanaMetadata(mint);

    tokenInfo =
      await getSolanaTokenInfo(mint);

    if (
      metadata ||
      tokenInfo ||
      event.name ||
      event.symbol
    ) {
      break;
    }

    await sleep(1000);
  }

  /*
   * Token information can come from several places.
   */

  const name = clean(
    event.name ||
    tokenInfo?.name ||
    metadata?.name
  );

  const symbol = clean(
    event.symbol ||
    tokenInfo?.symbol ||
    metadata?.symbol
  );

  const uri = clean(
    event.uri ||
    tokenInfo?.uri ||
    metadata?.uri
  );

  /*
   * Never create fake token names.
   */

  if (!name || !symbol) {
    console.warn(
      "FLASHGUYS: Solana metadata still unavailable:",
      mint
    );

    return null;
  }

  /*
   * Fetch image/social information from the token URI.
   */

  let uriData = null;

  if (uri) {
    uriData =
      await getUriMetadata(uri);
  }

  /*
   * Timestamp.
   *
   * Shrine timestamps are Unix seconds.
   */

  const timestamp = toNumber(
    event.timestamp ||
    tokenInfo?.timestamp ||
    metadata?.timestamp ||
    Math.floor(Date.now() / 1000)
  );

  const ageMinutes =
    timestamp > 0
      ? Math.max(
          0,
          (Date.now() -
            timestamp * 1000) /
            60000
        )
      : 0;

  /*
   * Price.
   *
   * Prefer token-info because that endpoint contains
   * live token information.
   */

  const price = toNumber(
    tokenInfo?.priceUSD ??
    tokenInfo?.priceUsd ??
    tokenInfo?.price ??
    metadata?.priceUSD ??
    metadata?.priceUsd ??
    metadata?.price ??
    event.priceUSD ??
    event.priceUsd ??
    event.price
  );

  /*
   * Market cap.
   */

  const marketCap = toNumber(
    tokenInfo?.marketCapUSD ??
    tokenInfo?.marketCapUsd ??
    tokenInfo?.marketCap ??
    metadata?.marketCapUSD ??
    metadata?.marketCapUsd ??
    metadata?.marketCap ??
    event.marketCapUSD ??
    event.marketCapUsd ??
    event.marketCap
  );

  /*
   * Liquidity.
   */

  const liquidity = toNumber(
    tokenInfo?.liquidityUSD ??
    tokenInfo?.liquidityUsd ??
    tokenInfo?.liquidity ??
    metadata?.liquidityUSD ??
    metadata?.liquidityUsd ??
    metadata?.liquidity ??
    event.liquidityUSD ??
    event.liquidityUsd ??
    event.liquidity
  );

  /*
   * Volume.
   */

  const volume24h = toNumber(
    tokenInfo?.volume24h ??
    tokenInfo?.volume24hUSD ??
    tokenInfo?.volumeUSD24h ??
    metadata?.volume24h ??
    metadata?.volume24hUSD ??
    event.volume24h ??
    event.volume24hUSD
  );

  /*
   * 24h change.
   */

  const change24h = toNumber(
    tokenInfo?.change24h ??
    tokenInfo?.priceChange24h ??
    metadata?.change24h ??
    metadata?.priceChange24h ??
    event.change24h ??
    event.priceChange24h
  );

  const protocol = clean(
    event.protocol ||
    tokenInfo?.protocol ||
    metadata?.protocol
  );

  const pool = clean(
    event.pool ||
    tokenInfo?.pool ||
    metadata?.pool
  );

  const quote = clean(
    event.quote ||
    tokenInfo?.quote ||
    metadata?.quote
  );

  const creator = clean(
    event.creator ||
    tokenInfo?.creator
  );

  const image =
    uriData?.image ||
    clean(tokenInfo?.image) ||
    clean(metadata?.image) ||
    null;

  const token = {
    id: `solana-${mint}`,

    chain: "solana",

    name,
    symbol,

    address: mint,
    mint,

    price,
    change24h,
    volume24h,
    liquidity,
    marketCap,

    ageMinutes,

    timestamp,

    image,

    description:
      uriData?.description || "",

    website:
      uriData?.website || "",

    twitter:
      uriData?.twitter || "",

    telegram:
      uriData?.telegram || "",

    uri,

    protocol,
    pool,
    creator,
    quote,

    source: "Shrine",

    live: true
  };

  console.log(
    "FLASHGUYS: Solana token ready:",
    {
      name: token.name,
      symbol: token.symbol,
      price: token.price,
      liquidity: token.liquidity,
      marketCap: token.marketCap,
      volume24h: token.volume24h,
      ageMinutes: token.ageMinutes,
      image: token.image,
      mint: token.mint
    }
  );

  return token;
}

/* ============================================================
   SOLANA LIVE FEED
   ============================================================ */

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

    socket.emit(
      "subscribe_new_tokens",
      {
        protocols: SOLANA_PROTOCOLS
      }
    );

    console.log(
      "FLASHGUYS: Solana subscription sent:",
      SOLANA_PROTOCOLS
    );
  });

  socket.on(
    "new_token",
    async (event) => {
      console.log(
        "FLASHGUYS NEW SOLANA TOKEN:",
        event
      );

      try {
        const token =
          await buildSolanaToken(event);

        if (!token) {
          return;
        }

        onToken?.(token);
      } catch (error) {
        console.error(
          "FLASHGUYS Solana processing error:",
          error
        );

        onError?.({
          chain: "Solana",
          error
        });
      }
    }
  );

  socket.on(
    "connect_error",
    (error) => {
      console.error(
        "FLASHGUYS Solana connection error:",
        error
      );

      onStatus?.({
        chain: "Solana",
        connected: false
      });

      onError?.({
        chain: "Solana",
        error
      });
    }
  );

  socket.on(
    "disconnect",
    (reason) => {
      console.warn(
        "FLASHGUYS Solana disconnected:",
        reason
      );

      onStatus?.({
        chain: "Solana",
        connected: false
      });
    }
  );

  return () => {
    console.log(
      "FLASHGUYS: stopping Solana feed"
    );

    socket.disconnect();
  };
}

/* ============================================================
   ROBINHOOD
   ============================================================ */

function buildRobinhoodToken(event) {
  if (!event) return null;

  const address = clean(
    event.token ||
    event.address
  );

  const name = clean(event.name);
  const symbol = clean(event.symbol);

  if (!address || !name || !symbol) {
    console.warn(
      "FLASHGUYS: incomplete Robinhood event:",
      event
    );

    return null;
  }

  const timestamp =
    toNumber(
      event.timestamp ||
      Math.floor(Date.now() / 1000)
    );

  const ageMinutes =
    timestamp > 0
      ? Math.max(
          0,
          (Date.now() -
            timestamp * 1000) /
            60000
        )
      : 0;

  return {
    id: `robinhood-${address}`,

    chain: "robinhood",

    name,
    symbol,

    address,
    token: address,

    price: toNumber(event.price),

    change24h:
      toNumber(event.change24h),

    volume24h:
      toNumber(event.volume24h),

    liquidity:
      toNumber(event.liquidity),

    marketCap:
      toNumber(event.marketCap),

    ageMinutes,

    timestamp,

    image:
      event.image || null,

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

/* ============================================================
   ROBINHOOD LIVE WEBSOCKET
   ============================================================ */

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

        if (
          event.type !== "new_launch"
        ) {
          return;
        }

        const token =
          buildRobinhoodToken(event);

        if (!token) return;

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

/* ============================================================
   PUBLIC API
   ============================================================ */

export function startLiveFeeds({
  onToken,
  onStatus,
  onError
}) {
  console.log(
    "=============================================="
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
    "=============================================="
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
