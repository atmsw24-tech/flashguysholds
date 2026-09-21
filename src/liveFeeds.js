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

/* -----------------------------
   SOLANA METADATA
----------------------------- */

async function getSolanaMetadata(mint) {
  try {
    const response = await fetch(
      `https://sol.shrine.trade/metadata?mint=${encodeURIComponent(mint)}`
    );

    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.warn("FLASHGUYS metadata error:", error);
    return null;
  }
}

/* -----------------------------
   SOLANA TOKEN
----------------------------- */

async function handleSolanaToken(data, onToken) {
  if (!data) return;

  const mint = data.mint || data.address;

  if (!mint) return;

  console.log("🔥 FLASHGUYS NEW SOLANA COIN:", data);

  // Send the coin to the website immediately
  const initialToken = {
    id: `solana-${mint}`,
    chain: "solana",
    network: "solana",

    name: data.name || "New Token",
    symbol: data.symbol || "UNKNOWN",

    address: mint,
    mint,

    protocol: data.protocol || "Solana",

    price: null,
    marketCap: null,
    liquidity: null,
    volume24h: null,
    change24h: null,

    image: null,

    creator: data.creator || null,
    uri: data.uri || null,

    decimals: data.decimals ?? null,
    supply: data.supply ?? null,
    pool: data.pool || null,
    quote: data.quote || null,

    createdAt: data.timestamp || Date.now(),

    live: true,
    source: "Shrine"
  };

  onToken?.(initialToken);

  // Get complete metadata
  const metadata = await getSolanaMetadata(mint);

  if (!metadata) return;

  console.log("📦 FLASHGUYS SOLANA METADATA:", metadata);

  const enrichedToken = {
    ...initialToken,

    name:
      metadata.name ||
      initialToken.name ||
      "New Token",

    symbol:
      metadata.symbol ||
      initialToken.symbol ||
      "UNKNOWN",

    uri:
      metadata.uri ||
      initialToken.uri ||
      null,

    pool:
      metadata.pool ||
      initialToken.pool ||
      null,

    decimals:
      metadata.decimals ??
      initialToken.decimals,

    supply:
      metadata.total_supply ??
      initialToken.supply,

    program:
      metadata.program ||
      null
  };

  onToken?.(enrichedToken);

  // Try to load image/social metadata from URI
  if (enrichedToken.uri) {
    loadTokenURI(enrichedToken, onToken);
  }
}

/* -----------------------------
   OFF-CHAIN TOKEN METADATA
----------------------------- */

async function loadTokenURI(token, onToken) {
  try {
    let uri = token.uri;

    if (!uri) return;

    if (uri.startsWith("ipfs://")) {
      uri =
        "https://ipfs.io/ipfs/" +
        uri.replace("ipfs://", "");
    }

    const response = await fetch(uri);

    if (!response.ok) return;

    const metadata = await response.json();

    let image = metadata.image || null;

    if (image?.startsWith("ipfs://")) {
      image =
        "https://ipfs.io/ipfs/" +
        image.replace("ipfs://", "");
    }

    onToken?.({
      ...token,

      image,

      description:
        metadata.description || "",

      website:
        metadata.website ||
        metadata.external_url ||
        null,

      twitter:
        metadata.twitter ||
        null,

      telegram:
        metadata.telegram ||
        null
    });

  } catch (error) {
    console.warn(
      "FLASHGUYS token URI error:",
      error
    );
  }
}

/* -----------------------------
   SOLANA LIVE FEED
----------------------------- */

export function startSolanaLiveFeed({
  onToken,
  onStatus,
  onError
} = {}) {

  console.log(
    "⚡ FLASHGUYS: Starting Solana live feed..."
  );

  const socket = io(SOLANA_SOCKET_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  });

  socket.on("connect", () => {

    console.log(
      "🟢 FLASHGUYS: Solana connected:",
      socket.id
    );

    onStatus?.({
      chain: "Solana",
      connected: true,
      message: "Solana live feed connected"
    });

    console.log(
      "📡 FLASHGUYS: Subscribing to new Solana tokens..."
    );

    socket.emit(
      "subscribe_new_tokens",
      {
        protocols: SOLANA_PROTOCOLS
      },
      (response) => {

        console.log(
          "📡 FLASHGUYS: Subscription response:",
          response
        );

      }
    );
  });

  /* NEW COIN */

  socket.on("new_token", (data) => {

    console.log(
      "🚨 FLASHGUYS NEW TOKEN EVENT:",
      data
    );

    handleSolanaToken(
      data,
      onToken
    );
  });

  /* TOKEN PRICE / MARKET UPDATE */

  socket.on("token_update", (data) => {

    if (!data) return;

    console.log(
      "📈 FLASHGUYS TOKEN UPDATE:",
      data
    );

    const mint =
      data.mint ||
      data.address;

    if (!mint) return;

    onToken?.({
      id: `solana-${mint}`,
      chain: "solana",
      network: "solana",

      address: mint,
      mint,

      price:
        data.priceUSD ??
        data.price ??
        null,

      marketCap:
        data.mcapUSD ??
        data.marketCap ??
        null,

      liquidity:
        data.liquidityUSD ??
        data.liquidity ??
        null,

      volume24h:
        data.volumeUSD24h ??
        data.volume24h ??
        null,

      change24h:
        data.change24h ??
        null,

      live: true,

      source: "Shrine"
    });
  });

  socket.on("connect_error", (error) => {

    console.error(
      "❌ FLASHGUYS Solana connection error:",
      error
    );

    onError?.({
      chain: "Solana",
      error,
      message:
        "Unable to connect to Solana live feed"
    });
  });

  socket.on("disconnect", (reason) => {

    console.warn(
      "🟡 FLASHGUYS Solana disconnected:",
      reason
    );

    onStatus?.({
      chain: "Solana",
      connected: false,
      message:
        `Solana disconnected: ${reason}`
    });
  });

  return () => {
    console.log(
      "🛑 FLASHGUYS: Stopping Solana feed"
    );

    socket.disconnect();
  };
}

/* -----------------------------
   ROBINHOOD CHAIN
----------------------------- */

function normalizeRobinhoodToken(data) {

  return {
    id:
      `robinhood-${
        data.token ||
        data.poolId ||
        Date.now()
      }`,

    chain: "robinhood",
    network: "robinhood",

    name:
      data.name ||
      "New Token",

    symbol:
      data.symbol ||
      "UNKNOWN",

    address:
      data.token ||
      "",

    protocol:
      data.protocol ||
      "Robinhood Chain",

    eventType:
      data.type ||
      null,

    price:
      data.price ??
      null,

    marketCap:
      data.marketCap ??
      null,

    liquidity:
      data.liquidity ??
      null,

    volume24h:
      data.volume24h ??
      null,

    change24h:
      data.change24h ??
      null,

    image:
      data.image ||
      data.logo ||
      null,

    creator:
      data.deployer ||
      data.creator ||
      null,

    description:
      data.description ||
      "",

    uri:
      data.uri ||
      null,

    poolId:
      data.poolId ||
      null,

    curve:
      data.curve ||
      null,

    txHash:
      data.txHash ||
      null,

    blockNumber:
      data.blockNumber ||
      null,

    createdAt:
      data.timestamp ||
      Date.now(),

    live: true,

    source:
      "Shrine Robinhood Chain"
  };
}

/* -----------------------------
   ROBINHOOD LIVE FEED
----------------------------- */

export function startRobinhoodLiveFeed({
  onToken,
  onStatus,
  onError
} = {}) {

  console.log(
    "⚡ FLASHGUYS: Starting Robinhood Chain feed..."
  );

  let websocket = null;
  let reconnectTimer = null;
  let stopped = false;

  function connect() {

    if (stopped) return;

    console.log(
      "🔌 FLASHGUYS: Connecting to Robinhood Chain..."
    );

    websocket =
      new WebSocket(ROBINHOOD_WS_URL);

    websocket.onopen = () => {

      console.log(
        "🟢 FLASHGUYS: Robinhood Chain connected"
      );

      onStatus?.({
        chain: "Robinhood Chain",
        connected: true,
        message:
          "Robinhood Chain live feed connected"
      });
    };

    websocket.onmessage = (event) => {

      try {

        const data =
          JSON.parse(event.data);

        console.log(
          "🚨 FLASHGUYS ROBINHOOD EVENT:",
          data
        );

        if (
          data.type === "new_launch" ||
          data.type === "graduated" ||
          data.type === "new_pool"
        ) {

          const token =
            normalizeRobinhoodToken(data);

          onToken?.(token);
        }

      } catch (error) {

        console.error(
          "❌ FLASHGUYS Robinhood message error:",
          error
        );

        onError?.({
          chain: "Robinhood Chain",
          error,
          message:
            "Invalid Robinhood Chain message"
        });
      }
    };

    websocket.onerror = (error) => {

      console.error(
        "❌ FLASHGUYS Robinhood WebSocket error:",
        error
      );

      onError?.({
        chain: "Robinhood Chain",
        error,
        message:
          "Robinhood Chain feed error"
      });
    };

    websocket.onclose = () => {

      if (stopped) return;

      onStatus?.({
        chain: "Robinhood Chain",
        connected: false,
        message:
          "Robinhood Chain disconnected"
      });

      console.log(
        "🔄 FLASHGUYS: Reconnecting to Robinhood Chain..."
      );

      reconnectTimer =
        setTimeout(connect, 3000);
    };
  }

  connect();

  return () => {

    stopped = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (websocket) {
      websocket.close();
    }
  };
}

/* -----------------------------
   START BOTH CHAINS
----------------------------- */

export function startLiveFeeds({
  onToken,
  onStatus,
  onError
} = {}) {

  const stopSolana =
    startSolanaLiveFeed({
      onToken,
      onStatus,
      onError
    });

  const stopRobinhood =
    startRobinhoodLiveFeed({
      onToken,
      onStatus,
      onError
    });

  return () => {

    stopSolana?.();
    stopRobinhood?.();

  };
}
