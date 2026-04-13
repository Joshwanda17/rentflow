import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

function errorResponse(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth — verify COO role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return errorResponse("Unauthorized", 401);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: allowedRoles } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", user.id)
      .in("role", ["coo", "operations", "manager", "super_admin", "cfo", "cto"]);
    if (!allowedRoles || allowedRoles.length === 0) return errorResponse("Only COO, Operations, or authorized staff can import partners", 403);

    // Parse body
    const { partners } = await req.json() as {
      partners: {
        partner_name: string;
        phone: string;
        email: string | null;
        portfolios: {
          amount: number;
          roiPercentage: number;
          durationMonths: number;
          roiMode: string;
          contributionDate?: string | null;
        }[];
      }[];
    };

    if (!partners || !Array.isArray(partners) || partners.length === 0) {
      return errorResponse("No partners provided", 400);
    }
    if (partners.length > 200) {
      return errorResponse("Maximum 200 partners per import", 400);
    }

    let partnersCreated = 0;
    let portfoliosCreated = 0;
    let skippedDuplicates = 0;
    const errors: { partner: string; error: string }[] = [];

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = () => String(Math.floor(1000 + Math.random() * 9000));

    for (const partner of partners) {
      try {
        // Validate
        if (!partner.partner_name?.trim()) {
          errors.push({ partner: partner.phone || 'Unknown', error: 'Missing name' });
          continue;
        }
        // Phone is optional — validate only if provided
        const hasPhone = partner.phone?.trim() && partner.phone.trim().length >= 10;

        // Check for existing profile by phone (only if phone provided)
        let existing: { id: string } | null = null;
        if (hasPhone) {
          const { data: found } = await adminClient
            .from("profiles").select("id")
            .eq("phone", partner.phone).maybeSingle();
          existing = found;
        }

        let userId: string;

        if (existing) {
          // Existing user — add portfolios to their account instead of skipping
          userId = existing.id;

          // Ensure they have the supporter role
          const { data: existingRole } = await adminClient
            .from("user_roles").select("id")
            .eq("user_id", userId).eq("role", "supporter").maybeSingle();
          if (!existingRole) {
            await adminClient.from("user_roles").insert({ user_id: userId, role: "supporter" });
          }

          // Reset password to the standard default
          const tempPwd = `Welile1234!`;
          await adminClient.auth.admin.updateUserById(userId, { password: tempPwd });

          // If a real email was provided and user has a placeholder email, update it
          if (partner.email && !partner.email.includes('@noapp.welile') && !partner.email.includes('@welile.user')) {
            await adminClient.auth.admin.updateUserById(userId, {
              email: partner.email,
              email_confirm: true,
            });
          }
        } else {
          // Create auth user with standard default password
          const tempPassword = `Welile1234!`;
          // Generate email: use real email > phone-based > random UUID placeholder
          const emailAddr = partner.email && !partner.email.includes('@noapp.welile') && !partner.email.includes('@welile.user')
            ? partner.email
            : hasPhone
              ? `${partner.phone.replace(/^0/, '')}@noapp.welile.user`
              : `${crypto.randomUUID().slice(0, 12)}@noapp.welile.user`;

          const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
            email: emailAddr,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: partner.partner_name, phone: partner.phone, intended_role: 'supporter' },
          });

          if (authErr || !authData.user) {
            errors.push({ partner: partner.partner_name, error: authErr?.message || 'Auth creation failed' });
            continue;
          }

          userId = authData.user.id;

          // Create profile with phone
          const profileData: Record<string, any> = {
            id: userId,
            full_name: partner.partner_name.trim(),
          };
          if (hasPhone) profileData.phone = partner.phone;
          await adminClient.from("profiles").upsert(profileData);

          // Assign supporter role
          await adminClient.from("user_roles").insert({
            user_id: userId,
            role: "supporter",
          });

          // Create wallet
          await adminClient.from("wallets").upsert({
            user_id: userId,
            balance: 0,
          }, { onConflict: 'user_id' });

          partnersCreated++;
        }

        // Create portfolios (with duplicate detection)
        for (const pf of partner.portfolios) {
          try {
            if (pf.amount < 50000 || pf.roiPercentage < 1 || pf.durationMonths < 1) {
              errors.push({ partner: partner.partner_name, error: `Invalid portfolio data: ${pf.amount}` });
              continue;
            }

            // Check for existing portfolio with same amount, ROI, and duration for this user
            const { data: existingPortfolio } = await adminClient
              .from("investor_portfolios")
              .select("id")
              .eq("investor_id", userId)
              .eq("investment_amount", pf.amount)
              .eq("roi_percentage", pf.roiPercentage)
              .eq("duration_months", pf.durationMonths)
              .maybeSingle();

            if (existingPortfolio) {
              skippedDuplicates++;
              continue;
            }

            // Use contribution date as the start date if provided, otherwise use now
            const startDate = pf.contributionDate ? new Date(pf.contributionDate) : now;
            const isHistorical = pf.contributionDate && !isNaN(startDate.getTime());
            const effectiveStart = isHistorical ? startDate : now;

            const startYY = String(effectiveStart.getFullYear()).slice(-2);
            const startMM = String(effectiveStart.getMonth() + 1).padStart(2, "0");
            const startDD = String(effectiveStart.getDate()).padStart(2, "0");

            const portfolioCode = `WIP${startYY}${startMM}${startDD}${seq()}`;
            const portfolioPin = String(Math.floor(1000 + Math.random() * 9000));
            const activationToken = crypto.randomUUID();

            const maturityDate = new Date(effectiveStart);
            maturityDate.setMonth(maturityDate.getMonth() + pf.durationMonths);

            // First payout: 30 days from start date
            const firstPayoutMs = effectiveStart.getTime() + 30 * 24 * 60 * 60 * 1000;
            const firstPayout = new Date(firstPayoutMs);
            const nextRoiDate = `${firstPayout.getFullYear()}-${String(firstPayout.getMonth() + 1).padStart(2, "0")}-${String(firstPayout.getDate()).padStart(2, "0")}`;

            const insertData: Record<string, any> = {
              investor_id: userId,
              agent_id: userId, // Self-linked for imports (no agent)
              portfolio_code: portfolioCode,
              portfolio_pin: portfolioPin,
              activation_token: activationToken,
              investment_amount: pf.amount,
              roi_percentage: pf.roiPercentage,
              duration_months: pf.durationMonths,
              roi_mode: pf.roiMode,
              payout_day: null, // 30-day default cycle
              maturity_date: maturityDate.toISOString().split("T")[0],
              next_roi_date: nextRoiDate,
              status: "pending_approval",
            };

            // If historical date, set created_at to match
            if (isHistorical) {
              insertData.created_at = effectiveStart.toISOString();
            }

            const { error: portfolioErr } = await adminClient.from("investor_portfolios").insert(insertData);

            if (portfolioErr) {
              errors.push({ partner: partner.partner_name, error: `Portfolio: ${portfolioErr.message}` });
              continue;
            }

            portfoliosCreated++;
          } catch (pfErr: any) {
            errors.push({ partner: partner.partner_name, error: `Portfolio error: ${pfErr.message}` });
          }
        }

        // Audit log
        await adminClient.from("audit_logs").insert({
          user_id: user.id,
          action_type: "partner_import",
          table_name: "profiles",
          record_id: userId,
          metadata: {
            partner_name: partner.partner_name,
            phone: partner.phone,
            portfolio_count: partner.portfolios.length,
            imported_by: user.id,
          },
        });

      } catch (partnerErr: any) {
        errors.push({ partner: partner.partner_name || partner.phone, error: partnerErr.message });
      }
    }

    console.log(`[import-partners] COO ${user.id} imported: ${partnersCreated} partners, ${portfoliosCreated} portfolios, ${skippedDuplicates} skipped`);

    return new Response(JSON.stringify({
      partnersCreated,
      portfoliosCreated,
      skippedDuplicates,
      errors,
    }), { status: 200, headers: JSON_HEADERS });

  } catch (err: any) {
    console.error("[import-partners] Error:", err.message);
    return errorResponse(err.message || "Internal error", 500);
  }
});
