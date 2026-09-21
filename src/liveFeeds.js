// src/liveFeeds.js

import { io } from "socket.io-client";

/*
 * FLASHGUYS LIVE FEEDS
 *
 * Solana:
 *   Shrine real-time new-token feed
 *   + Shrine metadata lookup
 *   + token URI metadata for images/socials
 *
 * Robinhood Chain:
 *   Shrine Pons / Uniswap V4 launch feed
 *
 * IMPORTANT:
 *   Incomplete tokens are NEVER sent to App.jsx.
 */

const SOLANA_SOCKET_URL =
  "https://sol.shrine.trade";

const SOLANA_METADATA_URL =
  "https://sol.shrine.trade/metadata";

const SOLANA_TOKEN_INFO_URL =
  "https://sol.shrine.trade/api/token-info";

const ROBINHOOD_WS_URL =
  "wss://api.shrine.trade/rh/api/launches/ws";


/* =========================================================
   HELPERS
========================================================= */

function number(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}


function cleanString(value) {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value.trim();
}


function ipfsToHttp(uri) {
  if (!uri) {
    return "";
  }

  if (
    uri.startsWith("ipfs://")
  ) {
    return (
      "https://ipfs.io/ipfs/" +
      uri.replace("ipfs://", "")
    );
  }

  return uri;
}


/* =========================================================
   FETCH SOLANA METADATA
========================================================= */

async function getSolanaMetadata(
  mint
) {
  if (!mint) {
    return null;
  }

  try {
    const url =
      `${SOLANA_METADATA_URL}?mint=${encodeURIComponent(mint)}`;

    const response =
      await fetch(url, {
        headers: {
          accept: "application/json"
        },
        cache: "no-store"
      });

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    return data || null;

  } catch (error) {

    console.warn(
      "FLASHGUYS metadata lookup failed:",
      error
    );

    return null;
  }
}


/*
 * Backup token-info endpoint.
 */

async function getSolanaTokenInfo(
  mint
) {
  if (!mint) {
    return null;
  }

  try {

    const url =
      `${SOLANA_TOKEN_INFO_URL}?mint=${encodeURIComponent(mint)}`;

    const response =
      await fetch(url, {
        headers: {
          accept: "application/json"
        },
        cache: "no-store"
      });

    if (!response.ok) {
      return null;
    }

    return await response.json();

  } catch {

    return null;
  }
}


/* =========================================================
   FETCH OFF-CHAIN TOKEN URI
========================================================= */

async function getUriMetadata(
  uri
) {
  const url =
    ipfsToHttp(uri);

  if (!url) {
    return null;
  }

  try {

    const response =
      await fetch(url, {
        headers: {
          accept: "application/json"
        },
        cache: "no-store"
      });

    if (!response.ok) {
      return null;
    }

    const metadata =
      await response.json();

    if (!metadata) {
      return null;
    }

    return {
      image:
        metadata.image ||
        metadata.imageUrl ||
        metadata.logo ||
        "",

      description:
        metadata.description ||
        "",

      website:
        metadata.website ||
        "",

      twitter:
        metadata.twitter ||
        metadata.x ||
        "",

      telegram:
        metadata.telegram ||
        ""
    };

  } catch {

    return null;
  }
}


/* =========================================================
   PROCESS SOLANA TOKEN
========================================================= */

async function processSolanaToken(
  data,
  onToken
) {
  if (!data) {
    return;
  }

  const mint =
    cleanString(
      data.mint ||
      data.address ||
      data.token
    );

  if (!mint) {
    return;
  }


  console.log(
    "FLASHGUYS: Solana token detected:",
    mint
  );


  /*
   * First use metadata endpoint.
   */

  let metadata =
    await getSolanaMetadata(mint);


  /*
   * If metadata endpoint doesn't have it yet,
   * try token-info as backup.
   */

  if (!metadata) {
    metadata =
      await getSolanaTokenInfo(mint);
  }


  /*
   * Extract name and symbol.
   */

  const name =
    cleanString(
      metadata?.name ||
      data.name
    );

  const symbol =
    cleanString(
      metadata?.symbol ||
      data.symbol
    );


  /*
   * IMPORTANT:
   *
   * Never create:
   *
   * Unknown Token
   * UNKNOWN
   *
   * If metadata isn't ready yet, simply wait.
   */

  if (!name || !symbol) {

    console.log(
      "FLASHGUYS: Solana token waiting for metadata:",
      mint
    );

    return;
  }


  /*
   * URI can come from:
   *
   * 1. metadata endpoint
   * 2. original event
   */

  const uri =
    metadata?.uri ||
    data.uri ||
    "";


  /*
   * Get image/social metadata.
   */

  const uriData =
    await getUriMetadata(uri);


  /*
   * Build final token.
   */

  const timestamp =
    number(
      data.timestamp
    );

  const ageMinutes =
    timestamp > 0
      ? Math.max(
          0,
          Math.floor(
            (Date.now() / 1000 -
              timestamp) /
              60
          )
        )
      : 0;


  const token = {

    id:
      `solana-${mint}`,

    chain:
      "solana",

    name,

    symbol,

    address:
      mint,

    mint,

    price:
      number(
        data.priceUSD ??
        data.priceUsd ??
        metadata?.priceUSD ??
        metadata?.price
      ),

    change24h:
      number(
        data.change24h
      ),

    volume24h:
      number(
        data.volume24h
      ),

    liquidity:
      number(
        data.liquidity
      ),

    marketCap:
      number(
        data.marketCapUSD ??
        data.marketCap ??
        metadata?.marketCapUSD
      ),

    ageMinutes,

    image:
      uriData?.image ||
      data.image ||
      data.imageUrl ||
      "",

    description:
      uriData?.description ||
      data.description ||
      "",

    website:
      uriData?.website ||
      data.website ||
      "",

    twitter:
      uriData?.twitter ||
      data.twitter ||
      "",

    telegram:
      uriData?.telegram ||
      data.telegram ||
      "",

    pairAddress:
      metadata?.pool ||
      data.pool ||
      data.pairAddress ||
      "",

    protocol:
      data.protocol ||
      metadata?.program ||
      "",

    quote:
      data.quote ||
      metadata?.quote ||
      "",

    uri,

    source:
      "Shrine",

    live:
      true
  };


  /*
   * Final safety check.
   */

  if (
    !token.name ||
    !token.symbol ||
    !token.address
  ) {

    console.warn(
      "FLASHGUYS: rejected incomplete Solana token",
      token
    );

    return;
  }


  console.log(
    "FLASHGUYS: valid Solana token:",
    token.name,
    token.symbol
  );


  onToken(token);
}


/* =========================================================
   SOLANA LIVE FEED
========================================================= */

function startSolanaFeed(
  onStatus,
  onToken,
  onError
) {

  const socket =
    io(
      SOLANA_SOCKET_URL,
      {
        transports: [
          "websocket"
        ],

        reconnection:
          true,

        reconnectionAttempts:
          Infinity,

        reconnectionDelay:
          2000,

        reconnectionDelayMax:
          10000
      }
    );


  socket.on(
    "connect",
    () => {

      console.log(
        "FLASHGUYS: Solana live feed connected"
      );

      onStatus({
        chain:
          "Solana",

        connected:
          true
      });


      /*
       * Subscribe to real-time
       * token creations.
       */

      socket.emit(
        "subscribe_new_tokens",
        {
          protocols: [
            "PUMPFUN",
            "PUMPSWAP",
            "METEORA",
            "RAYDIUM",
            "ORCA",
            "BONK",
            "STONKFUN"
          ]
        }
      );
    }
  );


  socket.on(
    "new_token",
    (data) => {

      processSolanaToken(
        data,
        onToken
      ).catch(
        (error) => {
          console.warn(
            "FLASHGUYS Solana token processing error:",
            error
          );
        }
      );
    }
  );


  /*
   * Live price update.
   *
   * These updates may not contain
   * name/symbol, so we DO NOT create
   * a new token from them.
   */

  socket.on(
    "token_update",
    (data) => {

      if (!data) {
        return;
      }

      const mint =
        data.mint ||
        data.address;

      if (!mint) {
        return;
      }

      /*
       * Only send an update if it contains
       * enough identity information.
       *
       * App.jsx can merge this later.
       */

      onToken({

        id:
          `solana-${mint}`,

        chain:
          "solana",

        address:
          mint,

        mint,

        price:
          number(
            data.priceUSD ??
            data.priceUsd
          ),

        change24h:
          number(
            data.change24h
          ),

        volume24h:
          number(
            data.volume24h
          ),

        liquidity:
          number(
            data.liquidity
          ),

        marketCap:
          number(
            data.marketCapUSD ??
            data.marketCap
          ),

        live:
          true,

        partial:
          true
      });
    }
  );


  socket.on(
    "connect_error",
    (error) => {

      console.warn(
        "FLASHGUYS Solana connection error:",
        error?.message ||
        error
      );

      onStatus({
        chain:
          "Solana",

        connected:
          false
      });

      onError?.(
        error
      );
    }
  );


  socket.on(
    "disconnect",
    (reason) => {

      console.warn(
        "FLASHGUYS Solana disconnected:",
        reason
      );

      onStatus({
        chain:
          "Solana",

        connected:
          false
      });
    }
  );


  return () => {

    try {

      socket.emit(
        "unsubscribe_new_tokens",
        {
          protocols: [
            "PUMPFUN",
            "PUMPSWAP",
            "METEORA",
            "RAYDIUM",
            "ORCA",
            "BONK",
            "STONKFUN"
          ]
        }
      );

    } catch {
      // Ignore cleanup errors.
    }

    socket.disconnect();
  };
}


/* =========================================================
   ROBINHOOD CHAIN
========================================================= */

function startRobinhoodFeed(
  onStatus,
  onToken,
  onError
) {

  let socket;
  let reconnectTimer = null;
  let stopped = false;


  function connect() {

    if (stopped) {
      return;
    }


    console.log(
      "FLASHGUYS: connecting to Robinhood Chain live feed..."
    );


    socket =
      new WebSocket(
        ROBINHOOD_WS_URL
      );


    socket.onopen = () => {

      console.log(
        "FLASHGUYS: Robinhood Chain live feed connected"
      );

      onStatus({
        chain:
          "Robinhood",

        connected:
          true
      });
    };


    socket.onmessage =
      async (event) => {

        try {

          const data =
            JSON.parse(
              event.data
            );


          console.log(
            "FLASHGUYS Robinhood event:",
            data
          );


          const token =
            normalizeRobinhoodToken(
              data
            );


          if (!token) {
            return;
          }


          onToken(token);

        } catch (error) {

          console.warn(
            "FLASHGUYS Robinhood event error:",
            error
          );

          onError?.(
            error
          );
        }
      };


    socket.onerror =
      (error) => {

        console.warn(
          "FLASHGUYS Robinhood socket error:",
          error
        );

        onError?.(
          error
        );
      };


    socket.onclose =
      () => {

        console.warn(
          "FLASHGUYS Robinhood feed disconnected"
        );

        onStatus({
          chain:
            "Robinhood",

          connected:
            false
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
      clearTimeout(
        reconnectTimer
      );
    }


    try {
      socket?.close();
    } catch {
      // Ignore cleanup errors.
    }
  };
}


/* =========================================================
   ROBINHOOD NORMALIZER
========================================================= */

function normalizeRobinhoodToken(
  data
) {

  if (!data) {
    return null;
  }


  /*
   * Only token lifecycle events.
   */

  const type =
    cleanString(
      data.type
    );


  if (
    type !== "new_launch" &&
    type !== "graduated" &&
    type !== "new_pool"
  ) {

    return null;
  }


  /*
   * Current Shrine Robinhood feed
   * uses "token".
   */

  const address =
    cleanString(
      data.token ||
      data.address ||
      data.tokenAddress
    );


  /*
   * new_pool events can be pool-only
   * and therefore may not contain a
   * token address.
   */

  if (!address) {

    console.log(
      "FLASHGUYS: Robinhood event has no token address:",
      data
    );

    return null;
  }


  const name =
    cleanString(
      data.name
    );

  const symbol =
    cleanString(
      data.symbol
    );


  /*
   * Never display placeholders.
   */

  if (!name || !symbol) {

    console.log(
      "FLASHGUYS: Robinhood token missing name/symbol:",
      data
    );

    return null;
  }


  const timestamp =
    number(
      data.timestamp
    );


  const ageMinutes =
    timestamp > 0
      ? Math.max(
          0,
          Math.floor(
            (Date.now() / 1000 -
              timestamp) /
              60
          )
        )
      : 0;


  const socials =
    data.socials ||
    {};


  return {

    id:
      `robinhood-${address.toLowerCase()}`,

    chain:
      "robinhood",

    name,

    symbol,

    address,

    token:
      address,

    price:
      number(
        data.priceUSD ??
        data.priceUsd ??
        data.price
      ),

    change24h:
      number(
        data.change24h
      ),

    volume24h:
      number(
        data.volume24h
      ),

    liquidity:
      number(
        data.liquidity
      ),

    marketCap:
      number(
        data.marketCapUSD ??
        data.marketCap
      ),

    ageMinutes,

    image:
      data.image ||
      data.imageUrl ||
      "",

    description:
      data.description ||
      "",

    website:
      socials.website ||
      data.website ||
      "",

    twitter:
      socials.twitter ||
      "",

    telegram:
      socials.telegram ||
      "",

    uri:
      data.uri ||
      "",

    curve:
      data.curve ||
      "",

    deployer:
      data.deployer ||
      "",

    txHash:
      data.txHash ||
      "",

    blockNumber:
      data.blockNumber ||
      null,

    protocol:
      data.protocol ||
      "",

    eventType:
      type,

    pairToken:
      data.pairToken ||
      "ETH",

    source:
      "Shrine",

    live:
      true
  };
}


/* =========================================================
   START BOTH
========================================================= */

export function startLiveFeeds({
  onStatus,
  onToken,
  onError
}) {

  const stopSolana =
    startSolanaFeed(
      onStatus,
      onToken,
      onError
    );


  const stopRobinhood =
    startRobinhoodFeed(
      onStatus,
      onToken,
      onError
    );


  return () => {

    stopSolana?.();

    stopRobinhood?.();

  };
}
