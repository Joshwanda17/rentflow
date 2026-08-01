import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://welileapp.com";

function formatUGX(amount: number): string {
  return `UGX ${Number(amount || 0).toLocaleString("en-UG")}`;
}

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Accept both ?id=<uuid> and the branded path form /merchandise/og/<uuid>
  const pathId = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const itemId =
    url.searchParams.get("id") ||
    (/^[0-9a-f-]{16,}$/i.test(pathId) ? pathId : null);
  const source = url.searchParams.get("src");
  if (!itemId) {
    return new Response("Missing item id", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: item } = await supabase
    .from("merchandise_catalog")
    .select("id, item_name, description, unit_price, image_url, image_urls")
    .eq("id", itemId)
    .limit(1)
    .maybeSingle();

  const target = `${SITE_URL}/merchandise?item=${encodeURIComponent(itemId)}`;

  // Analytics: record every time a shared merchandise link is opened, and which
  // item was clicked. Link-preview crawlers are flagged separately from humans.
  const userAgent = req.headers.get("user-agent") ?? "";
  const isBot =
    /bot|crawler|spider|facebookexternalhit|whatsapp|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|preview|embedly|pinterest|vkshare|skypeuripreview|googlebot|bingbot|redditbot/i.test(
      userAgent,
    );
  try {
    await supabase.from("merchandise_share_opens").insert({
      catalog_id: itemId,
      item_name: item?.item_name ?? null,
      is_bot: isBot,
      user_agent: userAgent.slice(0, 500),
      referrer: (req.headers.get("referer") ?? "").slice(0, 500) || null,
      source: source ? source.slice(0, 50) : null,
    });
  } catch (e) {
    console.error("share open tracking failed", e);
  }

  if (!item) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SITE_URL}/merchandise`, ...corsHeaders },
    });
  }

  const images: string[] = Array.isArray(item.image_urls) ? item.image_urls : [];
  const image = images[0] || item.image_url || `${SITE_URL}/og-image.png`;
  const title = `${item.item_name} — ${formatUGX(Number(item.unit_price))} | Welile Merchandise`;
  const description =
    item.description ||
    `${item.item_name} available on Welile Merchandise for ${formatUGX(Number(item.unit_price))}. Pay from your Welile wallet.`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />

  <meta property="og:type" content="product" />
  <meta property="og:url" content="${esc(target)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:secure_url" content="${esc(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(item.item_name)}" />
  <meta property="og:site_name" content="Welile" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />

  <link rel="canonical" href="${esc(target)}" />
  <meta http-equiv="refresh" content="0;url=${esc(target)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(target)}">${esc(item.item_name)}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...corsHeaders,
    },
  });
});
