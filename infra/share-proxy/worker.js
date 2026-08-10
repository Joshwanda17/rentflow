/**
 * Welile share proxy (Cloudflare Worker).
 *
 * Purpose: let shared merchandise links read as
 *   https://s.welile.tech/m/<code>
 * while WhatsApp still receives the Open Graph tags (and item photo) produced
 * by the `og-merchandise` edge function.
 *
 * It must PROXY, never redirect: a 301/302 makes WhatsApp display the final
 * upstream URL in the preview card, which is the problem we are solving.
 *
 * Deploy (one time, outside this repo):
 *   1. Create the Worker (dashboard or `npx wrangler deploy worker.js`).
 *   2. Add a route for  s.welile.tech/*  to this Worker.
 *   3. Add a CNAME for  s  ->  the Worker/Cloudflare host, proxied (orange cloud).
 *   4. Set the UPSTREAM constant below if the project ref ever changes.
 */
const UPSTREAM = "https://wirntoujqoyjobfhyelc.supabase.co/functions/v1/og-merchandise";
const SITE = "https://welile.tech";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // /m/<code>  ->  og-merchandise?code=<code>
    if (parts.length === 2 && parts[0] === "m" && /^[a-z0-9]{4,16}$/i.test(parts[1])) {
      const target = new URL(UPSTREAM);
      target.searchParams.set("code", parts[1].toLowerCase());
      const src = url.searchParams.get("src");
      if (src) target.searchParams.set("src", src.slice(0, 50));

      const upstream = await fetch(target.toString(), {
        method: "GET",
        headers: {
          "user-agent": request.headers.get("user-agent") || "",
          referer: request.headers.get("referer") || "",
          accept: request.headers.get("accept") || "*/*",
        },
        // Follow the function's own redirect for human visitors so they land
        // on the store page; crawlers get the OG HTML directly (200).
        redirect: "manual",
      });

      // Humans: the function answers 302 to the store page. Pass that through.
      if (upstream.status >= 300 && upstream.status < 400) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: upstream.headers.get("location") || `${SITE}/merchandise`,
            "cache-control": "no-store",
          },
        });
      }

      const headers = new Headers();
      headers.set("content-type", upstream.headers.get("content-type") || "text/html; charset=utf-8");
      headers.set("cache-control", upstream.headers.get("cache-control") || "public, max-age=300");
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // Anything else on the share host goes to the app.
    return Response.redirect(`${SITE}${url.pathname}${url.search}`, 302);
  },
};