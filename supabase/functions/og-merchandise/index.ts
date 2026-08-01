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

// Brand fallback used when an item has no photo at all.
const FALLBACK_IMAGE = `${SITE_URL}/welile-logo.png`;

function clamp(s: string, max: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * WhatsApp crops link-preview images to a fixed landscape card and rejects
 * images it cannot size. Item photos are uploaded at any aspect ratio, so when
 * the photo lives in our own storage we serve it through the image transform
 * endpoint at an exact 1200x630 cover crop. That makes the declared
 * og:image:width/height truthful for every item, whatever the original shape.
 */
function normalizeImage(raw: string): { url: string; width?: number; height?: number; type?: string } {
  const src = String(raw || "").trim();
  if (!src) return { url: FALLBACK_IMAGE };

  const publicMatch = src.match(/^(https?:\/\/[^/]+)\/storage\/v1\/object\/public\/(.+)$/);
  if (publicMatch) {
    const [, origin, objectPath] = publicMatch;
    const [path] = objectPath.split("?");
    return {
      url: `${origin}/storage/v1/render/image/public/${path}?width=1200&height=630&resize=cover&quality=80`,
      width: 1200,
      height: 630,
      type: "image/jpeg",
    };
  }

  // External image: we cannot know or control its aspect ratio, so declare no
  // dimensions and let the crawler measure it instead of publishing a wrong
  // size (a mismatched width/height makes WhatsApp drop the image entirely).
  const ext = (src.split("?")[0].split(".").pop() || "").toLowerCase();
  const type =
    ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : undefined;
  return { url: src, type };
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
  // verify=1 → preview verification tool: render the same tags but do not
  // record an analytics open, so tests never pollute share stats.
  const verifyMode = url.searchParams.get("verify") === "1";
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
    if (verifyMode) throw new Error("skip-tracking");
    await supabase.from("merchandise_share_opens").insert({
      catalog_id: itemId,
      item_name: item?.item_name ?? null,
      is_bot: isBot,
      user_agent: userAgent.slice(0, 500),
      referrer: (req.headers.get("referer") ?? "").slice(0, 500) || null,
      source: source ? source.slice(0, 50) : null,
    });
  } catch (e) {
    if (!verifyMode) console.error("share open tracking failed", e);
  }

  if (!item) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${SITE_URL}/merchandise`, ...corsHeaders },
    });
  }

  const images: string[] = Array.isArray(item.image_urls)
    ? item.image_urls.filter((u) => typeof u === "string" && u.trim())
    : [];
  const name = clamp(item.item_name || "Welile Merchandise", 70);
  const priceText = formatUGX(Number(item.unit_price));

  const picked = normalizeImage(images[0] || item.image_url || "");
  const image = picked.url;

  // Fallback chain so the card is never blank: item title → generic label,
  // item description → generated sentence. Lengths are clamped to what
  // WhatsApp/Facebook actually display before truncating mid-word.
  const title = clamp(`${name} — ${priceText} | Welile Merchandise`, 90);
  const description = clamp(
    item.description ||
      `${name} available on Welile Merchandise for ${priceText}. Pay from your Welile wallet.`,
    200,
  );

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
${picked.width ? `  <meta property="og:image:width" content="${picked.width}" />\n  <meta property="og:image:height" content="${picked.height}" />\n` : ""}${picked.type ? `  <meta property="og:image:type" content="${picked.type}" />\n` : ""}  <meta property="og:image:alt" content="${esc(name)}" />
  <meta property="og:site_name" content="Welile" />
  <meta property="og:locale" content="en_UG" />
  <meta property="product:price:amount" content="${esc(String(Number(item.unit_price) || 0))}" />
  <meta property="product:price:currency" content="UGX" />

  <meta name="twitter:card" content="${picked.width ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta name="twitter:image:alt" content="${esc(name)}" />

  <link rel="canonical" href="${esc(target)}" />
  <meta http-equiv="refresh" content="0;url=${esc(target)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(target)}">${esc(name)}</a>...</p>
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
