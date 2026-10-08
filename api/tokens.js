const demoTokens = [
  {
    id: "sol-flash",
    chain: "sol",
    name: "Solana Flash",
    symbol: "FLASH",
    price: 0.00042,
    marketCap: 42000,
    liquidity: 18500,
    volume1h: 9200,
    volume24h: 38500,
    change24h: 125.4,
    holders: 184,
    createdAt: Date.now() - 18 * 60 * 1000,
    logo: null,
    description: "Demo Solana token for testing FLASHGUYS."
  },
  {
    id: "sol-moon",
    chain: "sol",
    name: "Sol Moon",
    symbol: "MOON",
    price: 0.00124,
    marketCap: 124000,
    liquidity: 42000,
    volume1h: 18600,
    volume24h: 97000,
    change24h: 67.8,
    holders: 421,
    createdAt: Date.now() - 42 * 60 * 1000,
    logo: null,
    description: "Demo Solana token for testing FLASHGUYS."
  },
  {
    id: "rh-flash",
    chain: "robinhood",
    name: "Robinhood Flash Chain",
    symbol: "FLC",
    price: 0.0018,
    marketCap: 180000,
    liquidity: 63000,
    volume1h: 27100,
    volume24h: 142000,
    change24h: 84.2,
    holders: 562,
    createdAt: Date.now() - 27 * 60 * 1000,
    logo: null,
    description: "Demo Robinhood Chain token for testing FLASHGUYS."
  },
  {
    id: "rh-meme",
    chain: "robinhood",
    name: "Robin Meme",
    symbol: "RMEME",
    price: 0.00076,
    marketCap: 76000,
    liquidity: 29000,
    volume1h: 11300,
    volume24h: 58400,
    change24h: 49.6,
    holders: 297,
    createdAt: Date.now() - 65 * 60 * 1000,
    logo: null,
    description: "Demo Robinhood Chain token for testing FLASHGUYS."
  }
];

export default function handler(req, res) {
  const chain =
    typeof req.query?.chain === "string"
      ? req.query.chain.toLowerCase()
      : "all";

  if (!["all", "sol", "robinhood"].includes(chain)) {
    return res.status(400).json({
      success: false,
      error: "Invalid chain. Use all, sol, or robinhood."
    });
  }

  const tokens =
    chain === "all"
      ? demoTokens
      : demoTokens.filter(
          (token) => token.chain === chain
        );

  return res.status(200).json({
    success: true,
    source: "demo",
    live: false,
    chain,
    tokens
  });
}
