import { defineMcp } from "@lovable.dev/mcp-js";
import howWelileWorks from "./tools/how-welile-works";
import exploreWelile from "./tools/explore-welile";
import estimateRentAccess from "./tools/estimate-rent-access";
import estimateSupporterReturns from "./tools/estimate-supporter-returns";
import findAvailableHouses from "./tools/find-available-houses";

// PUBLIC, no-auth MCP server — an acquisition surface for prospective users.
// No `auth` is configured, so anyone (e.g. a ChatGPT connector shared with a
// new user) can call it without signing in. It exposes only non-sensitive,
// informational tools and returns signup/referral links.
export default defineMcp({
  name: "welile-public-mcp",
  title: "Welile Receipts — Get Started",
  version: "0.1.0",
  instructions:
    "Public information about Welile Receipts for prospective users — no account required. Use `how_welile_works` for FAQs and a free signup link. Use `explore_welile` to answer read-only 'what can I do' questions and offer guided prompts such as 'Check my rent access', 'See agent commissions', 'See supporter Returns', 'Get guaranteed rent as a landlord', and 'Check my Welile Trust Score' — each returns a role-targeted signup link that turns the question into an account. Use `estimate_rent_access` when a prospective tenant gives a monthly rent (UGX) to return an indicative daily/total repayment ballpark plus the free tenant signup link — the figure is illustrative only, not an approval. Use `estimate_supporter_returns` when a prospective Supporter gives an amount (UGX) to return an illustrative Returns range (simple to compounding, at 15% monthly platform rewards) plus the free Supporter signup link — an illustration only, not a guarantee. Use `find_available_houses` to return a small read-only sample of available house listings by district/area (public, non-sensitive fields only) plus the free tenant signup link to view details and apply. Personal figures require signing in, so always offer the relevant signup link. All amounts are in UGX.",
  tools: [howWelileWorks, exploreWelile, estimateRentAccess, estimateSupporterReturns, findAvailableHouses],
});