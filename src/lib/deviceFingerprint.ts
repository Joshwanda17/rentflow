/**
 * Lightweight, stable-per-browser device fingerprint used ONLY for anti-fraud
 * gating at signup. Not a security boundary — a sophisticated attacker can
 * clear storage and change UA to bypass. Combined with IP + phone-OTP checks
 * server-side it is enough to stop casual bots.
 */
const STORAGE_KEY = 'welile_device_fp_v1';
const SEED_KEY = 'welile_device_seed_v1';

async function sha256Hex(input: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Fallback: cheap non-crypto hash — good enough for a fingerprint identifier.
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
    return 'fb_' + Math.abs(h).toString(16);
  }
}

function getSeed(): string {
  try {
    let s = localStorage.getItem(SEED_KEY);
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem(SEED_KEY, s);
    }
    return s;
  } catch {
    return 'no-storage';
  }
}

function canvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'nocanvas';
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('welile-fp:☁︎', 2, 2);
    return canvas.toDataURL().slice(-64);
  } catch {
    return 'nocanvas';
  }
}

export async function getDeviceFingerprint(): Promise<string> {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return cached;
  } catch { /* ignore */ }

  const parts = [
    getSeed(),
    navigator.userAgent || '',
    navigator.language || '',
    (navigator.languages || []).join(','),
    String(screen.width) + 'x' + String(screen.height) + 'x' + String(screen.colorDepth || ''),
    String(new Date().getTimezoneOffset()),
    String((navigator as any).hardwareConcurrency || ''),
    String((navigator as any).deviceMemory || ''),
    String((navigator as any).platform || ''),
    canvasSignature(),
  ];
  const hash = await sha256Hex(parts.join('|'));
  try { localStorage.setItem(STORAGE_KEY, hash); } catch { /* ignore */ }
  return hash;
}