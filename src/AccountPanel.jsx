import React, { useEffect, useState } from "react";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SESSION_KEY = "flashguys.auth.session";
const WALLET_KEY = "flashguys.connected.wallet";

function shortAddress(value) {
  return value ? value.slice(0, 5) + "..." + value.slice(-5) : "";
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
  const [mode, setMode] = useState("signup");
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
    window.addEventListener("flashguys:wallet", listener);
    return () => window.removeEventListener("flashguys:wallet", listener);
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
        const provider = window.phantom?.solana || window.solana;
        if (!provider?.connect) {
          throw new Error("Solana wallet not found. Install Phantom or Solflare, then reload this page.");
        }
        const result = await provider.connect();
        address = result?.publicKey?.toString?.() || provider.publicKey?.toString?.();
        if (!address) throw new Error("Wallet did not return a public address.");
      } else {
        const provider = window.ethereum;
        if (!provider?.request) throw new Error("EVM wallet not found. Install MetaMask or another compatible wallet.");
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        address = accounts?.[0] || "";
        if (!address) throw new Error("Wallet did not return a public address.");
      }
      const connected = { chain: kind, address, connectedAt: new Date().toISOString() };
      localStorage.setItem(WALLET_KEY, JSON.stringify(connected));
      setWallet(connected);
      window.dispatchEvent(new Event("flashguys:wallet"));
      setMessage("Wallet connected. No transaction was sent.");
    } catch (error) {
      setMessage(error?.message || "Wallet connection was cancelled or failed.");
    }
  }

  async function disconnectWallet() {
    try {
      if (wallet?.chain === "solana") {
        const provider = window.phantom?.solana || window.solana;
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
        <h2>{session?.user?.email ? "Your account" : mode === "signup" ? "Create your account" : "Welcome back"}</h2>
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
            <button className="account-primary" disabled={busy}>{busy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button>
            <button type="button" className="account-text-button" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setMessage(""); }}>
              {mode === "signup" ? "Already have an account? Sign in" : "New to FLASHGUYS? Create account"}
            </button>
          </form>
        )}

        <div className="account-divider"><span>CONNECT A WALLET</span></div>
        {wallet ? (
          <div className="wallet-connected">
            <div className="wallet-dot" />
            <div className="wallet-details"><strong>{wallet.chain === "solana" ? "Solana wallet" : "EVM wallet"}</strong><span>{shortAddress(wallet.address)}</span></div>
            <button className="account-secondary" onClick={disconnectWallet}>Disconnect</button>
          </div>
        ) : (
          <div className="wallet-buttons">
            <button className="wallet-button" onClick={() => connectWallet("solana")}><span className="wallet-symbol solana-symbol">S</span><span><strong>Solana wallet</strong><small>Phantom / Solflare</small></span><b>Connect</b></button>
            <button className="wallet-button" onClick={() => connectWallet("evm")}><span className="wallet-symbol evm-symbol">◇</span><span><strong>EVM wallet</strong><small>MetaMask / compatible</small></span><b>Connect</b></button>
          </div>
        )}
        <p className="account-safety">FLASHGUYS never asks for your seed phrase or private key. Connecting a wallet does not send a transaction.</p>
        {message ? <div className="account-message" role="status">{message}</div> : null}
      </section>
    </div>
  );
}
