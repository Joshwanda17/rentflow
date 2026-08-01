import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { buildSignupLinks } from "../links";
import { enforceRateLimit } from "../rateLimit";

// PUBLIC, no-auth tool. Returns an INDICATIVE rent-access ballpark so a
// prospective tenant can get a real number inside a chat before signing up,
// then hands back the tenant signup link. It never quotes a personal/approved
// figure — the actual Rent Plan is set by Welile's canonical formula (DB
// trigger) after the user creates an account and completes verification.
//
// Formula mirrors mem/business-model/rent-formula.md (single source of truth):
//   accessFee    = round(rent * (1.33^(days/30) - 1))   // 33% monthly compound
//   requestFee   = rent <= 200,000 ? 10,000 : 20,000
//   totalRepay   = rent + accessFee + requestFee
//   dailyRepay   = ceil(totalRepay / days)
// Reimplemented inline (not imported) to keep this public bundle self-contained.

const MONTHLY_RATE = 0.33;
const DEFAULT_DURATIONS = [30, 60, 90] as const;

// Illustrative agent commission share of the finance charge. Mirrors the
// Agent Incentive Model (10% one-time rent commission). Shown ONLY to make the
// breakdown transparent — it is carved out of the access fee, never added on
// top, so the canonical total (rent + accessFee + requestFee) is unchanged.
const AGENT_COMMISSION_RATE = 0.10;

// Guard rails for a compliance-safe, sensible ballpark (UGX).
const MIN_RENT = 10_000;
const MAX_RENT = 5_000_000;
const MIN_DAYS = 7;
const MAX_DAYS = 120;

function computeRentPlan(rent: number, days: number) {
  const accessFee = Math.round(rent * (Math.pow(1 + MONTHLY_RATE, days / 30) - 1));
  const requestFee = rent <= 200_000 ? 10_000 : 20_000;
  const totalRepayment = rent + accessFee + requestFee;
  const dailyRepayment = Math.ceil(totalRepayment / days);

  // Illustrative line-item breakdown of the total repayment.
  //   principalRent   — the rent amount Welile pays your landlord upfront
  //   agentCommission — carved out of the access fee (10% of rent, capped)
  //   accessFeeNet    — remaining finance/access charge (33% monthly compound)
  //   serviceFee      — the flat request/service fee
  // principalRent + accessFeeNet + agentCommission + serviceFee == totalRepayment
  const agentCommission = Math.min(Math.round(rent * AGENT_COMMISSION_RATE), accessFee);
  const accessFeeNet = accessFee - agentCommission;
  const serviceFee = requestFee;

  return {
    durationDays: days,
    principalRent: rent,
    accessFee,
    accessFeeNet,
    agentCommission,
    serviceFee,
    requestFee,
    totalRepayment,
    dailyRepayment,
  };
}

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-US")}`;

export default defineTool({
  name: "estimate_rent_access",
  title: "Estimate rent access (indicative)",
  description:
    "Give a prospective tenant an INDICATIVE rent-access ballpark in UGX — total repayment and daily payment for a given monthly rent — then return the free tenant signup link. No sign-in required. Amounts are illustrative only, not an approval or guarantee; the actual Rent Plan is set after signup and verification. Provide `rent` (monthly rent in UGX). Optionally provide `duration_days` (7-120) for one plan, otherwise 30/60/90-day options are returned. Optional `referral_code` adds a referral signup link.",
  inputSchema: {
    rent: z
      .number()
      .describe("Monthly rent in UGX (e.g. 200000). Ballpark only."),
    duration_days: z
      .number()
      .describe("Optional Rent Plan length in days (7-120). Omit to compare 30/60/90-day options.")
      .optional(),
    referral_code: z
      .string()
      .describe("Optional referral code (the referrer's Welile user id) to build a referral signup link.")
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ rent, duration_days, referral_code }) => {
    const limited = await enforceRateLimit("estimate_rent_access");
    if (limited) return limited;

    const { signupUrl, referralUrl, landingUrl } = buildSignupLinks({
      referralCode: referral_code,
      role: "tenant",
    });
    const linkText = referralUrl
      ? `Start here (guided onboarding): ${landingUrl}\nCreate a free tenant account: ${signupUrl}\nReferral signup link: ${referralUrl}`
      : `Start here (guided onboarding): ${landingUrl}\nCreate a free tenant account: ${signupUrl}`;

    // Validate rent.
    if (!Number.isFinite(rent) || rent < MIN_RENT || rent > MAX_RENT) {
      const text =
        `Please share a monthly rent between ${ugx(MIN_RENT)} and ${ugx(MAX_RENT)} for an indicative estimate.\n\n${linkText}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          error: "invalid_rent",
          min_rent: MIN_RENT,
          max_rent: MAX_RENT,
          landing_url: landingUrl,
          signup_url: signupUrl,
          referral_url: referralUrl,
          currency: "UGX",
        },
      };
    }

    const roundedRent = Math.round(rent);

    // Choose durations.
    let durations: number[];
    if (duration_days != null) {
      const d = Math.round(duration_days);
      if (!Number.isFinite(d) || d < MIN_DAYS || d > MAX_DAYS) {
        const text =
          `Rent Plan length must be between ${MIN_DAYS} and ${MAX_DAYS} days. Try 30, 60, or 90 days.\n\n${linkText}`;
        return {
          content: [{ type: "text", text }],
          structuredContent: {
            error: "invalid_duration",
            min_days: MIN_DAYS,
            max_days: MAX_DAYS,
            landing_url: landingUrl,
            signup_url: signupUrl,
            referral_url: referralUrl,
            currency: "UGX",
          },
        };
      }
      durations = [d];
    } else {
      durations = [...DEFAULT_DURATIONS];
    }

    const plans = durations.map((d) => computeRentPlan(roundedRent, d));

    const planBlocks = plans
      .map((p) =>
        [
          `${p.durationDays}-day plan — total ~${ugx(p.totalRepayment)} (about ${ugx(p.dailyRepayment)}/day)`,
          `    • Rent paid to landlord: ${ugx(p.principalRent)}`,
          `    • Access fee (financing): ${ugx(p.accessFeeNet)}`,
          `    • Agent commission: ${ugx(p.agentCommission)}`,
          `    • Service fee: ${ugx(p.serviceFee)}`,
        ].join("\n"),
      )
      .join("\n\n");

    const text = [
      `Indicative Rent Plan for a monthly rent of ${ugx(roundedRent)} (UGX):`,
      "",
      planBlocks,
      "",
      "Line items are illustrative only — the fee split (service vs access vs agent commission) is shown for transparency and does not change the total. This is not an approval or guarantee. Your actual Rent Plan is confirmed after you create a free account and complete verification (national ID and residence).",
      "",
      linkText,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: {
        rent: roundedRent,
        indicative: true,
        monthly_rate_pct: MONTHLY_RATE * 100,
        plans: plans.map((p) => ({
          duration_days: p.durationDays,
          daily_repayment: p.dailyRepayment,
          total_repayment: p.totalRepayment,
          access_fee: p.accessFee,
          request_fee: p.requestFee,
          breakdown: {
            principal_rent: p.principalRent,
            access_fee: p.accessFeeNet,
            agent_commission: p.agentCommission,
            service_fee: p.serviceFee,
            total: p.totalRepayment,
          },
        })),
        breakdown_note:
          "Line items are illustrative only; the service/access/agent-commission split is for transparency and does not change the total.",
        role: "tenant",
        landing_url: landingUrl,
        signup_url: signupUrl,
        referral_url: referralUrl,
        currency: "UGX",
      },
    };
  },
});