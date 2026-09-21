import { io } from "socket.io-client";

const SOLANA_SOCKET_URL = "https://sol.shrine.trade";

const ROBINHOOD_WS_URL =
  "wss://api.shrine.trade/rh/api/launches/ws";

const SOLANA_METADATA_URL =
  "https://sol.shrine.trade/metadata";

const SOLANA_PROTOCOLS = [
  "PUMPFUN",
  "PUMPSWAP",
  "METEORA",
  "RAYDIUM",
  "ORCA",
  "BONK",
  "STONKFUN"
];

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

function safeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeTimestamp(value) {
  if (!value) return Date.now();

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return Date.now();
  }

  // Shrine timestamps are normally Unix seconds.
  if (number < 100000000000) {
    return number * 1000;
  }

  return number;
}

/* -------------------------------------------------------
   Solana metadata
------------------------------------------------------- */

async function fetchSolanaMetadata(mint) {
  if (!mint) return null;

  try {
    const url =
      `${SOLANA_METADATA_URL}?mint=` +
      encodeURIComponent(mint);

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const metadata = await response.json();

    return metadata;
  } catch (error) {
    console.warn(
      "FLASHGUYS Solana metadata error:",
      error
    );

    return null;
  }
}

/* -------------------------------------------------------
   Token URI metadata
------------------------------------------------------- */

async function fetchTokenURI(uri) {
  if (!uri) return null;

  try {
    let url = uri;

    /*
     * Convert IPFS URIs into a public gateway.
     */
    if (url.startsWith("ipfs://")) {
      url =
        "https://ipfs.io/ipfs/" +
        url.replace("ipfs://", "");
    }

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(
      "FLASHGUYS token URI metadata error:",
      error
    );

    return null;
  }
}

/* -------------------------------------------------------
   Solana token normalization
------------------------------------------------------- */

function normalizeSolanaToken(
  data,
  metadata = null,
  uriMetadata = null
) {
  const mint =
    data.mint ||
    data.address ||
    metadata?.mint ||
    "";

  const name =
    data.name ||
    metadata?.name ||
    uriMetadata?.name ||
    "Unknown Token";

  const symbol =
    data.symbol ||
    metadata?.symbol ||
    uriMetadata?.symbol ||
    "UNKNOWN";

  const uri =
    data.uri ||
    metadata?.uri ||
    null;

  const image =
    data.image ||
    data.logo ||
    data.imageURI ||
    uriMetadata?.image ||
    uriMetadata?.image_url ||
    uriMetadata?.logoURI ||
    null;

  return {
    id: `solana-${mint || Date.now()}`,

    chain: "solana",
    network: "solana",

    name,
    symbol,

    address: mint,
    mint,

    pool:
      data.pool ||
      metadata?.pool ||
      null,

    protocol:
      data.protocol ||
      metadata?.program ||
      "Solana",

    price:
      safeNumber(data.priceUSD),

    marketCap:
      safeNumber(
        data.mcapUSD ??
        data.marketCapUSD
      ),

    liquidity:
      safeNumber(data.liquidityUSD),

    volume24h:
      safeNumber(
        data.volumeUSD24h ??
        data.volume24h
      ),

    change24h:
      safeNumber(data.change24h),

    image,

    creator:
      data.creator ||
      metadata?.creator ||
      null,

    uri,

    description:
      data.description ||
      uriMetadata?.description ||
      "",

    website:
      data.website ||
      uriMetadata?.website ||
      null,

    twitter:
      data.twitter ||
      uriMetadata?.twitter ||
      uriMetadata?.twitter_url ||
      null,

    telegram:
      data.telegram ||
      uriMetadata?.telegram ||
      null,

    discord:
      data.discord ||
      uriMetadata?.discord ||
      null,

    quote:
      data.quote ||
      metadata?.quote ||
      null,

    decimals:
      data.decimals ??
      metadata?.decimals ??
      null,

    supply:
      data.supply ??
      metadata?.total_supply ??
      null,

    active:
      metadata?.active ??
      true,

    createdAt: normalizeTimestamp(
      data.timestamp ||
      data.createdAt ||
      Date.now()
    ),

    live: true,

    source: "Shrine Solana live feed"
  };
}

/* -------------------------------------------------------
   Robinhood Chain normalization
------------------------------------------------------- */

function normalizeRobinhoodToken(data) {
  const isLaunch =
    data.type === "new_launch";

  const socials =
    data.socials || {};

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
      "Unknown Token",

    symbol:
      data.symbol ||
      "UNKNOWN",

    address:
      data.token ||
      "",

    protocol:
      data.protocol ||
      (isLaunch
        ? "PONS"
        : "UNISWAP_V4"),

    eventType:
      data.type || null,

    price:
      safeNumber(data.priceUSD),

    marketCap:
      safeNumber(
        data.marketCapUSD ??
        data.mcapUSD
      ),

    liquidity:
      safeNumber(data.liquidityUSD),

    volume24h:
      safeNumber(
        data.volume24h ??
        data.volumeUSD24h
      ),

    change24h:
      safeNumber(data.change24h),

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

    twitter:
      socials.twitter ||
      null,

    telegram:
      socials.telegram ||
      null,

    discord:
      socials.discord ||
      null,

    website:
      socials.website ||
      null,

    farcaster:
      socials.farcaster ||
      null,

    poolId:
      data.poolId ||
      null,

    curve:
      data.curve ||
      null,

    pairToken:
      data.pairToken ||
      null,

    launchConfigId:
      data.launchConfigId ??
      null,

    graduationThreshold:
      data.graduationThreshold ||
      null,

    txHash:
      data.txHash ||
      null,

    blockNumber:
      data.blockNumber ||
      null,

    createdAt:
      normalizeTimestamp(
        data.timestamp ||
        Date.now()
      ),

    live: true,

    source:
      "Shrine Robinhood Chain live feed"
  };
}

/* -------------------------------------------------------
   SOLANA LIVE FEED
------------------------------------------------------- */

export function startSolanaLiveFeed({
  onToken,
  onStatus,
  onError
} = {}) {
  const socket = io(
    SOLANA_SOCKET_URL,
    {
      transports: ["websocket"],

      reconnection: true,

      reconnectionAttempts:
        Infinity,

      reconnectionDelay: 1000,

      reconnectionDelayMax:
        10000
    }
  );

  /*
   * Connection
   */

  socket.on("connect", () => {
    onStatus?.({
      chain: "Solana",

      connected: true,

      message:
        "Solana live feed connected"
    });

    socket.emit(
      "subscribe_new_tokens",

      {
        protocols:
          SOLANA_PROTOCOLS
      },

      (ack) => {
        if (ack?.error) {
          onError?.({
            chain: "Solana",

            error: ack.error,

            message:
              ack.message ||
              "Subscription failed"
          });
        }
      }
    );
  });

  /*
   * New token
   */

  socket.on(
    "new_token",
    async (data) => {
      if (!data) return;

      const mint =
        data.mint ||
        data.address ||
        "";

      /*
       * Immediately show the token.
       * This prevents waiting for metadata
       * before displaying it.
       */

      let token =
        normalizeSolanaToken(data);

      onToken?.(token);

      /*
       * Get additional token metadata.
       */

      const metadata =
        await fetchSolanaMetadata(
          mint
        );

      /*
       * Fetch off-chain metadata
       * containing image/socials.
       */

      let uriMetadata = null;

      const uri =
        data.uri ||
        metadata?.uri ||
        null;

      if (uri) {
        uriMetadata =
          await fetchTokenURI(uri);
      }

      /*
       * Rebuild the token with
       * enriched information.
       */

      token =
        normalizeSolanaToken(
          data,
          metadata,
          uriMetadata
        );

      onToken?.(token);

      /*
       * Subscribe to live market
       * updates for this token.
       */

      if (mint) {
        socket.emit(
          "subscribe",
          {
            mint
          },
          () => {}
        );
      }
    }
  );

  /*
   * LIVE PRICE / MARKET DATA
   */

  socket.on(
    "token_update",
    (data) => {
      if (!data) return;

      const update =
        normalizeSolanaToken(data);

      onToken?.({
        ...update,

        updateOnly: true,

        live: true
      });
    }
  );

  /*
   * Connection errors
   */

  socket.on(
    "connect_error",
    (error) => {
      onError?.({
        chain: "Solana",

        error,

        message:
          "Unable to connect to Solana live feed"
      });
    }
  );

  /*
   * Disconnect
   */

  socket.on(
    "disconnect",
    (reason) => {
      onStatus?.({
        chain: "Solana",

        connected: false,

        message:
          `Solana feed disconnected: ${reason}`
      });
    }
  );

  /*
   * Cleanup
   */

  return () => {
    socket.disconnect();
  };
}

/* -------------------------------------------------------
   ROBINHOOD CHAIN LIVE FEED
------------------------------------------------------- */

export function startRobinhoodLiveFeed({
  onToken,
  onStatus,
  onError
} = {}) {
  let websocket = null;

  let stopped = false;

  let reconnectTimer =
    null;

  function connect() {
    if (stopped) return;

    websocket =
      new WebSocket(
        ROBINHOOD_WS_URL
      );

    websocket.onopen = () => {
      onStatus?.({
        chain:
          "Robinhood Chain",

        connected: true,

        message:
          "Robinhood Chain live feed connected"
      });
    };

    websocket.onmessage =
      (event) => {
        try {
          const data =
            JSON.parse(
              event.data
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
          onError?.({
            chain:
              "Robinhood Chain",

            error,

            message:
              "Invalid Robinhood Chain feed message"
          });
        }
      };

    websocket.onerror =
      (error) => {
        onError?.({
          chain:
            "Robinhood Chain",

          error,

          message:
            "Robinhood Chain feed error"
        });
      };

    websocket.onclose =
      () => {
        if (stopped) return;

        onStatus?.({
          chain:
            "Robinhood Chain",

          connected: false,

          message:
            "Robinhood Chain feed disconnected"
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

/* -------------------------------------------------------
   START BOTH
------------------------------------------------------- */

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
