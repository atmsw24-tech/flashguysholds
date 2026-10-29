import React, { useEffect, useState } from "react";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SESSION_KEY = "flashguys.auth.session";
const WALLET_KEY = "flashguys.connected.wallet";

async function fetchNativeWalletBalance(wallet) {
  if (!wallet?.address || !wallet?.chain) throw new Error("Connect a wallet to view its balance.");
  let nativeAmount, assetId, symbol;
  if (wallet.chain === "solana") {
    const response = await fetch("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet.address, { commitment: "confirmed" }] }) });
    const data = await response.json();
    if (!response.ok || data.error || !Number.isFinite(data.result?.value)) throw new Error(data.error?.message || "Could not read the Solana balance.");
    nativeAmount = data.result.value / 1e9; assetId = "solana"; symbol = "SOL";
  } else if (wallet.chain === "evm" || wallet.chain === "robinhood") {
    const response = await fetch("https://rpc.mainnet.chain.robinhood.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [wallet.address, "latest"] }) });
    const data = await response.json();
    if (!response.ok || data.error || typeof data.result !== "string") throw new Error(data.error?.message || "Could not read the Robinhood Chain balance.");
    nativeAmount = Number(BigInt(data.result)) / 1e18; assetId = "ethereum"; symbol = "ETH";
  } else throw new Error("Unsupported wallet network.");
  const priceResponse = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana%2Cethereum&vs_currencies=usd");
  const prices = await priceResponse.json();
  const price = prices?.[assetId]?.usd;
  if (!priceResponse.ok || !Number.isFinite(price) || price <= 0) throw new Error("On-chain balance loaded, but USD pricing is unavailable. Refresh to try again.");
  return { nativeAmount, symbol, price, usd: nativeAmount * price, updatedAt: new Date().toISOString() };
}
function formatUsd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function shortAddress(value) {
  return value ? value.slice(0, 5) + "..." + value.slice(-5) : "";
}

function getSolanaProvider() {
  const standardProviders = Array.isArray(window.__flashguysSolanaProviders) ? window.__flashguysSolanaProviders : [];
  const candidates = [
    ...standardProviders.map((item) => [item.provider, item.name]),
    [window.phantom?.solana, "Phantom"],
    [window.solflare, "Solflare"],
    [window.backpack?.solana, "Backpack"],
    [window.backpack, "Backpack"],
    [window.okxwallet?.solana, "OKX Wallet"],
    [window.coinbaseSolana, "Coinbase Wallet"],
    [window.trustwallet?.solana, "Trust Wallet"],
    [window.solana, "Solana wallet"]
  ];
  const seen = new Set();
  for (const [provider, name] of candidates) {
    if (!provider || seen.has(provider) || typeof provider.connect !== "function") continue;
    seen.add(provider);
    if (name === "Phantom" && provider.isPhantom !== true) continue;
    if (name === "Solflare" && provider.isSolflare !== true) continue;
    return { provider, name };
  }
  return null;
}

function discoverSolanaProviders() {
  if (typeof window === "undefined") return () => {};
  const found = [];
  const onAnnounce = (event) => {
    const detail = event?.detail;
    const provider = detail?.provider;
    if (provider?.connect && !found.some((item) => item.provider === provider)) {
      found.push({ provider, name: detail?.info?.name || "Solana wallet" });
      window.__flashguysSolanaProviders = found;
    }
  };
  window.addEventListener("wallet-standard:register", onAnnounce);
  window.dispatchEvent(new Event("wallet-standard:app-ready"));
  return () => window.removeEventListener("wallet-standard:register", onAnnounce);
}

function getEvmProvider() {
  // EIP-6963 is the modern discovery standard and works when multiple wallet
  // extensions coexist. The legacy injected providers remain a fallback.
  const discovered = Array.isArray(window.__flashguysEvmProviders)
    ? window.__flashguysEvmProviders
    : [];
  const candidates = [
    ...discovered,
    window.ethereum,
    window.metaMask,
    window.okxwallet,
    window.coinbaseWalletExtension,
    window.coinbaseWallet,
    window.trustwallet,
    window.braveEthereum
  ];
  const providers = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const provider = candidate.provider || candidate;
    const list = Array.isArray(provider.providers) ? provider.providers : [provider];
    for (const item of list) {
      if (item?.request && !providers.includes(item)) providers.push(item);
    }
  }
  return providers.find((provider) => provider.isMetaMask) ||
    providers.find((provider) => provider.isCoinbaseWallet) ||
    providers[0] || null;
}

function discoverEvmProviders() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return () => {};
  const found = [];
  const onAnnounce = (event) => {
    const detail = event?.detail;
    if (detail?.provider?.request && !found.some((item) => item.provider === detail.provider)) {
      found.push({ provider: detail.provider, info: detail.info || {} });
      window.__flashguysEvmProviders = found;
    }
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
}

async function authRequest(path, body, accessToken) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Account login is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.");
  }
  let response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    response = await fetch(SUPABASE_URL + path, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      ...(accessToken ? { Authorization: "Bearer " + accessToken } : {})
    },
    body: JSON.stringify(body)
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Supabase took more than 12 seconds to respond. Check your Vercel environment variables and Supabase Auth settings.");
    throw new Error("Cannot reach Supabase. Check the Vercel Supabase URL/key and redeploy. Details: " + (error?.message || "network request failed"));
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Authentication failed.");
  return data;
}

async function saveProfile(accessToken, user, updates = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !accessToken || !user?.id) return false;
  const response = await fetch(SUPABASE_URL + "/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + accessToken,
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: user.id,
      email: user.email || null,
      ...updates,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.details || "Could not save your profile to the database.");
  }
  return true;
}

export default function AccountPanel({ onClose }) {
  const recoveryParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const initialRecoveryToken = recoveryParams.get("type") === "recovery" ? recoveryParams.get("access_token") : "";
  const [mode, setMode] = useState(initialRecoveryToken ? "reset" : "signup");
  const [resetToken, setResetToken] = useState(initialRecoveryToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  });
  const [wallet, setWallet] = useState(() => {
    try { return JSON.parse(localStorage.getItem(WALLET_KEY) || "null"); } catch { return null; }
  });
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  async function refreshBalance(targetWallet = wallet) {
    if (!targetWallet?.address) { setBalance(null); setBalanceError("Connect a wallet to view a live balance."); return; }
    setBalanceLoading(true); setBalanceError("");
    try { setBalance(await fetchNativeWalletBalance(targetWallet)); }
    catch (error) { setBalance(null); setBalanceError(error?.message || "Unable to load the live wallet balance."); }
    finally { setBalanceLoading(false); }
  }

  useEffect(() => {
    if (session?.user?.email && wallet?.address) refreshBalance(wallet);
    else setBalance(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, wallet?.address, wallet?.chain]);

  useEffect(() => {
    const stopSolanaDiscovery = discoverSolanaProviders();
    return () => stopSolanaDiscovery();
  }, []);

  useEffect(() => {
    const stopEvmDiscovery = discoverEvmProviders();
    return () => stopEvmDiscovery();
  }, []);

  useEffect(() => {
    const listener = () => {
      try { setWallet(JSON.parse(localStorage.getItem(WALLET_KEY) || "null")); } catch {}
    };
    const evmProvider = getEvmProvider();
    const onAccountsChanged = (accounts) => {
      setWallet((current) => {
        if (!current || current.chain !== "evm") return current;
        const address = Array.isArray(accounts) ? accounts[0] : "";
        if (!address) {
          localStorage.removeItem(WALLET_KEY);
          window.dispatchEvent(new Event("flashguys:wallet"));
          return null;
        }
        const next = { ...current, address };
        localStorage.setItem(WALLET_KEY, JSON.stringify(next));
        return next;
      });
    };
    const onChainChanged = (chainId) => {
      setWallet((current) => {
        if (!current || current.chain !== "evm") return current;
        const next = { ...current, chainId: String(chainId || "") };
        localStorage.setItem(WALLET_KEY, JSON.stringify(next));
        return next;
      });
    };
    window.addEventListener("flashguys:wallet", listener);
    evmProvider?.on?.("accountsChanged", onAccountsChanged);
    evmProvider?.on?.("chainChanged", onChainChanged);
    return () => {
      window.removeEventListener("flashguys:wallet", listener);
      evmProvider?.removeListener?.("accountsChanged", onAccountsChanged);
      evmProvider?.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        await authRequest("/auth/v1/recover", {
          email: email.trim(),
          redirect_to: window.location.origin
        });
        setMessage("If an account exists for that email, a password reset link will be sent. Check your inbox and spam folder.");
        return;
      }

      if (mode === "reset") {
        if (!resetToken) throw new Error("This password-reset link is missing or expired. Request a new one.");
        if (password.length < 6) throw new Error("Your new password must be at least 6 characters.");
        const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + resetToken
          },
          body: JSON.stringify({ password })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.msg || result.message || result.error_description || "Could not reset your password. Request a new reset link.");
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        setResetToken("");
        setPassword("");
        setMode("login");
        setMessage("Password updated successfully. You can now sign in with your new password.");
        return;
      }

      const data = await authRequest(
        mode === "signup" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password",
        { email: email.trim(), password }
      );
      if (mode === "signup" && !data.access_token) {
        setMessage("Account created. Check your email to verify your account, then sign in.");
      } else {
        const saved = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user,
          expires_at: data.expires_at || null
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
        setSession(saved);
        try {
          await saveProfile(saved.access_token, saved.user);
          setMessage("You are signed in. Your account profile is saved to the database.");
        } catch (profileError) {
          setMessage("You are signed in, but profile storage needs setup: " + profileError.message);
        }
      }
      setPassword("");
    } catch (error) {
      setMessage(error.message || "Unable to complete account request.");
    } finally {
      setBusy(false);
    }
  }

  async function connectWallet(kind) {
    setMessage("");
    try {
      let address = "";
      if (kind === "solana") {
        const detected = getSolanaProvider();
        const provider = detected?.provider;
        if (!provider?.connect) {
          throw new Error("FLASHGUYS could not find a compatible Solana wallet provider. Unlock your wallet and reload this page. If it is installed but still not detected, allow the extension on this site or try the wallet’s official browser extension.");
        }
        const result = await provider.connect();
        address = result?.publicKey?.toString?.() || provider.publicKey?.toString?.();
        if (!address) throw new Error("Wallet did not return a public address.");
        const connected = {
          chain: kind,
          walletName: detected.name,
          address,
          connectedAt: new Date().toISOString()
        };
        localStorage.setItem(WALLET_KEY, JSON.stringify(connected));
        setWallet(connected);
        window.dispatchEvent(new Event("flashguys:wallet"));
        if (session?.access_token && session?.user?.id) {
          try {
            await saveProfile(session.access_token, session.user, { wallet_address: address, wallet_chain: "solana", wallet_name: detected.name });
            setMessage(`${detected.name} connected. Wallet address saved to your FLASHGUYS database profile. No transaction was sent.`);
          } catch (profileError) {
            setMessage(`${detected.name} connected in this browser, but database saving failed: ${profileError.message}`);
          }
        } else {
          setMessage(`${detected.name} connected in this browser. Sign in to save this wallet to your database profile. No transaction was sent.`);
        }
      } else {
        const provider = getEvmProvider();
        if (!provider?.request) throw new Error("FLASHGUYS cannot detect an EVM wallet provider. Unlock your wallet and refresh the page. If this browser blocks wallet extensions, allow the extension on this site or install MetaMask.");
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        address = accounts?.[0] || "";
        if (!address) throw new Error("Wallet did not return a public address.");
        // Robinhood Chain mainnet: chain ID 4663 (0x1237).
        // Request a network switch; if the wallet has not added it, request that it be added.
        let chainId = String(await provider.request({ method: "eth_chainId" }) || "").toLowerCase();
        const robinhoodChain = {
          chainId: "0x1237",
          chainName: "Robinhood Chain",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
          blockExplorerUrls: ["https://robinhoodchain.blockscout.com"]
        };
        if (chainId !== robinhoodChain.chainId) {
          try {
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: robinhoodChain.chainId }]
            });
          } catch (switchError) {
            if (switchError?.code === 4902) {
              await provider.request({
                method: "wallet_addEthereumChain",
                params: [robinhoodChain]
              });
              await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: robinhoodChain.chainId }]
              });
            } else {
              throw new Error("Wallet connected, but Robinhood Chain was not selected. Approve the network switch to continue.");
            }
          }
          chainId = String(await provider.request({ method: "eth_chainId" }) || "").toLowerCase();
        }
        if (chainId !== robinhoodChain.chainId) {
          throw new Error("Wallet did not switch to Robinhood Chain (chain ID 4663). Check the selected network in your wallet.");
        }
        const connected = {
          chain: kind,
          walletName: provider.isMetaMask ? "MetaMask" : "EVM wallet",
          address,
          chainId,
          connectedAt: new Date().toISOString()
        };
        localStorage.setItem(WALLET_KEY, JSON.stringify(connected));
        setWallet(connected);
        window.dispatchEvent(new Event("flashguys:wallet"));
        if (session?.access_token && session?.user?.id) {
          try {
            await saveProfile(session.access_token, session.user, { wallet_address: address, wallet_chain: "robinhood", wallet_name: connected.walletName });
            setMessage(`${connected.walletName} connected to Robinhood Chain (4663). Wallet address saved to your FLASHGUYS database profile. No transaction was sent.`);
          } catch (profileError) {
            setMessage(`${connected.walletName} connected, but database saving failed: ${profileError.message}`);
          }
        } else {
          setMessage(`${connected.walletName} connected to Robinhood Chain (4663). Sign in to save this wallet to your database profile. No transaction was sent.`);
        }
      }
    } catch (error) {
      setMessage(error?.message || "Wallet connection was cancelled or failed.");
    }
  }

  async function disconnectWallet() {
    try {
      if (wallet?.chain === "solana") {
        const provider = getSolanaProvider()?.provider;
        await provider?.disconnect?.();
      }
    } catch {}
    localStorage.removeItem(WALLET_KEY);
    setWallet(null);
    setBalance(null);
    setBalanceError("Connect a wallet to view a live balance.");
    setMessage("Wallet disconnected from this website.");
  }

  function signOut() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setMessage("You have signed out.");
  }

  return (
    <div className="account-backdrop" onClick={onClose}>
      <section className="account-panel" role="dialog" aria-modal="true" aria-label="FLASHGUYS account" onClick={(event) => event.stopPropagation()}>
        <button className="account-close" onClick={onClose} aria-label="Close account panel">×</button>
        <div className="account-brand">FLASHGUYS <span>ACCOUNT</span></div>
        <h2>{session?.user?.email ? "Your account" : mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Welcome back"}</h2>
        <p className="account-subtitle">{session?.user?.email ? "Manage your profile and connect your crypto wallet." : mode === "signup" ? "Join FLASHGUYS to follow the tokens moving first." : mode === "forgot" ? "Enter your account email and we’ll send you a secure reset link." : mode === "reset" ? "Set a new password for your FLASHGUYS account." : "Sign in to your FLASHGUYS account."}</p>

        {session?.user?.email ? (
          <div className="account-signed-in">
            <div className="account-label">SIGNED IN AS</div>
            <strong>{session.user.email}</strong>
            <div className="account-balance-card" aria-live="polite">
              <div className="account-balance-top"><span className="account-label">LIVE WALLET VALUE</span>
                <button type="button" className="account-secondary" onClick={() => refreshBalance()} disabled={balanceLoading || !wallet?.address}>{balanceLoading ? "Refreshing…" : "Refresh"}</button>
              </div>
              <div className="account-balance-total">{balance ? formatUsd(balance.usd) : "—"}</div>
              <div className="account-balance-detail">{!wallet?.address ? "Connect Solana or Robinhood Chain to see your balance." : balanceLoading && !balance ? "Reading on-chain balance…" : balanceError || (balance ? `${balance.nativeAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${balance.symbol} · ${formatUsd(balance.price)} per ${balance.symbol}` : "Balance not loaded yet.")}</div>
              {balance?.updatedAt ? <div className="account-balance-updated">Updated {new Date(balance.updatedAt).toLocaleTimeString()}</div> : null}
            </div>
            <button className="account-secondary" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <form className="account-form" onSubmit={submit} onInvalid={(event) => { setMessage(event.target?.validationMessage ? "Please check the form: " + event.target.validationMessage : "Please enter a valid email and a password of at least 6 characters."); }}>
            <label>Email address</label>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {mode !== "forgot" ? <>
              <label>{mode === "reset" ? "New password" : "Password"}</label>
              <input type="password" autoComplete={mode === "signup" || mode === "reset" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "reset" ? "Enter your new password" : "At least 6 characters"} />
            </> : null}
            {mode === "login" ? <button type="button" className="account-forgot" onClick={() => { setMode("forgot"); setMessage(""); }}>Forgot password?</button> : null}
            <button type="submit" className="account-primary" disabled={busy}>{busy ? "Please wait..." : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Update password" : "Sign in"}</button>
            <p className="account-switch">{mode === "signup" ? "Already have an account?" : mode === "forgot" || mode === "reset" ? "Remembered your password?" : "New to FLASHGUYS?"} <button type="button" onClick={() => { setMode(mode === "signup" ? "login" : "login"); setMessage(""); setPassword(""); }}>{mode === "signup" ? "Sign in" : mode === "forgot" || mode === "reset" ? "Back to sign in" : "Create account"}</button></p>
          </form>
        )}
        {message ? <div className="account-message account-message-near-form" role="status" aria-live="polite">{message}</div> : null}

        <div className="account-divider"><span>CHOOSE YOUR ECOSYSTEM</span></div>
        <div className="account-ecosystems" aria-label="Choose a blockchain"><button type="button" className="account-ecosystem solana-ecosystem" onClick={() => connectWallet("solana")}>Connect Solana</button><button type="button" className="account-ecosystem robinhood-ecosystem" onClick={() => connectWallet("evm")}>Connect Robinhood Chain</button></div>
        {wallet ? (
          <div className="wallet-connected">
            <div className="wallet-dot" />
            <div className="wallet-details"><strong>{wallet.walletName || (wallet.chain === "solana" ? "Solana wallet" : "EVM wallet")}</strong><span>{shortAddress(wallet.address)}{wallet.chain === "evm" && wallet.chainId ? ` · Network ID ${wallet.chainId}` : ""}</span></div>
            <button className="account-secondary" onClick={disconnectWallet}>Disconnect</button>
          </div>
        ) : (
          <div className="wallet-buttons">
            <button type="button" className="wallet-button" onClick={() => connectWallet("solana")}><span className="wallet-symbol solana-symbol">S</span><span><strong>Solana</strong><small>Connect Phantom or Solflare</small></span><b>Connect</b></button>
            <button type="button" className="wallet-button" onClick={() => connectWallet("evm")}><span className="wallet-symbol evm-symbol">◇</span><span><strong>Robinhood Chain</strong><small>Connect MetaMask or a compatible EVM wallet</small></span><b>Connect</b></button>
          </div>
        )}
        <p className="account-safety">FLASHGUYS never asks for your seed phrase or private key. Connecting a wallet does not send a transaction. The Robinhood Chain button requests an EVM wallet and verifies chain ID 4663 before reporting a successful connection.</p>
      </section>
    </div>
  );
}
