// Shared API origin for deployments where the frontend and API are hosted separately.
// Set VITE_API_BASE_URL to the backend's /api URL in Cloudflare Pages build variables.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\\/+$/, "");

export function apiUrl(path) {
  return `${API_BASE_URL}/${String(path || "").replace(/^\\/+/, "")}`;
}
