// Conservative checks for discovery quality. These checks validate address shape,
// not contract safety or project legitimacy.
export function hasValidTokenAddress(token) {
  const address = String(token?.address || token?.mint || "").trim();
  const chain = String(token?.chain || token?.network || "sol").toLowerCase();
  return chain === "robinhood"
    ? /^0x[a-fA-F0-9]{40}$/.test(address)
    : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export function isRealTokenRecord(token) {
  const name = String(token?.name || "").trim();
  const symbol = String(token?.symbol || "").trim();
  return hasValidTokenAddress(token) && !!name && !!symbol
    && !["unknown", "???", "token", "n/a"].includes(name.toLowerCase())
    && !["unknown", "???", "token", "n/a"].includes(symbol.toLowerCase());
}

export function hasVerifiedLiveMarket(token) {
  return isRealTokenRecord(token) && !!token?.pairAddress
    && Number(token?.price) > 0 && Number(token?.liquidity) > 0
    && (Number(token?.volume1h) > 0 || Number(token?.volume24h) > 0);
}
