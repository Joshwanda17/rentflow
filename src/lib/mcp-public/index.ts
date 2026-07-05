import { defineMcp } from "@lovable.dev/mcp-js";
import howWelileWorks from "./tools/how-welile-works";

// PUBLIC, no-auth MCP server — an acquisition surface for prospective users.
// No `auth` is configured, so anyone (e.g. a ChatGPT connector shared with a
// new user) can call it without signing in. It exposes only non-sensitive,
// informational tools and returns signup/referral links.
export default defineMcp({
  name: "welile-public-mcp",
  title: "Welile Receipts — Get Started",
  version: "0.1.0",
  instructions:
    "Public information about Welile Receipts for prospective users. Use `how_welile_works` to explain the platform (tenants, agents, landlords, Supporters) and return a free signup link — no account required. All amounts are in UGX.",
  tools: [howWelileWorks],
});