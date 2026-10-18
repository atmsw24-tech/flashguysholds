import React, { useEffect, useState } from "react";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SESSION_KEY = "flashguys.auth.session";
const WALLET_KEY = "flashguys.connected.wallet";

function shortAddress(value) {
  return value ? value.slice(0, 5) + "..." + value.slice(-5) : "";
}

function getSolanaProvider() {
  // Prefer explicitly identified wallet providers; generic window.solana can
  // be overwritten when users have more than one wallet extension installed.
  if (window.phantom?.solana?.isPhantom) return { provider: window.phantom.solana, name: "Phantom" };
  if (window.solflare?.isSolflare) return { provider: window.solflare, name: "Solflare" };
  if (window.solana?.isPhantom) return { provider: window.solana, name: "Phantom" };
  if (window.solana?.isSolflare) return { provider: window.solana, name: "Solflare" };
  if (window.solana?.connect) return { provider: window.solana, name: "Solana wallet" };
  return null;
}

function getEvmProvider() {
  const ethereum = window.ethereum;
  if (!ethereum?.request) return null;
  // MetaMask exposes multiple providers when several EVM wallet extensions
  // are installed. Select MetaMask when present, otherwise use the injected
  // EVM provider supplied by the browser wallet.
  const providers = Array.isArray(ethereum.providers) ? ethereum.providers : [ethereum];
  return providers.find((provider) => provider.isMetaMask) || providers[0] || null;
}

async function authRequest(path, body, accessToken) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Account login is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.");
  }
  const response = await fetch(SUPABASE_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      ...(accessToken ? { Authorization: "Bearer " + accessToken } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Authentication failed.");
  return data;
}

export default function AccountPanel({ onClose }) {
  const [mode] = useState("login");
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
        setMessage("You are signed in.");
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
          throw new Error("No Solana wallet was detected. Install Phantom or Solflare, then reload FLASHGUYS.");
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
        setMessage(`${detected.name} connected to FLASHGUYS. No transaction was sent.`);
      } else {
        const provider = getEvmProvider();
        if (!provider?.request) throw new Error("No EVM wallet was detected. Install MetaMask or another compatible wallet, then reload FLASHGUYS.");
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        address = accounts?.[0] || "";
        if (!address) throw new Error("Wallet did not return a public address.");
        const chainId = await provider.request({ method: "eth_chainId" });
        const connected = {
          chain: kind,
          walletName: provider.isMetaMask ? "MetaMask" : "EVM wallet",
          address,
          chainId: String(chainId || ""),
          connectedAt: new Date().toISOString()
        };
        localStorage.setItem(WALLET_KEY, JSON.stringify(connected));
        setWallet(connected);
        window.dispatchEvent(new Event("flashguys:wallet"));
        setMessage(`${connected.walletName} connected. Confirm the network before using chain-specific features. No transaction was sent.`);
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
        <h2>{session?.user?.email ? "Your account" : "Sign in"}</h2>
        <p className="account-subtitle">Manage your profile and connect your crypto wallet.</p>

        {session?.user?.email ? (
          <div className="account-signed-in">
            <div className="account-label">SIGNED IN AS</div>
            <strong>{session.user.email}</strong>
            <button className="account-secondary" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <form className="account-form" onSubmit={submit}>
            <label>Email address</label>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <label>Password</label>
            <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
            <button className="account-primary" disabled={busy}>{busy ? "Please wait..." : "Sign in"}</button>
          </form>
        )}

        <div className="account-divider"><span>CONNECT A WALLET</span></div>
        {wallet ? (
          <div className="wallet-connected">
            <div className="wallet-dot" />
            <div className="wallet-details"><strong>{wallet.walletName || (wallet.chain === "solana" ? "Solana wallet" : "EVM wallet")}</strong><span>{shortAddress(wallet.address)}{wallet.chain === "evm" && wallet.chainId ? ` · Network ID ${wallet.chainId}` : ""}</span></div>
            <button className="account-secondary" onClick={disconnectWallet}>Disconnect</button>
          </div>
        ) : (
          <div className="wallet-buttons">
            <button className="wallet-button" onClick={() => connectWallet("solana")}><span className="wallet-symbol solana-symbol">S</span><span><strong>Solana wallet</strong><small>Phantom or Solflare</small></span><b>Connect</b></button>
            <button className="wallet-button" onClick={() => connectWallet("evm")}><span className="wallet-symbol evm-symbol">◇</span><span><strong>EVM wallet</strong><small>MetaMask or compatible EVM wallet</small></span><b>Connect</b></button>
          </div>
        )}
        <p className="account-safety">FLASHGUYS never asks for your seed phrase or private key. Connecting a wallet does not send a transaction. The EVM network ID is shown for verification; network switching and trading are not enabled by this connection button.</p>
        {message ? <div className="account-message" role="status">{message}</div> : null}
      </section>
    </div>
  );
}
