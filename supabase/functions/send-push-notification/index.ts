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

  // Import the private key
  const privateKeyRaw = Uint8Array.from(atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    'raw',
    privateKeyRaw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

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
): Promise<boolean> {
  try {
    const endpoint = new URL(subscription.endpoint);
    const audience = `${endpoint.protocol}//${endpoint.host}`;

    // Create authorization header
    const jwt = await createVapidJwt(audience);
    const authorization = `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`;

    // Send push notification
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json',
        'TTL': '86400',
        'Urgency': payload.type === 'error' ? 'high' : 'normal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Push failed for ${subscription.endpoint}: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending push:', error);
    return false;
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

    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = results.length - successful;

    // Clean up failed subscriptions (expired endpoints)
    const failedSubs = subscriptions.filter((_, i) => 
      results[i].status === 'rejected' || 
      (results[i].status === 'fulfilled' && !(results[i] as PromiseFulfilledResult<boolean>).value)
    );

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
