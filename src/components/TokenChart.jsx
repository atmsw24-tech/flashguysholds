
import { useEffect, useState } from "react";

export default function TokenChart({ address }) {
  const [points, setPoints] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/chart?address=${encodeURIComponent(address)}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load chart");
        }

        if (!cancelled) {
          setPoints(data.changes || []);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (error) return <p>{error}</p>;
  if (!points.length) return <p>No chart data available yet.</p>;

  const values = points.map((p) => p.changePercent);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const coords = values.map((value, i) => ({
    x: 12 + (i * 276) / Math.max(values.length - 1, 1),
    y: 88 - ((value - min) / range) * 76
  }));

  const line = coords
    .map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <div style={{ width: "100%", maxWidth: 520 }}>
      <svg
        viewBox="0 0 300 110"
        role="img"
        aria-label="Available token price change chart"
        style={{ width: "100%", overflow: "visible" }}
      >
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap"
        }}
      >
        {points.map((p) => (
          <span key={p.label}>
            {p.label}: {p.changePercent.toFixed(2)}%
          </span>
        ))}
      </div>
    </div>
  );
}
