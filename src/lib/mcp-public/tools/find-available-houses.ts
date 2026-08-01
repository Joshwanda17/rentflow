import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { buildSignupLinks } from "../links";
import { enforceRateLimit } from "../rateLimit";

// PUBLIC, no-auth tool. Returns a small, read-only sample of AVAILABLE house
// listings by district/area for prospective tenants, then hands back the free
// tenant signup link so they can view details and apply. It reads with the
// anon key, so Row-Level Security ("Anyone can view available listings")
// guarantees only listings with status = 'available' are ever returned. Only
// non-sensitive fields are exposed — no exact address, GPS, landlord, caretaker
// phone, or LC1 details. All amounts are in UGX.

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

// Read env without referencing `process`/`Deno` directly: the bundle runs on
// Deno (env via Deno.env), but this file is also type-checked in the Vite build
// where those globals aren't declared. globalThis access avoids both a
// ReferenceError at runtime and a type error at build time.
function readEnv(name: string): string | undefined {
  const g = globalThis as unknown as {
    Deno?: { env?: { get(k: string): string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  return g.Deno?.env?.get(name) ?? g.process?.env?.[name];
}

// Anon Supabase client. Created inside the handler so this module stays
// import-safe (no env reads at import time — required by the MCP bundler).
function anonClient() {
  const url = readEnv("SUPABASE_URL");
  const anonKey =
    readEnv("SUPABASE_PUBLISHABLE_KEY") ?? readEnv("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Supabase env not configured");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ugx = (n: number | null) =>
  n == null ? "UGX —" : `UGX ${Math.round(n).toLocaleString("en-US")}`;

type ListingRow = {
  id: string;
  title: string | null;
  house_category: string | null;
  number_of_rooms: number | null;
  monthly_rent: number | null;
  region: string | null;
  district: string | null;
  sub_county: string | null;
  village: string | null;
  has_water: boolean | null;
  has_electricity: boolean | null;
  has_security: boolean | null;
  has_parking: boolean | null;
  is_furnished: boolean | null;
  verified: boolean | null;
  image_urls: string[] | null;
};

function amenityList(r: ListingRow): string[] {
  const out: string[] = [];
  if (r.has_water) out.push("water");
  if (r.has_electricity) out.push("electricity");
  if (r.has_security) out.push("security");
  if (r.has_parking) out.push("parking");
  if (r.is_furnished) out.push("furnished");
  return out;
}

function locationLabel(r: ListingRow): string {
  return [r.village, r.sub_county, r.district, r.region].filter(Boolean).join(", ") || "Location on request";
}

export default defineTool({
  name: "find_available_houses",
  title: "Find available houses",
  description:
    "Return a small read-only sample of AVAILABLE Welile house listings for a prospective tenant, filtered by district and/or area, then return the free tenant signup link to view details and apply. No sign-in required. Only public, non-sensitive fields are shown (no exact address, GPS, landlord, or contact details). Amounts are in UGX. Provide `district` and/or `area` to narrow the search, optional `max_rent` (UGX) and `limit` (1-10, default 5), and optional `referral_code` for a referral signup link.",
  inputSchema: {
    district: z
      .string()
      .describe("Optional district to search (e.g. 'Wakiso', 'Kampala').")
      .optional(),
    area: z
      .string()
      .describe("Optional area/neighbourhood — matches village, sub-county, district, or region.")
      .optional(),
    max_rent: z
      .number()
      .describe("Optional maximum monthly rent in UGX.")
      .optional(),
    limit: z
      .number()
      .describe("Optional number of listings to return (1-10, default 5).")
      .optional(),
    referral_code: z
      .string()
      .describe("Optional referral code (the referrer's Welile user id) to build a referral signup link.")
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ district, area, max_rent, limit, referral_code }) => {
    const limited = await enforceRateLimit("find_available_houses");
    if (limited) return limited;

    const { signupUrl, referralUrl, landingUrl } = buildSignupLinks({
      referralCode: referral_code,
      role: "tenant",
    });
    const linkText = referralUrl
      ? `Start here (guided onboarding): ${landingUrl}\nCreate a free tenant account to view details and apply: ${signupUrl}\nReferral signup link: ${referralUrl}`
      : `Start here (guided onboarding): ${landingUrl}\nCreate a free tenant account to view details and apply: ${signupUrl}`;

    const take = Math.min(MAX_LIMIT, Math.max(1, Math.round(limit ?? DEFAULT_LIMIT)));

    let query = anonClient()
      .from("house_listings")
      .select(
        "id,title,house_category,number_of_rooms,monthly_rent,region,district,sub_county,village,has_water,has_electricity,has_security,has_parking,is_furnished,verified,image_urls",
      )
      // RLS already restricts anon to status='available'; keep it explicit and
      // hide any listings flagged hidden.
      .eq("status", "available")
      .not("is_hidden", "is", true);

    const districtTerm = (district ?? "").trim();
    if (districtTerm) query = query.ilike("district", `%${districtTerm}%`);

    const areaTerm = (area ?? "").trim();
    if (areaTerm) {
      const like = `%${areaTerm}%`;
      query = query.or(
        `village.ilike.${like},sub_county.ilike.${like},district.ilike.${like},region.ilike.${like}`,
      );
    }

    if (typeof max_rent === "number" && Number.isFinite(max_rent) && max_rent > 0) {
      query = query.lte("monthly_rent", Math.round(max_rent));
    }

    query = query.order("verified", { ascending: false }).order("created_at", { ascending: false }).limit(take);

    const { data, error } = await query;

    if (error) {
      return {
        content: [
          {
            type: "text",
            text: `Sorry, I couldn't fetch listings right now. You can still browse everything after signing up.\n\n${linkText}`,
          },
        ],
        isError: true,
        structuredContent: { error: error.message, landing_url: landingUrl, signup_url: signupUrl, referral_url: referralUrl, currency: "UGX" },
      };
    }

    const rows = (data ?? []) as ListingRow[];

    if (rows.length === 0) {
      const where = districtTerm || areaTerm ? ` in "${districtTerm || areaTerm}"` : "";
      return {
        content: [
          {
            type: "text",
            text: `No available listings matched your search${where} right now. New houses are added regularly — sign up free to save a search and get matched.\n\n${linkText}`,
          },
        ],
        structuredContent: {
          count: 0,
          listings: [],
          filters: { district: districtTerm || null, area: areaTerm || null, max_rent: max_rent ?? null },
          role: "tenant",
          signup_url: signupUrl,
          landing_url: landingUrl,
          referral_url: referralUrl,
          currency: "UGX",
        },
      };
    }

    const listings = rows.map((r) => ({
      id: r.id,
      title: r.title ?? "Available house",
      category: r.house_category ?? null,
      rooms: r.number_of_rooms ?? null,
      monthly_rent: r.monthly_rent ?? null,
      location: locationLabel(r),
      district: r.district ?? null,
      amenities: amenityList(r),
      verified: !!r.verified,
      photo_count: Array.isArray(r.image_urls) ? r.image_urls.length : 0,
    }));

    const lines = listings
      .map((l) => {
        const bits = [
          `${ugx(l.monthly_rent)}/mo`,
          l.rooms ? `${l.rooms} room${l.rooms === 1 ? "" : "s"}` : null,
          l.location,
          l.amenities.length ? l.amenities.join(", ") : null,
          l.verified ? "✓ verified" : null,
        ].filter(Boolean);
        return `• ${l.title} — ${bits.join(" · ")}`;
      })
      .join("\n");

    const text = [
      `${listings.length} available house${listings.length === 1 ? "" : "s"} on Welile (UGX):`,
      "",
      lines,
      "",
      "Full details, photos, and contact happen inside the app after you create a free account.",
      "",
      linkText,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: {
        count: listings.length,
        listings,
        filters: { district: districtTerm || null, area: areaTerm || null, max_rent: max_rent ?? null },
        role: "tenant",
        signup_url: signupUrl,
        landing_url: landingUrl,
        referral_url: referralUrl,
        currency: "UGX",
      },
    };
  },
});