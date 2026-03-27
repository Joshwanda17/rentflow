import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SITE_URL = "https://welilereceipts.com";

function formatUGX(amount: number): string {
  return `UGX ${amount.toLocaleString("en-UG")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const houseId = url.searchParams.get("id");

  if (!houseId) {
    return new Response("Missing house id", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: house } = await supabase
    .from("house_listings")
    .select("title, region, district, daily_rate, monthly_rent, image_urls, house_category, number_of_rooms")
    .eq("id", houseId)
    .single();

  if (!house) {
    // Redirect to homepage if house not found
    return new Response(null, {
      status: 302,
      headers: { Location: SITE_URL, ...corsHeaders },
    });
  }

  const title = `${house.title} — ${formatUGX(house.daily_rate)}/day | Welile`;
  const description = `${house.house_category?.replace(/_/g, " ")} • ${house.number_of_rooms} rooms in ${house.region}${house.district ? `, ${house.district}` : ""}. ${formatUGX(house.daily_rate)}/day. Pay as you stay with Welile!`;
  const image = house.image_urls?.[0] || `${SITE_URL}/og-image.png`;
  const houseUrl = `${SITE_URL}/house/${houseId}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${houseUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="Welile" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />

  <!-- Redirect to the actual app page -->
  <meta http-equiv="refresh" content="0;url=${houseUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${houseUrl}">${title}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...corsHeaders,
    },
  });
});
