import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  EVENT_BONUSES,
  COMMISSION_RATE,
  SOURCE_RATE,
  MANAGER_RATE,
  RECRUITER_RATE,
} from "@/lib/rentCalculations";

/**
 * Source-of-truth coverage test for the "How You Earn Money" page
 * (src/pages/AgentCommissionBenefits.tsx).
 *
 * Every way an agent can earn money in the backend MUST be presented on this
 * page with the correct amount/percentage. This test reads the page source and
 * asserts that each canonical earning path appears with the exact figure that
 * the backend pays.
 *
 * The recurring-commission percentages and the EVENT_BONUSES amounts are
 * imported directly from the backend constants in src/lib/rentCalculations.ts,
 * so if those rates ever change the test fails until the page is updated.
 *
 * The DB-only bonus amounts (paid by the `credit_agent_event_bonus` and
 * `credit_recruiter_override` SQL helpers, and the proxy/angel investment
 * commission) are mirrored here as documented constants — they are the
 * canonical figures and changing them on either side must be a deliberate edit.
 */

const root = resolve(__dirname, "..", "..");
const PAGE = "src/pages/AgentCommissionBenefits.tsx";
const source = readFileSync(resolve(root, PAGE), "utf8");

const ugx = (n: number) => `UGX ${n.toLocaleString("en-US")}`;
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * Canonical bonus amounts paid by `credit_agent_event_bonus(...)` /
 * `credit_recruiter_override(...)` SQL helpers (see project memory:
 * tenant-placement-bounty, recruiter-override-3000). Not present in
 * EVENT_BONUSES because they are credited entirely server-side.
 */
const DB_EVENT_BONUSES = {
  tenant_placement: 10000,
  service_centre_setup: 25000,
  recruiter_override_verification: 3000,
} as const;

/** Investment commission an agent earns on funders they bring in. */
const INVESTMENT_COMMISSION_RATE = 0.02; // proxy/partner investment
const ANGEL_POOL_COMMISSION_RATE = 0.01; // Angel Pool investment

interface EarningPath {
  /** Human label for the test description. */
  label: string;
  /** Strings that must ALL appear in the page source. */
  needles: string[];
}

const RECURRING_PATHS: EarningPath[] = [
  {
    label: "Rent repayment commission (10% total)",
    needles: [pct(COMMISSION_RATE)],
  },
  {
    label: "Registering agent share (2%)",
    needles: [pct(SOURCE_RATE)],
  },
  {
    label: "Managing agent share (8%)",
    needles: [pct(MANAGER_RATE)],
  },
  {
    label: "Recruiter override (2%)",
    needles: [pct(RECRUITER_RATE)],
  },
  {
    label: "Investment / funder commission (2%)",
    needles: [pct(INVESTMENT_COMMISSION_RATE), "2% commission"],
  },
  {
    label: "Angel Pool investment commission (1%)",
    needles: [pct(ANGEL_POOL_COMMISSION_RATE)],
  },
];

const EVENT_BONUS_PATHS: EarningPath[] = [
  { label: "Rent request posted & listed bonus", needles: [ugx(EVENT_BONUSES.rent_posted_listed)] },
  { label: "Landlord verified bonus", needles: [ugx(EVENT_BONUSES.rent_landlord_verified)] },
  { label: "Help a tenant apply for rent bonus", needles: [ugx(EVENT_BONUSES.rent_request_posted)] },
  { label: "List an empty house bonus", needles: [ugx(EVENT_BONUSES.house_listed)] },
  { label: "Replace a tenant bonus", needles: [ugx(EVENT_BONUSES.tenant_replacement)] },
  { label: "Register a new agent bonus", needles: [ugx(EVENT_BONUSES.subagent_registration)] },
  { label: "Tenant placement bounty", needles: [ugx(DB_EVENT_BONUSES.tenant_placement)] },
  { label: "Service Centre setup bonus", needles: [ugx(DB_EVENT_BONUSES.service_centre_setup)] },
  {
    label: "Sub-agent verification override bonus",
    needles: [ugx(DB_EVENT_BONUSES.recruiter_override_verification)],
  },
];

const CAREER_PATHS: EarningPath[] = [
  { label: "Cash advance access (Team Leader, 2+ sub-agents)", needles: ["Cash Advance Access", "Team Leader"] },
  { label: "Electric bike reward (50 active tenants)", needles: ["Electric Bike", "50"] },
  { label: "Invite a funder (referral)", needles: ["Invite a Funder"] },
  { label: "Collect rent from tenants (float + streaks)", needles: ["Collect Rent", "streak"] },
];

describe("How You Earn page — backend earning-rule coverage", () => {
  describe("recurring commission rates match backend constants", () => {
    for (const path of RECURRING_PATHS) {
      it(`presents ${path.label}`, () => {
        for (const needle of path.needles) {
          expect(source).toContain(needle);
        }
      });
    }

    it("commission split is internally consistent (2% + 8% = 10%)", () => {
      expect(SOURCE_RATE + MANAGER_RATE).toBeCloseTo(COMMISSION_RATE, 10);
      expect(RECRUITER_RATE + MANAGER_RATE).toBeCloseTo(COMMISSION_RATE, 10);
    });
  });

  describe("one-time event bonuses match backend amounts", () => {
    for (const path of EVENT_BONUS_PATHS) {
      it(`presents ${path.label}`, () => {
        for (const needle of path.needles) {
          expect(source).toContain(needle);
        }
      });
    }
  });

  describe("career-growth earning paths are present", () => {
    for (const path of CAREER_PATHS) {
      it(`presents ${path.label}`, () => {
        for (const needle of path.needles) {
          expect(source).toContain(needle);
        }
      });
    }
  });

  describe("WhatsApp share text mirrors the cash bonuses", () => {
    const shareNeedles = [
      ugx(EVENT_BONUSES.rent_request_posted),
      ugx(EVENT_BONUSES.house_listed),
      ugx(EVENT_BONUSES.rent_landlord_verified),
      ugx(EVENT_BONUSES.rent_posted_listed),
      ugx(EVENT_BONUSES.tenant_replacement),
      ugx(EVENT_BONUSES.subagent_registration),
      ugx(DB_EVENT_BONUSES.tenant_placement),
      ugx(DB_EVENT_BONUSES.service_centre_setup),
      ugx(DB_EVENT_BONUSES.recruiter_override_verification),
    ];
    for (const needle of shareNeedles) {
      it(`share text mentions ${needle}`, () => {
        expect(source).toContain(needle);
      });
    }
  });
});

describe("Backend earning constants snapshot (guards silent rate drift)", () => {
  it("EVENT_BONUSES match the figures the page is verified against", () => {
    expect(EVENT_BONUSES).toEqual({
      rent_posted_listed: 1000,
      rent_landlord_verified: 4000,
      rent_request_posted: 5000,
      house_listed: 5000,
      tenant_replacement: 20000,
      subagent_registration: 10000,
    });
  });

  it("commission rates match the figures the page is verified against", () => {
    expect(COMMISSION_RATE).toBe(0.1);
    expect(SOURCE_RATE).toBe(0.02);
    expect(MANAGER_RATE).toBe(0.08);
    expect(RECRUITER_RATE).toBe(0.02);
  });
});