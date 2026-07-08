// Web Push helpers shared by the subscription UI.
//
// The VAPID *public* key is safe to ship in client code — it is the public half
// of the keypair. The matching private key lives only in the
// `send-push-notification` edge function (VAPID_PRIVATE_KEY secret).
export const VAPID_PUBLIC_KEY =
  "BGBr-FpnY4VrB-Whq9rXDTjeiH7vGXCquZk1kmkET87x12qkW073Tx-J8qJHcLW-8j4534x05f80WdLHPmnsKz0";

/**
 * Converts a base64url VAPID public key into the Uint8Array the
 * PushManager.subscribe() `applicationServerKey` option requires.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Returns the base64-encoded value of a PushSubscription key (p256dh / auth). */
export function arrayBufferToBase64(buffer: BufferSource | null): string {
  if (!buffer) return "";
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Returns true when a browser PushSubscription was created with the current public VAPID key. */
export function subscriptionUsesCurrentVapidKey(subscription: PushSubscription): boolean {
  const key = subscription.options?.applicationServerKey;
  if (!key) return false;

  const encodedKey = arrayBufferToBase64(key)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return encodedKey === VAPID_PUBLIC_KEY;
}

/** True when the current browser can register a SW and subscribe to push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}