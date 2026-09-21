export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const apiKey = process.env.GMGN_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "GMGN_API_KEY is missing"
    });
  }

  try {
    const response = await fetch(
      "https://api.gmgn.ai/v1/trenches",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          chain: "sol",
          type: ["new_creation"],
          limit: 80
        })
      }
    );

    const text = await response.text();

    return res.status(200).json({
      success: true,
      gmgnStatus: response.status,
      gmgnOk: response.ok,
      response: text.slice(0, 5000)
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Unknown fetch error",
      name: error?.name || null,
      cause: error?.cause
        ? String(error.cause)
        : null
    });
  }
}
