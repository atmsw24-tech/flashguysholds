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

function normalizeSolanaToken(data) {
  return {
    id: `solana-${data.mint || data.address || Date.now()}`,
    chain: "Solana",
    network: "solana",

    name: data.name || "Unknown Token",
    symbol: data.symbol || "UNKNOWN",

    address: data.mint || data.address || "",
    mint: data.mint || data.address || "",

    protocol: data.protocol || "Solana",

    price: data.priceUSD ?? null,
    marketCap: data.mcapUSD ?? null,
    liquidity: data.liquidityUSD ?? null,
    volume24h: data.volumeUSD24h ?? data.volume24h ?? null,

    change24h: data.change24h ?? null,

    image:
      data.image ||
      data.logo ||
      data.imageURI ||
      null,

    creator: data.creator || null,

    uri: data.uri || null,

    createdAt:
      data.timestamp ||
      data.createdAt ||
      Date.now(),

    live: true,
    source: "Shrine Solana live feed"
  };
}

function normalizeRobinhoodToken(data) {
  const isLaunch = data.type === "new_launch";

  return {
    id: `robinhood-${data.token || data.poolId || Date.now()}`,

    chain: "Robinhood Chain",
    network: "robinhood",

    name: data.name || "Unknown Token",
    symbol: data.symbol || "UNKNOWN",

    address: data.token || "",

    protocol:
      data.protocol ||
      (isLaunch ? "PONS" : "UNISWAP_V4"),

    eventType: data.type,

    price: null,
    marketCap: null,
    liquidity: null,
    volume24h: null,
    change24h: null,

    image: data.image || data.logo || null,

    creator: data.deployer || null,

    description: data.description || "",

    uri: data.uri || null,

    poolId: data.poolId || null,
    curve: data.curve || null,

    txHash: data.txHash || null,
    blockNumber: data.blockNumber || null,

    createdAt:
      data.timestamp ||
      Date.now(),

    live: true,
    source: "Shrine Robinhood Chain live feed"
  };
}

/**
 * Start the live Solana feed.
 *
 * The feed is keyless and currently free.
 *
 * It reports newly created token/pool events across:
 * Pump.fun
 * PumpSwap
 * Meteora
 * Raydium
 * Orca
 * Bonk
 * StonkFun
 */
export function startSolanaLiveFeed({
  onToken,
  onStatus,
  onError
} = {}) {
  const socket = io(SOLANA_SOCKET_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  });

  socket.on("connect", () => {
    onStatus?.({
      chain: "Solana",
      connected: true,
      message: "Solana live feed connected"
    });

    socket.emit(
      "subscribe_new_tokens",
      {
        protocols: SOLANA_PROTOCOLS
      },
      (ack) => {
        if (ack?.error) {
          onError?.({
            chain: "Solana",
            error: ack.error,
            message: ack.message || "Subscription failed"
          });
        }
      }
    );
  });

  socket.on("new_token", (data) => {
    const token = normalizeSolanaToken(data);

    onToken?.(token);

    /*
     * Once a mint exists, subscribe to its live price updates.
     * This gives FLASHGUYS a path from:
     *
     * NEW TOKEN
     *      ↓
     * LIVE PRICE
     */
    if (token.mint) {
      socket.emit(
        "subscribe",
        {
          mint: token.mint
        },
        () => {}
      );
    }
  });

  socket.on("token_update", (data) => {
    if (!data) return;

    const update = normalizeSolanaToken(data);

    onToken?.({
      ...update,
      updateOnly: true
    });
  });

  socket.on("connect_error", (error) => {
    onError?.({
      chain: "Solana",
      error,
      message: "Unable to connect to Solana live feed"
    });
  });

  socket.on("disconnect", (reason) => {
    onStatus?.({
      chain: "Solana",
      connected: false,
      message: `Solana feed disconnected: ${reason}`
    });
  });

  return () => {
    socket.disconnect();
  };
}

/**
 * Start the Robinhood Chain live launch feed.
 *
 * This receives:
 *
 * new_launch
 * graduated
 * new_pool
 *
 * The feed is keyless and currently free.
 */
export function startRobinhoodLiveFeed({
  onToken,
  onStatus,
  onError
} = {}) {
  let websocket = null;
  let stopped = false;
  let reconnectTimer = null;

  function connect() {
    if (stopped) return;

    websocket = new WebSocket(ROBINHOOD_WS_URL);

    websocket.onopen = () => {
      onStatus?.({
        chain: "Robinhood Chain",
        connected: true,
        message: "Robinhood Chain live feed connected"
      });
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (
          data.type === "new_launch" ||
          data.type === "graduated" ||
          data.type === "new_pool"
        ) {
          const token = normalizeRobinhoodToken(data);

          onToken?.(token);
        }
      } catch (error) {
        onError?.({
          chain: "Robinhood Chain",
          error,
          message: "Invalid Robinhood Chain feed message"
        });
      }
    };

    websocket.onerror = (error) => {
      onError?.({
        chain: "Robinhood Chain",
        error,
        message: "Robinhood Chain feed error"
      });
    };

    websocket.onclose = () => {
      if (stopped) return;

      onStatus?.({
        chain: "Robinhood Chain",
        connected: false,
        message: "Robinhood Chain feed disconnected"
      });

      /*
       * Long-lived WebSockets can disconnect.
       * Reconnect automatically.
       */
      reconnectTimer = setTimeout(connect, 3000);
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

/**
 * Start BOTH live feeds.
 */
export function startLiveFeeds({
  onToken,
  onStatus,
  onError
} = {}) {
  const stopSolana = startSolanaLiveFeed({
    onToken,
    onStatus,
    onError
  });

  const stopRobinhood = startRobinhoodLiveFeed({
    onToken,
    onStatus,
    onError
  });

  return () => {
    stopSolana?.();
    stopRobinhood?.();
  };
}
