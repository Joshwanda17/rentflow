/**
 * Welile share proxy (Cloudflare Worker).
 *
 * Purpose: let shared links read as
 *   https://s.welileapp.com/m/<code>   (merchandise)
 *   https://s.welileapp.com/s/<code>   (rent plans)
 * while WhatsApp still receives the Open Graph tags (and item/photo) produced
 * by the upstream edge functions.
 *
 * It must PROXY, never redirect: a 301/302 makes WhatsApp display the final
 * upstream URL in the preview card, which is the problem we are solving.
 *
 * Deploy (one time, outside this repo):
 *   1. Create the Worker (dashboard or `npx wrangler deploy worker.js`).
 *   2. Add a route for  s.welileapp.com/*  to this Worker.
 *   3. Add a CNAME for  s  ->  the Worker/Cloudflare host, proxied (orange cloud).
 *   4. Set the UPSTREAM constants below if the project ref ever changes.
 */
const MERCH_UPSTREAM = "https://wirntoujqoyjobfhyelc.supabase.co/functions/v1/og-merchandise";
const PLAN_UPSTREAM = "https://wirntoujqoyjobfhyelc.supabase.co/functions/v1/og-plan";
const SITE = "https://welileapp.com";

function isCode(s) {
  return /^[A-Za-z0-9_-]{4,32}$/.test(s);
}

async function proxyUpstream(request, upstreamUrl, fallbackPath) {
  const url = new URL(request.url);
  const target = new URL(upstreamUrl);
  for (const [k, v] of url.searchParams) {
    target.searchParams.set(k, v.slice(0, 200));
  }

  const upstream = await fetch(target.toString(), {
    method: "GET",
    headers: {
      "user-agent": request.headers.get("user-agent") || "",
      referer: request.headers.get("referer") || "",
      accept: request.headers.get("accept") || "*/*",
    },
    // Follow the function's own redirect for human visitors so they land
    // on the app page; crawlers get the OG HTML directly (200).
    redirect: "manual",
  });

  // Humans: the function answers 302 to the app page. Pass that through.
  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: upstream.headers.get("location") || `${SITE}${fallbackPath}`,
        "cache-control": "no-store",
      },
    });
  }

  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "text/html; charset=utf-8");
  headers.set("cache-control", upstream.headers.get("cache-control") || "public, max-age=300");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // /m/<code>  ->  og-merchandise?code=<code>
    if (parts.length === 2 && parts[0] === "m" && isCode(parts[1])) {
      const upstream = new URL(MERCH_UPSTREAM);
      upstream.searchParams.set("code", parts[1].toLowerCase());
      const src = url.searchParams.get("src");
      if (src) upstream.searchParams.set("src", src.slice(0, 50));
      return proxyUpstream(request, upstream.toString(), "/merchandise");
    }

    // /s/<code>  ->  og-plan/<code>  (rent-plan share links)
    if (parts.length === 2 && parts[0] === "s" && isCode(parts[1])) {
      const upstream = `${PLAN_UPSTREAM}/${parts[1]}`;
      return proxyUpstream(request, upstream, "/funder-onboarding");
    }

    // Anything else on the share host goes to the app.
    return Response.redirect(`${SITE}${url.pathname}${url.search}`, 302);
  },
};