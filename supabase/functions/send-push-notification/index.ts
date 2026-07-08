import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// VAPID keys for push notifications
const VAPID_PUBLIC_KEY = "BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = "mailto:notifications@welile.com";

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  type?: string;
  notificationId?: string;
}

interface RequestBody {
  userIds?: string[];  // Specific user IDs to notify
  all?: boolean;       // Send to all users
  payload: PushPayload;
}

// Simple base64url encoding for JWT
function base64urlEncode(data: Uint8Array | string): string {
  const str = typeof data === 'string' ? data : String.fromCharCode(...data);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Decode a base64url (or base64) string to bytes
function base64urlToBytes(input: string): Uint8Array {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

/**
 * Encrypt a Web Push payload using the aes128gcm content encoding (RFC 8291 /
 * RFC 8188). Without this, modern push services (FCM, Mozilla autopush, etc.)
 * reject payload-bearing messages and delivery silently fails.
 */
async function encryptPayload(
  p256dh: string,
  auth: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const uaPublic = base64urlToBytes(p256dh); // recipient public key (65 bytes)
  const authSecret = base64urlToBytes(auth); // recipient auth secret (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Ephemeral ECDH key pair for this message.
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', asKeyPair.publicKey),
  ); // 65 bytes

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  const encoder = new TextEncoder();

  // Combine auth_secret + ecdh_secret -> IKM (RFC 8291 §3.4)
  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concatBytes(
    encoder.encode('WebPush: info\0'),
    uaPublic,
    asPublic,
  );
  const ikm = await hmacSha256(prkKey, concatBytes(keyInfo, new Uint8Array([1])));

  // HKDF (RFC 8188) to derive content-encryption key and nonce.
  const prk = await hmacSha256(salt, ikm);
  const cek = (
    await hmacSha256(
      prk,
      concatBytes(encoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])),
    )
  ).slice(0, 16);
  const nonce = (
    await hmacSha256(
      prk,
      concatBytes(encoder.encode('Content-Encoding: nonce\0'), new Uint8Array([1])),
    )
  ).slice(0, 12);

  // Single record: plaintext followed by the 0x02 "last record" delimiter.
  const record = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey(
    'raw',
    cek as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      record as BufferSource,
    ),
  );

  // aes128gcm header: salt(16) | rs(4) | idlen(1) | keyid(as_public)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const header = concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic);

  return concatBytes(header, ciphertext);
}

// Create JWT for VAPID
async function createVapidJwt(audience: string): Promise<string> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: VAPID_SUBJECT
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const claimsB64 = base64urlEncode(JSON.stringify(claims));
  const unsigned = `${headerB64}.${claimsB64}`;

  // VAPID_PRIVATE_KEY is a PKCS8-encoded (DER) EC private key in base64url.
  const pkcs8 = base64urlToBytes(VAPID_PRIVATE_KEY);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8 as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );
  try {
    const jwk = await crypto.subtle.exportKey('jwk', key);
    const pub = base64urlToBytes(VAPID_PUBLIC_KEY);
    console.log('VAPID pair check', {
      priv_x: jwk.x,
      priv_y: jwk.y,
      pub_x: base64urlEncode(pub.slice(1, 33)),
      pub_y: base64urlEncode(pub.slice(33, 65)),
    });
  } catch (_e) { /* ignore */ }

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${base64urlEncode(new Uint8Array(signature))}`;
}

async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<{ ok: boolean; gone: boolean }> {
  try {
    const endpoint = new URL(subscription.endpoint);
    const audience = `${endpoint.protocol}//${endpoint.host}`;

    // Create authorization header
    const jwt = await createVapidJwt(audience);
    const authorization = `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`;

    // Encrypt the JSON payload with aes128gcm so push services accept it.
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await encryptPayload(
      subscription.p256dh,
      subscription.auth,
      plaintext,
    );

    // Send push notification
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': payload.type === 'error' ? 'high' : 'normal',
      },
      body: encrypted,
    });

    if (!response.ok) {
      console.error(`Push failed for ${subscription.endpoint}: ${response.status}`);
      // Only 404/410 mean the endpoint is permanently gone (unsubscribed /
      // expired). Every other status (401, 429, 5xx, timeouts) is transient —
      // keep the subscription so we don't wipe valid devices on a bad send.
      return { ok: false, gone: response.status === 404 || response.status === 410 };
    }

    return { ok: true, gone: false };
  } catch (error) {
    console.error('Error sending push:', error);
    return { ok: false, gone: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userIds, all, payload }: RequestBody = await req.json();

    if (!payload || !payload.title) {
      return new Response(
        JSON.stringify({ error: "Missing payload or title" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch push subscriptions
    let query = supabase.from('push_subscriptions').select('*');
    
    if (all) {
      // Get all subscriptions
    } else if (userIds && userIds.length > 0) {
      query = query.in('user_id', userIds);
    } else {
      return new Response(
        JSON.stringify({ error: "Must specify userIds or all=true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No push subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notifications in parallel
    const results = await Promise.allSettled(
      subscriptions.map(sub => sendPushToSubscription(sub, payload))
    );

    const successful = results.filter(
      r => r.status === 'fulfilled' && r.value.ok,
    ).length;
    const failed = results.length - successful;

    // Clean up ONLY permanently-gone endpoints (404/410). Transient failures
    // keep their subscription so a single bad send never wipes a live device.
    const failedSubs = subscriptions.filter((_, i) => {
      const r = results[i];
      return r.status === 'fulfilled' && r.value.gone;
    });

    if (failedSubs.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', failedSubs.map(s => s.endpoint));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successful, 
        failed,
        total: subscriptions.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error('Error in send-push-notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
