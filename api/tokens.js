export default function handler(req, res) {
  const tokens = [
    {
      id: "solana-demo-1",
      chain: "solana",
      name: "Flash",
      symbol: "FLASH",
      price: 0.00042,
      change24h: 125.4,
      volume24h: 184500,
      liquidity: 92100,
      ageMinutes: 8,
      holders: 342
    },
    {
      id: "robinhood-demo-1",
      chain: "robinhood",
      name: "Flash Chain",
      symbol: "FLC",
      price: 0.0018,
      change24h: 84.2,
      volume24h: 92300,
      liquidity: 48100,
      ageMinutes: 14,
      holders: 218
    }
  ];

  const chain = req.query.chain;

  const filteredTokens =
    chain && chain !== "all"
      ? tokens.filter((token) => token.chain === chain)
      : tokens;

  res.status(200).json({
    success: true,
    source: "demo",
    live: false,
    tokens: filteredTokens
  });
}
