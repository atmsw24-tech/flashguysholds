export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.UNISWAP_API_KEY) return res.status(503).json({ error: "Add UNISWAP_API_KEY to Vercel and redeploy." });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const action = body?.action;
  if (!["quote", "swap"].includes(action)) return res.status(400).json({ error: "Unsupported action." });
  const payload = action === "quote"
    ? { tokenIn: body.tokenIn, tokenOut: body.tokenOut, amount: body.amount, swapper: body.swapper, tokenInChainId: 4663, tokenOutChainId: 4663, type: "EXACT_INPUT", slippageTolerance: 1 }
    : { quote: body.quote };
  const response = await fetch("https://trade-api.gateway.uniswap.org/v1/" + action, {
    method: "POST",
    headers: { "x-api-key": process.env.UNISWAP_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(response.status >= 500 ? 502 : response.status).json({ error: data.detail || data.message || data.error || "Uniswap request failed." });
  return res.status(200).json(data);
}
