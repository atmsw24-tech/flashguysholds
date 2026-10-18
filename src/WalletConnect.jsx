import React, { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

function shortAddress(address) {
  return address ? `${address.slice(0, 5)}…${address.slice(-4)}` : "";
}

export default function WalletConnect() {
  const { connected, publicKey } = useWallet();
  const [evmAddress, setEvmAddress] = useState("");
  const [evmBusy, setEvmBusy] = useState(false);
  const [evmError, setEvmError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkExistingConnection() {
      if (!window.ethereum) return;
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (active && Array.isArray(accounts) && accounts[0]) setEvmAddress(accounts[0]);
      } catch {
        // Wallet may be locked or unavailable; user can connect manually.
      }
    }
    checkExistingConnection();

    const onAccountsChanged = (accounts) => {
      setEvmAddress(Array.isArray(accounts) && accounts[0] ? accounts[0] : "");
    };
    window.ethereum?.on?.("accountsChanged", onAccountsChanged);

    return () => {
      active = false;
      window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  async function connectEvm() {
    setEvmError("");
    if (!window.ethereum) {
      setEvmError("Install MetaMask or another compatible EVM wallet first.");
      return;
    }
    setEvmBusy(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (Array.isArray(accounts) && accounts[0]) setEvmAddress(accounts[0]);
    } catch (error) {
      if (error?.code === 4001) {
        setEvmError("Wallet connection was cancelled.");
      } else {
        setEvmError("Could not connect EVM wallet. Please try again.");
      }
    } finally {
      setEvmBusy(false);
    }
  }

  return (
    <div className="wallet-connect">
      <WalletMultiButton className="flashguys-wallet-button" />

      <button
        type="button"
        className="wallet-evm-button"
        onClick={connectEvm}
        disabled={evmBusy}
        title={evmAddress ? `Connected: ${evmAddress}` : "Connect an EVM wallet"}
      >
        {evmBusy ? "Connecting…" : evmAddress ? shortAddress(evmAddress) : "Connect EVM"}
      </button>

      <div className="wallet-status" aria-live="polite">
        {connected && publicKey ? `Solana: ${shortAddress(publicKey.toBase58())}` : ""}
        {connected && evmAddress ? " · " : ""}
        {evmAddress ? `EVM: ${shortAddress(evmAddress)}` : ""}
      </div>
      {evmError && <div className="wallet-error" role="status">{evmError}</div>}
    </div>
  );
}
