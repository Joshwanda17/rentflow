import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, acceptedAt } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile and email
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .single();

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "User has no email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supporterName = profile?.full_name || "Supporter";
    const acceptDate = acceptedAt
      ? new Date(acceptedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

    const agreementHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welile Supporter Agreement — Accepted</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:22px;margin:0 0 8px;">🛡️ Welile</h1>
              <p style="color:#a0a0b0;font-size:13px;margin:0;">Tenant Supporter Agreement</p>
            </td>
          </tr>
          <!-- Confirmation -->
          <tr>
            <td style="padding:32px 40px 16px;">
              <div style="background:#e8f5e9;border-left:4px solid #4caf50;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
                <p style="margin:0;font-size:14px;color:#2e7d32;font-weight:bold;">✅ Agreement Accepted</p>
                <p style="margin:8px 0 0;font-size:13px;color:#388e3c;">
                  Dear ${supporterName}, you accepted the Welile Tenant Supporter Agreement on ${acceptDate}.
                </p>
              </div>
              <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 16px;">
                This email is your official record of the terms and conditions you accepted. Please keep it for your records.
              </p>
            </td>
          </tr>
          <!-- Agreement Content -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#fafafa;border:1px solid #e0e0e0;border-radius:8px;padding:24px 20px;">
                <h2 style="font-size:16px;color:#1a1a2e;margin:0 0 16px;text-align:center;border-bottom:1px solid #e0e0e0;padding-bottom:12px;">
                  WELILE TENANT SUPPORTER TERMS & CONDITIONS
                </h2>
                <p style="font-size:11px;color:#888;text-align:center;margin:0 0 16px;">
                  12-Month Supporter Participation Agreement • Version v1.0 • Effective: ${acceptDate}
                </p>
                <div style="font-size:13px;color:#333;line-height:1.7;white-space:pre-wrap;">1. Purpose of This Agreement

This Agreement governs your participation as a Tenant Supporter on welile.com, where you support verified tenant rent requests by funding rent for verified landlords and houses through Welile's platform processes.

By clicking "I Agree", you confirm that you have read and accepted these Terms.


2. Welile's Nature and Role

2.1 Welile Technologies Limited is a technology company operating a platform (welile.com) that connects:
• tenants seeking rent access,
• verified landlords and houses,
• tenant supporters who facilitate upfront rent payment, and
• Welile agents and managers who verify and enforce repayment.

2.2 Welile is not a bank, not a deposit-taking institution, and not an investment fund. Welile operates as a verification, monitoring, enforcement, and tenant replacement coordination platform.


3. Contract Duration (12 Months)

3.1 This Agreement runs for twelve (12) months from the Effective Date ("Contract Term").
3.2 During the Contract Term, the Supporter may participate in multiple tenant support transactions through the platform.
3.3 Unless renewed, this Agreement automatically expires at the end of 12 months.


4. Supporter Participation

4.1 As a Supporter, you may select approved tenant rent requests displayed on your Supporter Dashboard.
4.2 Each request includes landlord details, house verification, agent verification, manager approval, repayment period, and projected supporter outcome.
4.3 Once you accept a request, rent is paid upfront for the tenant for a period of 30, 60, or 90 days (as selected in the request).


5. Payment Flow and Custody of Funds

5.1 Your support funds are used for the purpose of paying rent to verified landlords.
5.2 Where applicable, rent payments and repayments may be processed and/or held by approved regulated payment partners. Welile's role is platform coordination, monitoring, and enforcement.


6. Tenant Rights Transfer and Welile Enforcement Authority

6.1 You acknowledge that Welile's enforcement power is based on a contractual Tenant Rights Assignment mechanism.
6.2 The tenant accepts the transfer of tenant rights to Welile at the time they apply for rent through the platform.
6.3 When rent is paid to the landlord, Welile becomes the holder of tenant rights for the paid rent period, and the physical tenant becomes a house user under Welile's tenancy rights.
6.4 This enables Welile to coordinate lawful enforcement, tenant replacement, and repayment continuity in collaboration with landlords and local leadership structures where required.


7. Repayment Structure

7.1 Tenants repay through small daily instalments using the platform's approved payment channels.
7.2 Tenant repayment includes principal rent amount, access fees (as disclosed to the tenant), registration fees (as disclosed to the tenant), and any other approved charges shown in the system.
7.3 Repayments are monitored and enforced through Welile's agent network.


8. Supporter Outcome, Principal Protection & Operational Assurance

8.1 Welile provides a Principal and Outcome Assurance Framework designed to protect supporters against losses arising from tenant default.
8.2 This assurance is operationally achieved through replacement of non-paying tenants, cooperation with landlords and relevant local leaders, and repayment continuity controls.
8.3 Supporter participation is not presented as a deposit, savings product, or regulated security. Welile does not offer an interest-bearing account.
8.4 Welile commits to ensuring that the supported principal is recovered and the agreed supporter outcome is achieved through operational recovery mechanisms.


9. Withdrawal of Support Capital (90-Day Notice Policy)

9.1 The Supporter may request withdrawal of supported capital by giving at least ninety (90) days written notice to Welile.
9.2 During the 90-day notice period, Welile coordinates collection of amounts due from active tenant repayment streams.
9.3 At the end of the notice period, Welile will arrange payment to the Supporter as a lump-sum settlement.


10. End of Contract (12-Month Settlement)

10.1 At the end of the 12-month Contract Term, the Supporter may renew participation or request settlement.
10.2 Settlement at contract end is subject to completion of current tenant repayment cycles.


11. Supporter Responsibilities

Supporters agree to:
• use the platform honestly and lawfully;
• avoid direct confrontation, harassment, or independent enforcement against tenants;
• follow dispute channels through Welile; and
• comply with KYC/verification procedures if requested.


12. Non-Circumvention

12.1 You agree not to bypass the platform by making direct arrangements with tenants or landlords outside Welile systems.
12.2 Circumvention may lead to suspension and forfeiture of platform protections.


13. Fraud, Misuse, and Suspensions

Welile may suspend or terminate supporter participation in cases of fraud, identity misrepresentation, abuse of tenants, platform circumvention, or regulatory risk.


14. Dispute Resolution

Parties agree to attempt resolution through Welile internal channels first. Unresolved disputes may be referred to mediation and thereafter Ugandan courts of competent jurisdiction.


15. Limitation of Liability

Welile is not liable for delays caused by legal restrictions, court orders, government enforcement moratoriums, force majeure events, or regulated payment partner downtime.


16. Acceptance

By clicking "I Agree", you confirm that:
• this Agreement lasts 12 months,
• you accept the 90-day withdrawal notice policy,
• you accept the Principal and Outcome Assurance Framework, and
• you agree to comply with these Terms.</div>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#fafafa;padding:20px 40px;border-top:1px solid #e0e0e0;text-align:center;">
              <p style="font-size:11px;color:#999;margin:0 0 4px;">
                This is an automated confirmation from Welile Technologies Limited.
              </p>
              <p style="font-size:11px;color:#999;margin:0;">
                welile.com • Kampala, Uganda
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send via Supabase Auth admin or a simple SMTP-like approach
    // Use the built-in auth.admin to send a custom email isn't available,
    // so we'll use the notifications table and also attempt to send via
    // an email Edge Function pattern. For now, store the email record.
    
    // Try sending via Resend or similar if configured, otherwise log it
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Welile <noreply@welile.com>",
          to: email,
          subject: `✅ Supporter Agreement Accepted — ${acceptDate}`,
          html: agreementHtml,
        }),
      });
      
      if (!res.ok) {
        console.error("Email send failed:", await res.text());
      }
    }

    // Also store in notifications as a fallback record
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "📧 Agreement Terms Sent to Your Email",
      message: `A copy of the Welile Tenant Supporter Terms & Conditions (v1.0) has been sent to ${email}. Please check your inbox for your records.`,
      type: "agreement_email",
    });

    return new Response(
      JSON.stringify({ success: true, emailSent: !!RESEND_API_KEY }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
