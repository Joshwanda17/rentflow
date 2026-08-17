import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://welileapp.com";
const ROI_RATE = 15;

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;

// Escape every DB/URL-derived string before embedding it in the HTML head.
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const pretty = (s: unknown) =>
  String(s ?? "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * Open Graph wrapper for shared rent-plan links.
 *
 * WhatsApp/Facebook/X only read tags from the HTML the crawler receives, and
 * the app is a static SPA, so `/s/<code>` alone can never carry the house
 * photo. This function resolves the same trackable short code, emits the plan's
 * first house image as og:image, and forwards humans to the funder page.
 *
 * Accepts /og-plan/<code>, ?code=<code>, or ?c=<code>.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const tail = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const code = (url.searchParams.get("code") || url.searchParams.get("c") || (tail === "og-plan" ? "" : tail))
    .trim();

  if (!code || !/^[A-Za-z0-9_-]{4,32}$/.test(code)) {
    return new Response(null, { status: 302, headers: { Location: SITE_URL, ...corsHeaders } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: link } = await supabase
    .from("short_links")
    .select("code, target_path, target_params")
    .eq("code", code)
    .maybeSingle();

  const params = (link?.target_params ?? {}) as Record<string, string>;
  const planId = params.plan ?? "";
  const ref = params.ref ?? "";

  const destination = new URL(`${SITE_URL}${link?.target_path ?? "/funder-onboarding"}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) destination.searchParams.set(k, v);
  }
  const target = destination.toString();

  let plan: {
    rent_amount: number | null;
    house_category: string | null;
    request_city: string | null;
    house_image_urls: string[] | null;
  } | null = null;

  if (/^[0-9a-f-]{36}$/i.test(planId)) {
    const { data } = await supabase
      .from("rent_requests")
      .select("rent_amount, house_category, request_city, house_image_urls")
      .eq("id", planId)
      .maybeSingle();
    plan = data as typeof plan;
  }

  // Click tracking stays on the same code the /s/ route records.
  try {
    await supabase.rpc("record_short_link_click", { p_code: code });
  } catch { /* preview must never fail on analytics */ }

  const houseTitle = pretty(plan?.house_category) || "Rental Home";
  const location = plan?.request_city ? `${plan.request_city}, Uganda` : "Uganda";
  const rent = Number(plan?.rent_amount ?? 0);
  const monthly = Math.round((rent * ROI_RATE) / 100);

  const title = `Support a tenant in a ${houseTitle} in ${location}`;
  const description = rent
    ? `Support this tenant's house for ${ugx(rent)} on the platform to earn ${ugx(monthly)} per month. Support today.`
    : "Support a tenant's rent on Welile and earn monthly returns. Support today.";
  const image = plan?.house_image_urls?.find(Boolean) || `${SITE_URL}/og-image.png`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Welile" />
  <meta property="og:url" content="${esc(target)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:secure_url" content="${esc(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(`${houseTitle} in ${location}`)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta http-equiv="refresh" content="0;url=${esc(target)}" />
  <link rel="canonical" href="${esc(target)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(target)}">${esc(title)}</a>…${ref ? "" : ""}</p>
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
