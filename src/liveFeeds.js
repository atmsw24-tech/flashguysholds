import { io } from "socket.io-client";

const SOLANA_SOCKET_URL = "https://sol.shrine.trade";

const SOLANA_PROTOCOLS = [
  "PUMPFUN",
  "PUMPSWAP",
  "METEORA",
  "RAYDIUM",
  "ORCA",
  "BONK",
  "STONKFUN"
];

const MAX_QUEUE_SIZE = 500;
const ENRICH_DELAY_MS = 350;

let stopped = false;
let socket = null;

const enrichmentQueue = [];
const queuedMints = new Set();
const processedMints = new Set();
const subscribedMints = new Set();

let processingQueue = false;

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getJson(url, timeoutMs = 10000) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

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
      "FLASHGUYS request failed:",
      url,
      error
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIpfs(uri) {
  if (!uri) {
    return "";
  }

  const value = String(uri).trim();

  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.slice(7)}`;
  }

  return value;
}

async function getOffchainMetadata(uri) {
  const normalized = normalizeIpfs(uri);

  if (!normalized) {
    return null;
  }

  try {
    const data = await getJson(normalized, 7000);

    if (!data) {
      return null;
    }

    return {
      image:
        clean(data.image) ||
        clean(data.imageUrl) ||
        clean(data.logo) ||
        null,

      description:
        clean(data.description),

      website:
        clean(data.website) ||
        clean(data.external_url),

      twitter:
        clean(data.twitter) ||
        clean(data.x),

      telegram:
        clean(data.telegram)
    };
  } catch {
    return null;
  }
}

async function getMetadata(mint) {
  const url =
    `https://sol.shrine.trade/metadata?mint=${encodeURIComponent(mint)}`;

  return await getJson(url);
}

async function getTokenInfo(mint) {
  const url =
    `https://sol.shrine.trade/api/token-info?mint=${encodeURIComponent(mint)}`;

  return await getJson(url);
}

function isPlaceholder(value) {
  const normalized = clean(value).toLowerCase();

  return [
    "",
    "unknown",
    "unknown token",
    "new token",
    "n/a",
    "na",
    "undefined",
    "null"
  ].includes(normalized);
}

function validNameAndSymbol(name, symbol) {
  return (
    !isPlaceholder(name) &&
    !isPlaceholder(symbol)
  );
}

function calculateAgeMinutes(timestamp) {
  const unixTimestamp = Number(timestamp);

  if (!Number.isFinite(unixTimestamp) || unixTimestamp <= 0) {
    return 0;
  }

  return Math.max(
    0,
    (Date.now() - unixTimestamp * 1000) / 60000
  );
}

function createToken({
  event,
  metadata,
  tokenInfo,
  offchain
}) {
  const mint =
    clean(event?.mint) ||
    clean(event?.address) ||
    clean(metadata?.mint) ||
    clean(tokenInfo?.mint);

  if (!mint) {
    return null;
  }

  const name =
    clean(event?.name) ||
    clean(tokenInfo?.name) ||
    clean(metadata?.name);

  const symbol =
    clean(event?.symbol) ||
    clean(tokenInfo?.symbol) ||
    clean(metadata?.symbol);

  if (!validNameAndSymbol(name, symbol)) {
    return null;
  }

  const timestamp =
    Number(event?.timestamp) ||
    Number(metadata?.timestamp) ||
    Math.floor(Date.now() / 1000);

  const price =
    toNumber(tokenInfo?.priceUSD) ||
    toNumber(tokenInfo?.price) ||
    toNumber(event?.priceUSD) ||
    toNumber(event?.price);

  const marketCap =
    toNumber(tokenInfo?.marketCapUSD) ||
    toNumber(tokenInfo?.marketCap) ||
    toNumber(event?.marketCapUSD) ||
    toNumber(event?.marketCap);

  const volume =
    toNumber(event?.volume24h) ||
    toNumber(tokenInfo?.volume24h);

  const liquidity =
    toNumber(event?.liquidity) ||
    toNumber(tokenInfo?.liquidityUSD) ||
    toNumber(tokenInfo?.liquidity);

  const uri =
    clean(event?.uri) ||
    clean(tokenInfo?.uri) ||
    clean(metadata?.uri);

  return {
    id: `solana-${mint}`,

    chain: "solana",

    name,

    symbol,

    address: mint,

    mint,

    price,

    change24h:
      toNumber(event?.change24h) ||
      toNumber(tokenInfo?.change24h),

    volume24h: volume,

    liquidity,

    marketCap,

    ageMinutes:
      calculateAgeMinutes(timestamp),

    timestamp,

    image:
      offchain?.image ||
      null,

    description:
      offchain?.description ||
      "",

    website:
      offchain?.website ||
      "",

    twitter:
      offchain?.twitter ||
      "",

    telegram:
      offchain?.telegram ||
      "",

    uri,

    protocol:
      clean(event?.protocol) ||
      clean(tokenInfo?.protocol) ||
      clean(metadata?.protocol),

    pool:
      clean(event?.pool) ||
      clean(tokenInfo?.pool) ||
      clean(metadata?.pool),

    quote:
      clean(event?.quote) ||
      clean(tokenInfo?.quote) ||
      clean(metadata?.quote),

    creator:
      clean(event?.creator),

    decimals:
      Number(
        event?.decimals ??
        tokenInfo?.decimals ??
        metadata?.decimals ??
        0
      ),

    supply:
      toNumber(
        event?.supply ??
        tokenInfo?.supply ??
        metadata?.total_supply
      ),

    graduated:
      Boolean(
        tokenInfo?.graduated ??
        false
      ),

    source: "Shrine",

    live: true
  };
}

async function enrichToken(event) {
  const mint =
    clean(event?.mint) ||
    clean(event?.address);

  if (!mint) {
    return null;
  }

  console.log(
    "FLASHGUYS: enriching Solana token:",
    mint
  );

  /*
   * IMPORTANT:
   *
   * We request BOTH metadata and token-info.
   *
   * /metadata can return successfully while still
   * lacking price and market-cap information.
   *
   * /api/token-info contains the trading information.
   */

  const [metadata, tokenInfo] =
    await Promise.all([
      getMetadata(mint),
      getTokenInfo(mint)
    ]);

  let finalMetadata = metadata;
  let finalTokenInfo = tokenInfo;

  /*
   * New tokens can take a moment to become available
   * through the REST endpoints.
   */

  if (
    !finalMetadata ||
    !finalTokenInfo
  ) {
    await sleep(700);

    if (!finalMetadata) {
      finalMetadata =
        await getMetadata(mint);
    }

    if (!finalTokenInfo) {
      finalTokenInfo =
        await getTokenInfo(mint);
    }
  }

  const uri =
    clean(event?.uri) ||
    clean(finalTokenInfo?.uri) ||
    clean(finalMetadata?.uri);

  let offchain = null;

  if (uri) {
    offchain =
      await getOffchainMetadata(uri);
  }

  let token =
    createToken({
      event,
      metadata: finalMetadata,
      tokenInfo: finalTokenInfo,
      offchain
    });

  /*
   * Sometimes metadata arrives shortly after
   * the launch event. Give it another chance.
   */

  if (!token) {
    await sleep(1000);

    const retryMetadata =
      await getMetadata(mint);

    const retryTokenInfo =
      await getTokenInfo(mint);

    const retryUri =
      clean(event?.uri) ||
      clean(retryTokenInfo?.uri) ||
      clean(retryMetadata?.uri);

    let retryOffchain = null;

    if (retryUri) {
      retryOffchain =
        await getOffchainMetadata(retryUri);
    }

    token =
      createToken({
        event,
        metadata: retryMetadata,
        tokenInfo: retryTokenInfo,
        offchain: retryOffchain
      });
  }

  if (!token) {
    console.log(
      "FLASHGUYS: token metadata still unavailable:",
      mint
    );

    return null;
  }

  console.log(
    "FLASHGUYS: token ready:",
    token.name,
    `$${token.symbol}`,
    token.address
  );

  return token;
}

function subscribeToToken(mint) {
  if (!socket) {
    return;
  }

  if (!mint) {
    return;
  }

  if (subscribedMints.has(mint)) {
    return;
  }

  /*
   * Shrine supports token subscriptions.
   *
   * Keep the number of subscriptions controlled.
   */

  if (subscribedMints.size >= 50) {
    return;
  }

  subscribedMints.add(mint);

  socket.emit(
    "subscribe",
    {
      mint
    }
  );

  console.log(
    "FLASHGUYS: subscribed to live updates:",
    mint
  );
}

function queueToken(event) {
  const mint =
    clean(event?.mint) ||
    clean(event?.address);

  if (!mint) {
    return;
  }

  if (queuedMints.has(mint)) {
    return;
  }

  if (processedMints.has(mint)) {
    return;
  }

  if (
    enrichmentQueue.length >=
    MAX_QUEUE_SIZE
  ) {
    enrichmentQueue.shift();
  }

  queuedMints.add(mint);

  enrichmentQueue.push({
    mint,
    event
  });

  processQueue();
}

async function processQueue() {
  if (processingQueue) {
    return;
  }

  processingQueue = true;

  while (
    !stopped &&
    enrichmentQueue.length > 0
  ) {
    const item =
      enrichmentQueue.shift();

    if (!item) {
      continue;
    }

    const {
      mint,
      event
    } = item;

    queuedMints.delete(mint);

    try {
      const token =
        await enrichToken(event);

      processedMints.add(mint);

      if (token) {
        subscribeToToken(mint);

        window.dispatchEvent(
          new CustomEvent(
            "flashguys:solana-token",
            {
              detail: token
            }
          )
        );
      }
    } catch (error) {
      console.error(
        "FLASHGUYS token enrichment error:",
        error
      );
    }

    /*
     * Shrine REST endpoints have rate limits.
     * Slow the queue down so a busy launch period
     * does not hammer the API.
     */

    await sleep(
      ENRICH_DELAY_MS
    );
  }

  processingQueue = false;
}

function updateTokenFromLiveEvent(update) {
  if (!update) {
    return;
  }

  const mint =
    clean(update.mint) ||
    clean(update.address) ||
    clean(update.token);

  if (!mint) {
    return;
  }

  const price =
    toNumber(
      update.priceUSD
    ) ||
    toNumber(
      update.price
    );

  const marketCap =
    toNumber(
      update.marketCapUSD
    ) ||
    toNumber(
      update.marketCap
    );

  const volume =
    toNumber(
      update.volume24h
    );

  const liquidity =
    toNumber(
      update.liquidityUSD
    ) ||
    toNumber(
      update.liquidity
    );

  window.dispatchEvent(
    new CustomEvent(
      "flashguys:solana-update",
      {
        detail: {
          mint,

          price,

          marketCap,

          volume24h:
            volume,

          liquidity,

          change24h:
            toNumber(
              update.change24h
            ),

          timestamp:
            Number(
              update.timestamp
            ) ||
            Math.floor(
              Date.now() / 1000
            )
        }
      }
    )
  );
}

function startSolanaSocket({
  onStatus,
  onError
}) {
  stopped = false;

  console.log(
    "FLASHGUYS: connecting to Shrine Solana..."
  );

  socket = io(
    SOLANA_SOCKET_URL,
    {
      transports: [
        "websocket"
      ],

      reconnection: true,

      reconnectionAttempts:
        Infinity,

      reconnectionDelay:
        1000,

      reconnectionDelayMax:
        5000,

      timeout: 10000
    }
  );

  socket.on(
    "connect",
    () => {
      console.log(
        "FLASHGUYS: SOLANA CONNECTED",
        socket.id
      );

      onStatus?.({
        chain: "Solana",
        connected: true
      });

      socket.emit(
        "subscribe_new_tokens",
        {
          protocols:
            SOLANA_PROTOCOLS
        }
      );

      console.log(
        "FLASHGUYS: subscribed to:",
        SOLANA_PROTOCOLS
      );
    }
  );

  socket.on(
    "new_token",
    (event) => {
      console.log(
        "FLASHGUYS NEW SOLANA TOKEN:",
        event
      );

      queueToken(event);
    }
  );

  socket.on(
    "token_update",
    (update) => {
      console.log(
        "FLASHGUYS SOLANA UPDATE:",
        update
      );

      updateTokenFromLiveEvent(
        update
      );
    }
  );

  socket.on(
    "disconnect",
    (reason) => {
      console.warn(
        "FLASHGUYS SOLANA DISCONNECTED:",
        reason
      );

      onStatus?.({
        chain: "Solana",
        connected: false
      });
    }
  );

  socket.on(
    "connect_error",
    (error) => {
      console.error(
        "FLASHGUYS SOLANA CONNECTION ERROR:",
        error
      );

      onStatus?.({
        chain: "Solana",
        connected: false
      });

      onError?.(error);
    }
  );

  return () => {
    stopped = true;

    enrichmentQueue.length = 0;
    queuedMints.clear();

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    subscribedMints.clear();
    processedMints.clear();
  };
}

export function startLiveFeeds({
  onToken,
  onUpdate,
  onStatus,
  onError
}) {
  console.log(
    "======================================"
  );

  console.log(
    "FLASHGUYS SOLANA LIVE DISCOVERY"
  );

  console.log(
    "======================================"
  );

  function handleToken(event) {
    onToken?.(event.detail);
  }

  function handleUpdate(event) {
    onUpdate?.(event.detail);
  }

  window.addEventListener(
    "flashguys:solana-token",
    handleToken
  );

  window.addEventListener(
    "flashguys:solana-update",
    handleUpdate
  );

  const stop =
    startSolanaSocket({
      onStatus,
      onError
    });

  return () => {
    window.removeEventListener(
      "flashguys:solana-token",
      handleToken
    );

    window.removeEventListener(
      "flashguys:solana-update",
      handleUpdate
    );

    stop?.();
  };
}
