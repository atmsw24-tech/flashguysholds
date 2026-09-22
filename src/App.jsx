import React, {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  fetchGMGNTokens
} from "./marketData";

import {
  ConnectionProvider,
  WalletProvider,
  useWallet
} from "@solana/wallet-adapter-react";

import {
  WalletModalProvider,
  WalletMultiButton
} from "@solana/wallet-adapter-react-ui";

import {
  PhantomWalletAdapter
} from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";


const SOLANA_RPC =
  import.meta.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";


function formatNumber(value) {
  const number =
    Number(value || 0);

  if (number >= 1000000000) {
    return (
      "$" +
      (number / 1000000000).toFixed(2) +
      "B"
    );
  }

  if (number >= 1000000) {
    return (
      "$" +
      (number / 1000000).toFixed(2) +
      "M"
    );
  }

  if (number >= 1000) {
    return (
      "$" +
      (number / 1000).toFixed(1) +
      "K"
    );
  }

  if (number > 0) {
    return (
      "$" +
      number.toFixed(2)
    );
  }

  return "$0";
}


function formatPrice(value) {
  const number =
    Number(value || 0);

  if (number === 0) {
    return "$0";
  }

  if (number < 0.000001) {
    return "$" + number.toExponential(2);
  }

  if (number < 0.01) {
    return "$" + number.toFixed(8);
  }

  if (number < 1) {
    return "$" + number.toFixed(5);
  }

  return "$" + number.toFixed(2);
}


function formatAge(minutes) {
  if (
    minutes === null ||
    minutes === undefined
  ) {
    return "—";
  }

  const value =
    Number(minutes);

  if (value < 1) {
    return "Just now";
  }

  if (value < 60) {
    return `${value}m`;
  }

  if (value < 1440) {
    return `${Math.floor(value / 60)}h`;
  }

  return `${Math.floor(value / 1440)}d`;
}


function TokenLogo({
  token,
  size = 44
}) {
  const [
    imageError,
    setImageError
  ] = useState(false);

  const image =
    token.logo ||
    token.image ||
    null;

  const letter =
    (
      token.symbol ||
      token.name ||
      "?"
    )
      .slice(0, 1)
      .toUpperCase();

  return (
    <div
      className="token-logo"
      style={{
        width: size,
        height: size
      }}
    >
      {image && !imageError ? (
        <img
          src={image}
          alt={
            token.name ||
            token.symbol ||
            "Token"
          }
          loading="lazy"
          onError={() =>
            setImageError(true)
          }
        />
      ) : (
        <div className="token-logo-fallback">
          {letter}
        </div>
      )}
    </div>
  );
}


function TokenRow({
  token,
  onClick
}) {
  return (
    <div
      className="token-row"
      onClick={onClick}
    >
      <div className="token-cell token-main">

        <TokenLogo token={token} />

        <div className="token-identity">

          <div className="token-title">
            {token.name ||
              "Unknown Token"}
          </div>

          <div className="token-subtitle">

            <span>
              {token.symbol ||
                "UNKNOWN"}
            </span>

            {token.launchpad && (
              <>
                <span className="dot">
                  •
                </span>

                <span>
                  {token.launchpad}
                </span>
              </>
            )}

          </div>

        </div>

      </div>


      <div className="token-cell">

        <span className="mobile-label">
          Price
        </span>

        <span>
          {formatPrice(
            token.price
          )}
        </span>

      </div>


      <div className="token-cell">

        <span className="mobile-label">
          Market Cap
        </span>

        <span>
          {formatNumber(
            token.marketCap
          )}
        </span>

      </div>


      <div className="token-cell">

        <span className="mobile-label">
          Liquidity
        </span>

        <span>
          {formatNumber(
            token.liquidity
          )}
        </span>

      </div>


      <div className="token-cell">

        <span className="mobile-label">
          Volume
        </span>

        <span>
          {formatNumber(
            token.volume1h
          )}
        </span>

      </div>


      <div className="token-cell">

        <span className="mobile-label">
          Holders
        </span>

        <span>
          {token.holders || 0}
        </span>

      </div>


      <div className="token-cell token-age">

        {formatAge(
          token.ageMinutes
        )}

      </div>

    </div>
  );
}


function TokenModal({
  token,
  onClose
}) {
  if (!token) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >

      <div
        className="token-modal"
        onClick={(event) =>
          event.stopPropagation()
        }
      >

        <button
          className="modal-close"
          onClick={onClose}
        >
          ×
        </button>


        <div className="modal-header">

          <TokenLogo
            token={token}
            size={72}
          />

          <div>

            <h2>
              {token.name ||
                "Unknown Token"}
            </h2>

            <p>
              {token.symbol ||
                "UNKNOWN"}
            </p>

          </div>

        </div>


        <div className="modal-grid">

          <div>
            <span>Chain</span>

            <strong>
              {token.chain ===
              "robinhood"
                ? "Robinhood Chain"
                : "Solana"}
            </strong>
          </div>


          <div>
            <span>Price</span>

            <strong>
              {formatPrice(
                token.price
              )}
            </strong>
          </div>


          <div>
            <span>Market Cap</span>

            <strong>
              {formatNumber(
                token.marketCap
              )}
            </strong>
          </div>


          <div>
            <span>Liquidity</span>

            <strong>
              {formatNumber(
                token.liquidity
              )}
            </strong>
          </div>


          <div>
            <span>1h Volume</span>

            <strong>
              {formatNumber(
                token.volume1h
              )}
            </strong>
          </div>


          <div>
            <span>24h Volume</span>

            <strong>
              {formatNumber(
                token.volume24h
              )}
            </strong>
          </div>


          <div>
            <span>Holders</span>

            <strong>
              {token.holders || 0}
            </strong>
          </div>


          <div>
            <span>Age</span>

            <strong>
              {formatAge(
                token.ageMinutes
              )}
            </strong>
          </div>

        </div>


        <div className="contract-section">

          <span>
            Contract
          </span>

          <code>
            {token.address}
          </code>

        </div>

      </div>

    </div>
  );
}


/* =========================================================
   LAUNCH PAGE
========================================================= */

function LaunchPage() {

  const [
    launchChain,
    setLaunchChain
  ] = useState("pumpfun");

  const [
    name,
    setName
  ] = useState("");

  const [
    symbol,
    setSymbol
  ] = useState("");

  const [
    description,
    setDescription
  ] = useState("");

  const [
    twitter,
    setTwitter
  ] = useState("");

  const [
    telegram,
    setTelegram
  ] = useState("");

  const [
    website,
    setWebsite
  ] = useState("");

  const [
    image,
    setImage
  ] = useState(null);

  const [
    imagePreview,
    setImagePreview
  ] = useState("");

  const [
    pair,
    setPair
  ] = useState("SOL");

  const [
    holderReward,
    setHolderReward
  ] = useState(false);


  function handleImageChange(
    event
  ) {

    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      file.size >
      15 * 1024 * 1024
    ) {

      alert(
        "Image must be 15 MB or smaller."
      );

      return;
    }

    setImage(file);

    const url =
      URL.createObjectURL(file);

    setImagePreview(url);
  }


  function handleCreate() {

    if (!name.trim()) {
      alert(
        "Enter a token name."
      );
      return;
    }

    if (!symbol.trim()) {
      alert(
        "Enter a token ticker."
      );
      return;
    }

    if (!image) {
      alert(
        "Upload a token image."
      );
      return;
    }

    alert(
      launchChain === "pumpfun"
        ? "Pump.fun creation is ready for wallet transaction integration."
        : "Robinhood Chain ERC-20 deployment is ready for wallet transaction integration."
    );
  }


  return (
    <section className="launch-page">

      <div className="launch-header">

        <div>

          <h1>
            Launch a Token
          </h1>

          <p>
            Create a token directly
            from FLASHGUYS.
          </p>

        </div>

      </div>


      <div className="launch-chain-selector">

        <button
          className={
            launchChain === "pumpfun"
              ? "active"
              : ""
          }
          onClick={() =>
            setLaunchChain(
              "pumpfun"
            )
          }
        >
          <strong>
            Pump.fun
          </strong>

          <span>
            Solana
          </span>
        </button>


        <button
          className={
            launchChain ===
            "robinhood"
              ? "active"
              : ""
          }
          onClick={() =>
            setLaunchChain(
              "robinhood"
            )
          }
        >
          <strong>
            Robinhood Chain
          </strong>

          <span>
            EVM
          </span>
        </button>

      </div>


      <div className="launch-card">

        <div className="launch-form">

          <div className="form-group">

            <label>
              Token Name
            </label>

            <input
              type="text"
              placeholder="Example: FlashGuy"
              value={name}
              maxLength={32}
              onChange={(event) =>
                setName(
                  event.target.value
                )
              }
            />

          </div>


          <div className="form-group">

            <label>
              Ticker
            </label>

            <input
              type="text"
              placeholder="FLASH"
              value={symbol}
              maxLength={13}
              onChange={(event) =>
                setSymbol(
                  event.target.value
                    .toUpperCase()
                )
              }
            />

          </div>


          <div className="form-group">

            <label>
              Description
            </label>

            <textarea
              placeholder="Describe your token..."
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value
                )
              }
              rows={5}
            />

          </div>


          <div className="form-group">

            <label>
              Token Image
            </label>

            <input
              type="file"
              accept="image/png,image/jpeg,image/gif"
              onChange={
                handleImageChange
              }
            />

            <small>
              JPG, PNG or GIF. Maximum
              15 MB.
            </small>

          </div>


          <div className="form-row">

            <div className="form-group">

              <label>
                X / Twitter
              </label>

              <input
                type="url"
                placeholder="https://x.com/..."
                value={twitter}
                onChange={(event) =>
                  setTwitter(
                    event.target.value
                  )
                }
              />

            </div>


            <div className="form-group">

              <label>
                Telegram
              </label>

              <input
                type="url"
                placeholder="https://t.me/..."
                value={telegram}
                onChange={(event) =>
                  setTelegram(
                    event.target.value
                  )
                }
              />

            </div>

          </div>


          <div className="form-group">

            <label>
              Website
            </label>

            <input
              type="url"
              placeholder="https://..."
              value={website}
              onChange={(event) =>
                setWebsite(
                  event.target.value
                )
              }
            />

          </div>


          {launchChain ===
            "pumpfun" && (

            <>

              <div className="form-group">

                <label>
                  Trading Pair
                </label>

                <div className="pair-buttons">

                  <button
                    className={
                      pair === "SOL"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setPair("SOL")
                    }
                  >
                    SOL
                  </button>

                  <button
                    className={
                      pair === "USDC"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setPair("USDC")
                    }
                  >
                    USDC
                  </button>

                </div>

              </div>


              <label className="checkbox-row">

                <input
                  type="checkbox"
                  checked={
                    holderReward
                  }
                  onChange={(event) =>
                    setHolderReward(
                      event.target.checked
                    )
                  }
                />

                <span>
                  Enable Holder Rewards
                </span>

              </label>

            </>

          )}


          {launchChain ===
            "robinhood" && (

            <div className="info-box">

              <strong>
                Robinhood Chain
              </strong>

              <p>
                Your wallet will deploy
                an ERC-20 token directly
                on Robinhood Chain.
              </p>

              <p>
                Network: Robinhood Chain
                Mainnet
              </p>

              <p>
                Chain ID: 4663
              </p>

              <p>
                Gas token: ETH
              </p>

            </div>

          )}


          <div className="wallet-area">

            <WalletMultiButton />

          </div>


          <button
            className="create-token-button"
            onClick={
              handleCreate
            }
          >
            {launchChain ===
            "pumpfun"
              ? "CREATE ON PUMP.FUN"
              : "CREATE ON ROBINHOOD CHAIN"}
          </button>

        </div>


        <div className="launch-preview">

          <div className="preview-title">
            TOKEN PREVIEW
          </div>


          <div className="preview-token">

            <div className="preview-image">

              {imagePreview ? (

                <img
                  src={imagePreview}
                  alt="Token preview"
                />

              ) : (

                <span>
                  {symbol
                    ? symbol
                        .slice(0, 1)
                        .toUpperCase()
                    : "F"}
                </span>

              )}

            </div>


            <h2>
              {name ||
                "Your Token"}
            </h2>


            <div className="preview-symbol">
              $
              {symbol ||
                "TOKEN"}
            </div>


            <p>
              {description ||
                "Your token description will appear here."}
            </p>


            <div className="preview-links">

              {twitter && (
                <span>
                  X
                </span>
              )}

              {telegram && (
                <span>
                  Telegram
                </span>
              )}

              {website && (
                <span>
                  Website
                </span>
              )}

            </div>

          </div>


          <div className="launch-warning">

            <strong>
              Wallet signing required
            </strong>

            <p>
              FLASHGUYS will never ask
              for your private key or
              seed phrase.
            </p>

          </div>

        </div>

      </div>

    </section>
  );
}


/* =========================================================
   MAIN APP
========================================================= */

function FlashGuysApp() {

  const [
    page,
    setPage
  ] = useState("discover");

  const [
    chain,
    setChain
  ] = useState("sol");

  const [
    tokens,
    setTokens
  ] = useState([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    error,
    setError
  ] = useState("");

  const [
    selectedToken,
    setSelectedToken
  ] = useState(null);

  const [
    lastUpdated,
    setLastUpdated
  ] = useState(null);


  async function loadTokens() {

    try {

      setError("");

      const result =
        await fetchGMGNTokens(
          chain
        );

      setTokens(result);

      setLastUpdated(
        new Date()
      );

    } catch (err) {

      console.error(err);

      setError(
        err?.message ||
        "Unable to load tokens"
      );

    } finally {

      setLoading(false);

    }
  }


  useEffect(() => {

    if (
      page !== "discover"
    ) {
      return;
    }

    setLoading(true);

    loadTokens();

    const interval =
      setInterval(
        loadTokens,
        10000
      );

    return () =>
      clearInterval(interval);

  }, [
    chain,
    page
  ]);


  const sortedTokens =
    useMemo(() => {

      return [...tokens].sort(
        (a, b) =>
          (b.createdAt || 0) -
          (a.createdAt || 0)
      );

    }, [
      tokens
    ]);


  return (

    <div className="app">

      <header className="topbar">

        <div className="brand">

          <div className="brand-mark">
            F
          </div>

          <div>

            <div className="brand-name">
              FLASHGUYS
            </div>

            <div className="brand-tagline">
              Find the move before
              the crowd.
            </div>

          </div>

        </div>


        <nav className="main-nav">

          <button
            className={
              page === "discover"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage(
                "discover"
              )
            }
          >
            Discover
          </button>


          <button
            className={
              page === "launch"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage(
                "launch"
              )
            }
          >
            Launch
          </button>

        </nav>


        <div className="live-status">

          <span className="live-dot" />

          LIVE

        </div>

      </header>


      <main className="container">

        {page === "launch" ? (

          <LaunchPage />

        ) : (

          <>

            <section className="hero">

              <div>

                <h1>
                  New Tokens
                </h1>

                <p>
                  Discover newly created
                  tokens across Solana
                  and Robinhood Chain.
                </p>

              </div>


              <button
                className="refresh-button"
                onClick={
                  loadTokens
                }
              >
                Refresh
              </button>

            </section>


            <div className="chain-tabs">

              <button
                className={
                  chain === "sol"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setChain("sol")
                }
              >
                Solana
              </button>


              <button
                className={
                  chain ===
                  "robinhood"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setChain(
                    "robinhood"
                  )
                }
              >
                Robinhood Chain
              </button>


              <button
                className={
                  chain === "all"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setChain("all")
                }
              >
                All
              </button>

            </div>


            <section className="stats-bar">

              <div>

                <span>
                  NEW TOKENS
                </span>

                <strong>
                  {tokens.length}
                </strong>

              </div>


              <div>

                <span>
                  SOURCE
                </span>

                <strong>
                  GMGN
                </strong>

              </div>


              <div>

                <span>
                  UPDATED
                </span>

                <strong>
                  {lastUpdated
                    ? lastUpdated.toLocaleTimeString()
                    : "—"}
                </strong>

              </div>

            </section>


            {error && (

              <div className="error-box">
                {error}
              </div>

            )}


            <section className="token-table">

              <div className="table-header">

                <div>
                  Token
                </div>

                <div>
                  Price
                </div>

                <div>
                  Market Cap
                </div>

                <div>
                  Liquidity
                </div>

                <div>
                  Volume
                </div>

                <div>
                  Holders
                </div>

                <div>
                  Age
                </div>

              </div>


              {loading &&
              tokens.length ===
                0 ? (

                <div className="loading">
                  Loading new tokens...
                </div>

              ) : sortedTokens.length ===
                0 ? (

                <div className="empty">
                  No new tokens found.
                </div>

              ) : (

                sortedTokens.map(
                  (token) => (

                    <TokenRow
                      key={
                        token.id
                      }
                      token={
                        token
                      }
                      onClick={() =>
                        setSelectedToken(
                          token
                        )
                      }
                    />

                  )
                )

              )}

            </section>

          </>

        )}

      </main>


      <TokenModal
        token={
          selectedToken
        }
        onClose={() =>
          setSelectedToken(
            null
          )
        }
      />

    </div>

  );
}


/* =========================================================
   WALLET WRAPPER
========================================================= */

export default function App() {

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter()
    ],
    []
  );


  return (

    <ConnectionProvider
      endpoint={
        SOLANA_RPC
      }
    >

      <WalletProvider
        wallets={
          wallets
        }
        autoConnect
      >

        <WalletModalProvider>

          <FlashGuysApp />

        </WalletModalProvider>

      </WalletProvider>

    </ConnectionProvider>

  );
}
