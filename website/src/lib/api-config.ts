// API base URL - empty for local dev (uses Vite proxy), full URL for production
export const API_BASE = import.meta.env.VITE_API_URL || "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
