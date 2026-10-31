export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

function send(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return send(res, 503, { error: "Pinata is not configured. Add PINATA_JWT to Vercel Environment Variables." });

  try {
    const { imageBase64, fileName, contentType, name, symbol, description, website, twitter, telegram } = req.body || {};
    if (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:")) {
      return send(res, 400, { error: "Choose a logo image before uploading." });
    }
    if (!name?.trim() || !symbol?.trim()) return send(res, 400, { error: "Token name and ticker are required." });

    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return send(res, 400, { error: "The selected image could not be read." });
    const mime = contentType || match[1];
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/.test(mime)) return send(res, 400, { error: "Use a PNG, JPG, WEBP, or GIF image." });
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) return send(res, 400, { error: "Logo must be smaller than 4 MB." });

    const imageForm = new FormData();
    imageForm.append("file", new Blob([bytes], { type: mime }), String(fileName || "token-logo").replace(/[^a-zA-Z0-9._-]/g, "_"));
    imageForm.append("network", "public");
    const imageResponse = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: imageForm
    });
    const imagePayload = await imageResponse.json().catch(() => ({}));
    const imageCid = imagePayload?.data?.cid;
    if (!imageResponse.ok || !imageCid) {
      console.error("Pinata image upload failed:", imagePayload);
      return send(res, 502, { error: imagePayload?.error?.details || imagePayload?.error || "Pinata could not upload the logo." });
    }

    const gateway = String(process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud").replace(/\/$/, "");
    const image = `${gateway}/ipfs/${imageCid}`;
    const metadata = {
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      description: String(description || "").trim(),
      image,
      showName: true,
      createdOn: "https://flashguysholds-5g8r.vercel.app",
      ...(website?.trim() ? { website: website.trim() } : {}),
      ...(twitter?.trim() ? { twitter: twitter.trim() } : {}),
      ...(telegram?.trim() ? { telegram: telegram.trim() } : {})
    };
    const metadataForm = new FormData();
    metadataForm.append("file", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
    metadataForm.append("network", "public");
    const metadataResponse = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: metadataForm
    });
    const metadataPayload = await metadataResponse.json().catch(() => ({}));
    const metadataCid = metadataPayload?.data?.cid;
    if (!metadataResponse.ok || !metadataCid) {
      console.error("Pinata metadata upload failed:", metadataPayload);
      return send(res, 502, { error: metadataPayload?.error?.details || metadataPayload?.error || "Logo uploaded, but Pinata could not upload token metadata.", image, imageCid });
    }

    return send(res, 200, { image, imageCid, metadataUri: `ipfs://${metadataCid}`, metadataUrl: `${gateway}/ipfs/${metadataCid}`, metadataCid });
  } catch (error) {
    console.error("Pinata upload error:", error);
    return send(res, 500, { error: error?.message || "Pinata upload failed." });
  }
}
