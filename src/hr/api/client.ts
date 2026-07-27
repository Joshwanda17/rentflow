/**
 * HR transport layer — the single swap point.
 *
 * Today every HR read resolves a mock after a short delay, so that loading and
 * error states are built and tested from day one rather than bolted on later.
 *
 * When the engine API is ready, ONLY this file changes. No screen is touched.
 */
const USE_MOCKS = true;
const MOCK_LATENCY_MS = 300;

export async function resolve<T>(value: T): Promise<T> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));
    return value;
  }
  throw new Error('Live HR API not wired yet');
}

/* When the engine lands, this replaces `resolve` and nothing else changes:
 *
 * export async function get<T>(path: string): Promise<T> {
 *   const res = await fetch(`${import.meta.env.VITE_HR_API_URL}${path}`, {
 *     headers: { Authorization: `Bearer ${await getAccessToken()}` },
 *   });
 *   if (!res.ok) throw new Error(`HR API ${res.status}`);
 *   return res.json();
 * }
 */
