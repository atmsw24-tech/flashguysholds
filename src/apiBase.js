// Cloudflare Pages hosts the frontend; the existing Vercel project hosts the API.
// An explicit VITE_API_BASE_URL can override this when the backend is migrated.
const DEFAULT_API_BASE_URL = "https://flashguysholds-5g8r.vercel.app/api";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

export function apiUrl(path) {
  return `${API_BASE_URL}/${String(path || "").replace(/^\/+/, "")}`;
}
