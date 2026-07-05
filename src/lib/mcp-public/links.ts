// Shared signup/referral link builder for the PUBLIC (no-auth) MCP tools.
// Every link carries `signup_source=chatgpt` so connector-driven signups are
// attributed (see profiles.signup_source), and an optional role so a guided
// prompt like "check my rent access" pre-selects the tenant signup path.

const SIGNUP_BASE = "https://welilereceipts.com/auth";

// Roles the Auth page accepts via the `role` query param (pre-selects signup).
export const SIGNUP_ROLES = ["tenant", "agent", "landlord", "supporter"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

// Strict RFC-4122 UUID (referral codes are the referrer's user id).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildSignupLinks(opts?: {
  referralCode?: string;
  role?: SignupRole;
  source?: string;
}) {
  const source = (opts?.source ?? "chatgpt").trim() || "chatgpt";
  const params = new URLSearchParams({ signup: "1", signup_source: source });
  if (opts?.role && SIGNUP_ROLES.includes(opts.role)) params.set("role", opts.role);

  const signupUrl = `${SIGNUP_BASE}?${params.toString()}`;

  let referralUrl: string | null = null;
  const ref = (opts?.referralCode ?? "").trim();
  if (ref && UUID_RE.test(ref)) {
    const refParams = new URLSearchParams(params);
    refParams.set("ref", ref.toLowerCase());
    referralUrl = `${SIGNUP_BASE}?${refParams.toString()}`;
  }

  return { signupUrl, referralUrl };
}
