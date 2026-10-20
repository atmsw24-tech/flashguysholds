import { io } from "socket.io-client";

const SOLANA_SOCKET_URL = "https://sol.shrine.trade";
const PUMPPORTAL_SOCKET_URL = "wss://pumpportal.fun/api/data";

// FLASHBOYS Pump.fun feed: new launches on Pump.fun and tokens that
// graduate/migrate into PumpSwap. Other launchpads/DEXes are intentionally excluded.
const SOLANA_PROTOCOLS = [
  "PUMPFUN",
  "PUMPFUN_MAYHEM",
  "PUMPSWAP"
];

// Buffer bursts of real launch events so enrichment delays do not drop the feed.
const MAX_QUEUE_SIZE = 5000;
const ENRICH_DELAY_MS = 350;

let stopped = false;
let socket = null;
let pumpPortalSocket = null;

const enrichmentQueue = [];
const queuedMints = new Set();
const activeMints = new Set();
const processedMints = new Set();
const subscribedMints = new Set();
const requestedMints = new Set();
const observedLaunchMints = new Set();

let activeEnrichmentWorkers = 0;
// Process multiple real launches in parallel; upstream provider limits still apply.
const MAX_ENRICHMENT_WORKERS = 20;

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

const IPFS_GATEWAYS = [
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/"
];

function ipfsPathFromUri(uri) {
  const value = clean(uri);
  if (value.startsWith("ipfs://ipfs/")) return value.slice("ipfs://ipfs/".length);
  if (value.startsWith("ipfs://")) return value.slice("ipfs://".length);
  const match = value.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/i);
  return match ? match[1] : "";
}

function normalizeIpfs(uri) {
  if (!uri) return "";
  const value = String(uri).trim();
  const path = ipfsPathFromUri(value);
  // Prefer a widely available public gateway; the UI will retry other gateways.
  if (path) return IPFS_GATEWAYS[0] + path;
  return value;
}

async function getJsonFromUri(uri, timeoutMs = 7000) {
  const value = clean(uri);
  const path = ipfsPathFromUri(value);
  const urls = path
    ? IPFS_GATEWAYS.map((gateway) => gateway + path)
    : (value ? [value] : []);
  for (const url of urls) {
    const data = await getJson(url, timeoutMs);
    if (data && typeof data === "object") return data;
  }
  return null;
}

async function getOffchainMetadata(uri) {
  const data = await getJsonFromUri(uri, 5000);
  if (!data) return null;

  const imageUri =
    clean(data.image) ||
    clean(data.image_url) ||
    clean(data.imageUrl) ||
    clean(data.imageURI) ||
    clean(data.image_uri) ||
    clean(data.logo) ||
    clean(data.properties?.image) ||
    clean(data.properties?.files?.find?.((file) => file?.type?.startsWith?.("image/"))?.uri) ||
    clean(data.properties?.files?.[0]?.uri) ||
    "";

  return {
    image: normalizeIpfs(imageUri) || null,
    description: clean(data.description),
    website: clean(data.website) || clean(data.external_url),
    twitter: clean(data.twitter) || clean(data.x),
    telegram: clean(data.telegram)
  };
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

    // Launch events and token metadata providers use several image field names.
    // Normalize IPFS URIs so browsers can render the image instead of showing a blank logo.
    image: normalizeIpfs(
      clean(offchain?.image) ||
      clean(event?.image) ||
      clean(event?.imageUrl) ||
      clean(event?.image_uri) ||
      clean(event?.logo) ||
      clean(tokenInfo?.image) ||
      clean(tokenInfo?.imageUrl) ||
      clean(tokenInfo?.image_uri) ||
      clean(metadata?.image) ||
      clean(metadata?.imageUrl) ||
      clean(metadata?.image_uri) ||
      ""
    ) || null,

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

  // Build the trading-data row before requesting optional off-chain
  // image/social metadata. A slow IPFS gateway must not delay live price data.
  let token = createToken({
    event,
    metadata: finalMetadata,
    tokenInfo: finalTokenInfo,
    offchain: null
  });

  /*
   * Sometimes metadata arrives shortly after the launch event. Give it another
   * chance, but do not block the first usable token on optional image metadata.
   */
  if (!token) {
    await sleep(1000);

    const [retryMetadata, retryTokenInfo] = await Promise.all([
      getMetadata(mint),
      getTokenInfo(mint)
    ]);

    token = createToken({
      event,
      metadata: retryMetadata,
      tokenInfo: retryTokenInfo,
      offchain: null
    });

    finalMetadata = retryMetadata || finalMetadata;
    finalTokenInfo = retryTokenInfo || finalTokenInfo;
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

  // Enrich optional presentation metadata in the background. The caller can
  // publish the real token and market fields without waiting for IPFS/HTTP.
  const uri = clean(event?.uri) || clean(finalTokenInfo?.uri) || clean(finalMetadata?.uri);
  if (uri) {
    getOffchainMetadata(uri).then((offchain) => {
      if (!offchain || typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent("flashguys:solana-token", {
        detail: {
          id: token.id,
          chain: token.chain,
          address: token.address,
          mint: token.mint,
          image: offchain.image || null,
          description: offchain.description || "",
          website: offchain.website || "",
          twitter: offchain.twitter || "",
          telegram: offchain.telegram || "",
          metadataPatch: true
        }
      }));
    }).catch(() => {});
  }

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

  // Count actual token launches, not ordinary AMM pools created for existing tokens.
  const protocol = clean(event?.protocol).toUpperCase();
  const hasLaunchMetadata = Boolean(clean(event?.name) && clean(event?.symbol));
  const isLaunchpadMint = ["PUMPFUN", "PUMPFUN_MAYHEM", "BONK", "STONKFUN"].includes(protocol)
    || (protocol === "METEORA" && hasLaunchMetadata);
  if (isLaunchpadMint && !observedLaunchMints.has(mint)) {
    observedLaunchMints.add(mint);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("flashguys:new-launch", {
        detail: { mint, timestamp: Number(event?.timestamp) || Math.floor(Date.now() / 1000), protocol }
      }));
    }
  }

  // Avoid duplicate queue entries while a mint is queued, enriching, or complete.
  if (queuedMints.has(mint) || activeMints.has(mint) || processedMints.has(mint)) {
    return;
  }

  // Put every genuine mint from the live launch stream on screen immediately.
  // If name/symbol are not available yet, label them as pending rather than
  // inventing token details. Enrichment replaces this provisional row later.
  const eventName = clean(event?.name);
  const eventSymbol = clean(event?.symbol);
  const timestamp = Number(event?.timestamp) || Math.floor(Date.now() / 1000);
  const price = toNumber(event?.priceUSD) || toNumber(event?.price);
  window.dispatchEvent(new CustomEvent("flashguys:solana-token", {
    detail: {
      id: `solana-${mint}`,
      chain: "solana",
      name: validNameAndSymbol(eventName, eventSymbol) ? eventName : "Fetching metadata…",
      symbol: validNameAndSymbol(eventName, eventSymbol) ? eventSymbol : "—",
      address: mint,
      mint,
      price,
      marketCap: toNumber(event?.marketCapUSD) || toNumber(event?.marketCap),
      liquidity: toNumber(event?.liquidityUSD) || toNumber(event?.liquidity),
      volume24h: toNumber(event?.volume24h),
      volume1h: toNumber(event?.volume1h),
      change24h: toNumber(event?.change24h),
      timestamp,
      createdAt: timestamp * 1000,
      image: clean(event?.image) || clean(event?.logo) || null,
      protocol: clean(event?.protocol),
      source: "Shrine",
      live: true,
      provisional: true,
      metadataPending: !validNameAndSymbol(eventName, eventSymbol)
    }
  }));

  if (enrichmentQueue.length >= MAX_QUEUE_SIZE) {
    // If a burst exceeds the buffer, release the dropped mint's dedupe lock
    // so a later live event can retry it instead of leaving it stuck forever.
    const dropped = enrichmentQueue.shift();
    if (dropped?.mint) queuedMints.delete(dropped.mint);
  }

  queuedMints.add(mint);

  enrichmentQueue.push({
    mint,
    event
  });

  processQueue();
}

function processQueue() {
  if (stopped) return;

  // Enrich several newly discovered coins concurrently instead of blocking
  // every later launch behind one slow metadata request.
  while (
    !stopped &&
    activeEnrichmentWorkers < MAX_ENRICHMENT_WORKERS &&
    enrichmentQueue.length > 0
  ) {
    const item = enrichmentQueue.shift();
    if (!item) continue;

    const { mint, event } = item;
    queuedMints.delete(mint);
    activeMints.add(mint);
    activeEnrichmentWorkers += 1;

    enrichToken(event)
      .then((token) => {
        if (!token) {
          console.warn("FLASHGUYS: launch detected but metadata unavailable; waiting for a later event to retry:", mint);
          return;
        }

        processedMints.add(mint);
        subscribeToToken(mint);
        window.dispatchEvent(new CustomEvent("flashguys:solana-token", { detail: token }));
      })
      .catch((error) => {
        console.error("FLASHGUYS token enrichment error:", error);
      })
      .finally(() => {
        activeMints.delete(mint);
        activeEnrichmentWorkers = Math.max(0, activeEnrichmentWorkers - 1);
        processQueue();
      });
  }
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

  // Subscribe directly to PumpPortal's Pump.fun new-token stream as a
  // second source. Mint-level deduplication merges duplicate events from Shrine.
  try {
    pumpPortalSocket = new WebSocket(PUMPPORTAL_SOCKET_URL);
    pumpPortalSocket.addEventListener("open", () => {
      console.log("FLASHGUYS: PumpPortal connected; subscribing to new Pump.fun tokens");
      pumpPortalSocket.send(JSON.stringify({ method: "subscribeNewToken" }));
      onStatus?.({ chain: "Pump.fun", connected: true });
    });
    pumpPortalSocket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(message.data);
        if (!event || event.txType && event.txType !== "create") return;
        const mint = clean(event.mint) || clean(event.tokenAddress) || clean(event.address);
        if (!mint) return;
        queueToken({
          ...event,
          mint,
          protocol: "PUMPFUN",
          timestamp: Number(event.timestamp) || Math.floor(Date.now() / 1000),
          price: event.priceUSD ?? event.price,
          marketCap: event.marketCapUSD ?? event.marketCap,
          creator: event.traderPublicKey || event.creator
        });
      } catch (error) {
        console.warn("FLASHGUYS: could not parse PumpPortal event", error);
      }
    });
    pumpPortalSocket.addEventListener("error", (error) => {
      console.warn("FLASHGUYS: PumpPortal websocket error", error);
      onStatus?.({ chain: "Pump.fun", connected: false });
    });
    pumpPortalSocket.addEventListener("close", () => {
      onStatus?.({ chain: "Pump.fun", connected: false });
    });
  } catch (error) {
    console.warn("FLASHGUYS: PumpPortal websocket unavailable", error);
  }

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
          protocols: SOLANA_PROTOCOLS
        }
      );

      // Re-subscribe chart tokens whenever the socket connects or reconnects.
      requestedMints.forEach((mint) => subscribeToToken(mint));

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
    activeMints.clear();

    if (socket) {
      socket.disconnect();
      socket = null;
    }
    if (pumpPortalSocket) {
      pumpPortalSocket.close();
      pumpPortalSocket = null;
    }

    subscribedMints.clear();
    requestedMints.clear();
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


// Subscribe the open token chart to the existing real-time Shrine socket.
export function subscribeLiveToken(mint) {
  const value = clean(mint);
  if (!value) return false;
  requestedMints.add(value);
  if (socket?.connected) subscribeToToken(value);
  return Boolean(socket?.connected);
}
