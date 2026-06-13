const BASE = import.meta.env.VITE_API_URL || 'https://veeda.onrender.com';
const KEY = import.meta.env.VITE_VEDA_API_KEY || '';

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'x-veda-api-key': KEY,
        ...opts.headers,
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
