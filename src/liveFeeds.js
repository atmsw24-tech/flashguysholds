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

/* =====================================================
   SOLANA TOKEN INFORMATION
===================================================== */

async function getSolanaTokenInfo(mint) {
  try {
    const url =
      `https://sol.shrine.trade/api/token-info?mint=${encodeURIComponent(mint)}`;

    console.log("🔎 FLASHGUYS: Getting token info:", mint);

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(
        "⚠️ FLASHGUYS: Token info HTTP error:",
        response.status
      );
      return null;
    }

    const data = await response.json();

    console.log(
      "✅ FLASHGUYS: Token info received:",
      data
    );

    return data;
  } catch (error) {
    console.error(
      "❌ FLASHGUYS: Token info error:",
      error
    );

    return null;
  }
}

/* =====================================================
   URI METADATA / IMAGE
===================================================== */

async function getUriMetadata(uri) {
  try {
    if (!uri) return null;

    let url = uri;

    if (url.startsWith("ipfs://")) {
      url =
        "https://ipfs.io/ipfs/" +
        url.substring(7);
    }

    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();

    let image = data.image || null;

    if (image?.startsWith("ipfs://")) {
      image =
        "https://ipfs.io/ipfs/" +
        image.substring(7);
    }

    return {
      image,
      description: data.description || "",
      website:
        data.website ||
        data.external_url ||
        null,
      twitter: data.twitter || null,
      telegram: data.telegram || null
    };
  } catch (error) {
    console.warn(
      "⚠️ FLASHGUYS: URI metadata error:",
      error
    );

    return null;
  }
}

/* =====================================================
   PROCESS SOLANA NEW TOKEN
===================================================== */

async function processSolanaToken(data, onToken) {
  if (!data) return;

  const mint =
    data.mint ||
    data.address;

  if (!mint) {
    console.warn(
      "⚠️ FLASHGUYS: Solana event has no mint:",
      data
    );
    return;
  }

  console.log(
    "🚨 FLASHGUYS: NEW SOLANA COIN DETECTED:",
    mint
  );

  /*
   * IMPORTANT:
   * We DO NOT send an Unknown Token to the UI here.
   *
   * First we get the real token information.
   */

  const info =
    await getSolanaTokenInfo(mint);

  if (!info) {
    console.warn(
      "⚠️ FLASHGUYS: Could not get information for:",
      mint
    );

    return;
  }

  const name =
    info.name ||
    data.name ||
    "Unnamed Token";

  const symbol =
    info.symbol ||
    data.symbol ||
    "UNKNOWN";

  const uri =
    info.uri ||
    data.uri ||
    null;

  let extra = null;

  if (uri) {
    extra =
      await getUriMetadata(uri);
  }

  const token = {
    id: `solana-${mint}`,

    chain: "solana",
    network: "solana",

    name,
    symbol,

    address: mint,
    mint,

    protocol:
      info.protocol ||
      data.protocol ||
      "Solana",

    pool:
      info.pool ||
      data.pool ||
      null,

    quote:
      info.quote ||
      data.quote ||
      null,

    decimals:
      info.decimals ??
      data.decimals ??
      null,

    supply:
      info.total_supply ??
      info.supply ??
      data.supply ??
      null,

    uri,

    image:
      extra?.image ||
      null,

    description:
      extra?.description ||
      "",

    website:
      extra?.website ||
      null,

    twitter:
      extra?.twitter ||
      null,

    telegram:
      extra?.telegram ||
      null,

    price:
      info.priceUSD ??
      info.price ??
      null,

    marketCap:
      info.marketCapUSD ??
      info.marketCap ??
      null,

    liquidity:
      info.liquidityUSD ??
      info.liquidity ??
      null,

    volume24h:
      info.volumeUSD24h ??
      info.volume24h ??
      null,

    change24h:
      info.change24h ??
      null,

    creator:
      info.creator ||
      data.creator ||
      null,

    createdAt:
      data.timestamp ||
      Date.now(),

    live: true,

    source: "Shrine Solana"
  };

  console.log(
    "🟢 FLASHGUYS: COMPLETE SOLANA TOKEN:",
    token
  );

  /*
   * ONLY NOW send it to the website.
   */
  onToken?.(token);
}

/* =====================================================
   SOLANA LIVE FEED
===================================================== */

export function startSolanaLiveFeed({
  onToken,
  onStatus,
  onError
} = {}) {

  console.log(
    "⚡ FLASHGUYS: Starting Solana live feed..."
  );

  const socket = io(
    SOLANA_SOCKET_URL,
    {
      transports: ["websocket"],

      reconnection: true,

      reconnectionAttempts: Infinity,

      reconnectionDelay: 1000,

      reconnectionDelayMax: 10000
    }
  );

  socket.on("connect", () => {

    console.log(
      "🟢 FLASHGUYS: SOLANA CONNECTED:",
      socket.id
    );

    onStatus?.({
      chain: "Solana",
      connected: true,
      message:
        "Solana live feed connected"
    });

    console.log(
      "📡 FLASHGUYS: Subscribing to new tokens..."
    );

    socket.emit(
      "subscribe_new_tokens",
      {
        protocols:
          SOLANA_PROTOCOLS
      },
      (response) => {

        console.log(
          "📡 FLASHGUYS: Subscription response:",
          response
        );

      }
    );
  });

  /* ---------------------------------------------
     NEW TOKEN EVENT
  --------------------------------------------- */

  socket.on(
    "new_token",
    (data) => {

      processSolanaToken(
        data,
        onToken
      );
    }
  );

  /* ---------------------------------------------
     TOKEN UPDATE
  --------------------------------------------- */

  socket.on(
    "token_update",
    (data) => {

      if (!data) return;

      const mint =
        data.mint ||
        data.address;

      if (!mint) return;

      console.log(
        "📈 FLASHGUYS: Token update:",
        mint
      );

      onToken?.({

        id:
          `solana-${mint}`,

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

        source: "Shrine Solana"
      });
    }
  );

  socket.on(
    "connect_error",
    (error) => {

      console.error(
        "❌ FLASHGUYS: Solana connection error:",
        error
      );

      onError?.({
        chain: "Solana",
        error,
        message:
          "Solana live connection error"
      });
    }
  );

  socket.on(
    "disconnect",
    (reason) => {

      console.warn(
        "🟡 FLASHGUYS: Solana disconnected:",
        reason
      );

      onStatus?.({
        chain: "Solana",
        connected: false,
        message:
          `Solana disconnected: ${reason}`
      });
    }
  );

  return () => {

    console.log(
      "🛑 FLASHGUYS: Stopping Solana feed"
    );

    socket.disconnect();
  };
}

/* =====================================================
   ROBINHOOD CHAIN TOKEN
===================================================== */

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

/* =====================================================
   ROBINHOOD CHAIN LIVE FEED
===================================================== */

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

    websocket =
      new WebSocket(
        ROBINHOOD_WS_URL
      );

    websocket.onopen = () => {

      console.log(
        "🟢 FLASHGUYS: Robinhood Chain connected"
      );

      onStatus?.({
        chain:
          "Robinhood Chain",

        connected: true,

        message:
          "Robinhood Chain connected"
      });
    };

    websocket.onmessage =
      (event) => {

        try {

          const data =
            JSON.parse(
              event.data
            );

          console.log(
            "🚨 FLASHGUYS: Robinhood event:",
            data
          );

          if (
            data.type ===
              "new_launch" ||
            data.type ===
              "graduated" ||
            data.type ===
              "new_pool"
          ) {

            const token =
              normalizeRobinhoodToken(
                data
              );

            onToken?.(token);
          }

        } catch (error) {

          console.error(
            "❌ FLASHGUYS: Robinhood message error:",
            error
          );

          onError?.({
            chain:
              "Robinhood Chain",

            error,

            message:
              "Invalid Robinhood message"
          });
        }
      };

    websocket.onerror =
      (error) => {

        console.error(
          "❌ FLASHGUYS: Robinhood WebSocket error:",
          error
        );

        onError?.({
          chain:
            "Robinhood Chain",

          error,

          message:
            "Robinhood Chain error"
        });
      };

    websocket.onclose = () => {

      if (stopped) return;

      onStatus?.({
        chain:
          "Robinhood Chain",

        connected: false,

        message:
          "Robinhood Chain disconnected"
      });

      reconnectTimer =
        setTimeout(
          connect,
          3000
        );
    };
  }

  connect();

  return () => {

    stopped = true;

    if (reconnectTimer) {
      clearTimeout(
        reconnectTimer
      );
    }

    if (websocket) {
      websocket.close();
    }
  };
}

/* =====================================================
   START BOTH CHAINS
===================================================== */

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
