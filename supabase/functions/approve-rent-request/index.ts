import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logSystemEvent } from "../_shared/eventLogger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AGENT_APPROVAL_BONUS = 5000;

// --- SMS Helper (Africa's Talking) ---
function formatPhoneInternational(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

function isUgandanPhone(phone: string): boolean {
  const formatted = formatPhoneInternational(phone);
  return formatted.startsWith("+256") && formatted.length >= 13;
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.log("[approve-rent-request] Missing AT credentials, skipping SMS");
    return false;
  }
  if (!isUgandanPhone(phone)) {
    console.log(`[approve-rent-request] Non-UG phone ${phone}, skipping SMS`);
    return false;
  }

  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const formattedPhone = formatPhoneInternational(phone);
  try {
    const body = new URLSearchParams({ username, to: formattedPhone, message });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", apiKey, Accept: "application/json" },
      body: body.toString(),
    });
    const data = await res.json();
    const recipients = data?.SMSMessageData?.Recipients || [];
    const success = recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
    console.log(`[approve-rent-request] SMS to ${formattedPhone}: ${success ? "sent" : "failed"}`);
    return success;
  } catch (err) {
    console.error("[approve-rent-request] SMS error:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', details: claimsError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const approverId = claimsData.user.id;
    const { rent_request_id, action, approval_comment } = await req.json();
    const requestAction = action || 'approve';

    console.log(`User ${approverId} ${requestAction} rent request ${rent_request_id}`);

    if (!rent_request_id) {
      return new Response(JSON.stringify({ error: 'Invalid request parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check roles
    const { data: userRoles } = await adminClient.from('user_roles').select('role').eq('user_id', approverId);
    const roles = userRoles?.map(r => r.role) || [];
    const isManager = roles.includes('manager');
    const isAgent = roles.includes('agent');

    if (!isManager && !isAgent) {
      return new Response(JSON.stringify({ error: 'Only managers and agents can approve/reject requests' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get rent request
    const { data: rentRequest, error: requestError } = await adminClient
      .from('rent_requests').select('*').eq('id', rent_request_id).single();

    if (requestError || !rentRequest) {
      return new Response(JSON.stringify({ error: 'Rent request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (rentRequest.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Request is not pending' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch tenant profile (needed for SMS + notifications)
    const { data: tenantProfile } = await adminClient
      .from('profiles').select('full_name, phone').eq('id', rentRequest.tenant_id).single();

    const tenantName = tenantProfile?.full_name || 'Tenant';
    const tenantPhone = tenantProfile?.phone || '';

    // Fetch agent profile if exists
    let agentName = '';
    let agentPhone = '';
    if (rentRequest.agent_id) {
      const { data: agentProfile } = await adminClient
        .from('profiles').select('full_name, phone').eq('id', rentRequest.agent_id).single();
      agentName = agentProfile?.full_name || 'Agent';
      agentPhone = agentProfile?.phone || '';
    }

    if (requestAction === 'approve') {
      const now = new Date().toISOString();

      // Update rent request
      const { error: updateError } = await adminClient
        .from('rent_requests')
        .update({
          status: 'approved', approved_by: approverId, approved_at: now,
          approval_comment: approval_comment || null, funded_at: now, schedule_status: 'active',
        })
        .eq('id', rent_request_id);

      if (updateError) throw updateError;

      // === AUTO-CREATE SUBSCRIPTION CHARGE ===
      const totalRepayment = Number(rentRequest.total_repayment);
      const durationDays = Number(rentRequest.duration_days);
      const dailyRepayment = Number(rentRequest.daily_repayment);

      if (totalRepayment > 0 && durationDays > 0) {
        let frequency = "daily";
        let chargeAmount = dailyRepayment > 0 ? dailyRepayment : Math.ceil(totalRepayment / durationDays);
        let totalCharges = durationDays;

        if (durationDays <= 30 && dailyRepayment > 0) {
          frequency = "daily";
          chargeAmount = Math.round(dailyRepayment);
          totalCharges = durationDays;
        } else if (durationDays <= 21) {
          frequency = "weekly";
          totalCharges = Math.ceil(durationDays / 7);
          chargeAmount = Math.round(totalRepayment / totalCharges);
        } else if (durationDays > 30) {
          frequency = "daily";
          chargeAmount = Math.round(dailyRepayment > 0 ? dailyRepayment : totalRepayment / durationDays);
          totalCharges = durationDays;
        }

        const startDate = new Date();
        const nextChargeDate = new Date(startDate);
        if (frequency === "daily") nextChargeDate.setDate(nextChargeDate.getDate() + 1);
        else if (frequency === "weekly") nextChargeDate.setDate(nextChargeDate.getDate() + 7);
        else nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);

        const { error: subError } = await adminClient.from("subscription_charges").insert({
          tenant_id: rentRequest.tenant_id,
          rent_request_id: rent_request_id,
          agent_id: rentRequest.agent_id || null,
          service_type: "rent_facilitation",
          charge_amount: chargeAmount,
          frequency,
          next_charge_date: nextChargeDate.toISOString().split("T")[0],
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          total_charges_due: totalRepayment,
          charges_remaining: totalCharges,
          status: "active",
          charge_agent_wallet: rentRequest.tenant_no_smartphone === true,
        });

        if (subError) {
          console.error("Error creating subscription charge:", subError.message);
        } else {
          console.log(`Created subscription: ${frequency} @ UGX ${chargeAmount} for ${totalCharges} charges`);

          await adminClient.from("notifications").insert({
            user_id: rentRequest.tenant_id,
            title: "📅 Repayment Schedule Active",
            message: `Your wallet will be auto-charged UGX ${chargeAmount.toLocaleString()} ${frequency} starting ${nextChargeDate.toLocaleDateString()}. Total: UGX ${totalRepayment.toLocaleString()} over ${totalCharges} payments.`,
            type: "info",
            metadata: { rent_request_id, frequency, charge_amount: chargeAmount, total_charges: totalCharges },
          });
        }
      }

      // NOTE: Tenant obligation is tracked via rent_receivable_created in the bridge scope
      // when the rent is funded/disbursed. No direct ledger insert needed here.

      // === PAY AGENT BONUS ===
      if (rentRequest.agent_id && isManager) {
        // Ensure agent wallet exists (trigger handles balance updates)
        await adminClient
          .from('wallets')
          .upsert({ user_id: rentRequest.agent_id, balance: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });

        await adminClient.from('agent_earnings').insert({
          agent_id: rentRequest.agent_id, amount: AGENT_APPROVAL_BONUS,
          earning_type: 'approval_bonus', source_user_id: rentRequest.tenant_id,
          rent_request_id: rent_request_id, description: `UGX 5,000 bonus for approved tenant registration`,
        });

        // Credit event bonus to commission accrual ledger (this inserts ledger entry, trigger updates wallet)
        await adminClient.rpc('credit_agent_event_bonus', {
          p_agent_id: rentRequest.agent_id,
          p_tenant_id: rentRequest.tenant_id,
          p_event_type: 'rent_request_posted',
          p_source_id: rent_request_id,
        }).then(({ error: bonusErr }) => {
          if (bonusErr) console.error('[approve-rent-request] Event bonus ledger error:', bonusErr.message);
          else console.log('[approve-rent-request] rent_request_posted bonus credited to ledger');
        });

        // Agent bonus notification
        await adminClient.from('notifications').insert({
          user_id: rentRequest.agent_id,
          title: 'Approval Bonus Received!',
          message: `You earned UGX ${AGENT_APPROVAL_BONUS.toLocaleString()} for ${tenantName}'s approved rent request.`,
          type: 'earning',
          metadata: { amount: AGENT_APPROVAL_BONUS, type: 'approval_bonus' },
        });

        console.log(`Agent ${rentRequest.agent_id} received UGX ${AGENT_APPROVAL_BONUS} bonus`);
      }

      // === IN-APP NOTIFICATIONS ===
      // Tenant approval notification
      await adminClient.from('notifications').insert({
        user_id: rentRequest.tenant_id,
        title: 'Rent Request Approved!',
        message: `Your rent request for UGX ${rentRequest.rent_amount.toLocaleString()} has been approved. Auto-deductions will begin shortly.${approval_comment ? ` Note: ${approval_comment}` : ''}`,
        type: 'success',
      });

      // Agent approval notification (separate from bonus)
      if (rentRequest.agent_id) {
        await adminClient.from('notifications').insert({
          user_id: rentRequest.agent_id,
          title: '✅ Rent Approved',
          message: `${tenantName}'s rent request for UGX ${rentRequest.rent_amount.toLocaleString()} has been approved and funded.`,
          type: 'success',
          metadata: { rent_request_id, tenant_id: rentRequest.tenant_id },
        });
      }

      // === SMS NOTIFICATIONS (fire-and-forget) ===
      const smsPromises: Promise<boolean>[] = [];

      // Tenant SMS
      if (tenantPhone) {
        const dailyAmt = dailyRepayment > 0 ? dailyRepayment : Math.ceil(totalRepayment / durationDays);
        const tenantMsg = `WELILE: Your rent of UGX ${Number(rentRequest.rent_amount).toLocaleString()} has been approved and will be paid to your landlord. Repayment of UGX ${dailyAmt.toLocaleString()}/day starts tomorrow. Ref: ${rent_request_id.slice(0, 8)}`;
        smsPromises.push(sendSMS(tenantPhone, tenantMsg));
      }

      // Agent SMS
      if (rentRequest.agent_id && agentPhone) {
        const agentMsg = `WELILE: Rent request for ${tenantName} (UGX ${Number(rentRequest.rent_amount).toLocaleString()}) has been approved.${isManager ? ` You earned UGX ${AGENT_APPROVAL_BONUS.toLocaleString()} bonus.` : ''}`;
        smsPromises.push(sendSMS(agentPhone, agentMsg));
      }

      // Don't await — fire and forget
      Promise.all(smsPromises).catch(e => console.error("SMS batch error:", e));

      // Log system event
      logSystemEvent(adminClient, 'rent_request_approved', approverId, 'rent_requests', rent_request_id, { rent_amount: rentRequest.rent_amount, tenant_id: rentRequest.tenant_id });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Rent request approved with auto-charge subscription created',
          agent_bonus_paid: rentRequest.agent_id && isManager ? AGENT_APPROVAL_BONUS : 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (requestAction === 'reject') {
      const { error: rejectError } = await adminClient
        .from('rent_requests').update({ status: 'rejected' }).eq('id', rent_request_id);

      if (rejectError) throw rejectError;

      // Tenant in-app notification
      await adminClient.from('notifications').insert({
        user_id: rentRequest.tenant_id,
        title: 'Rent Request Rejected',
        message: `Your rent request for UGX ${rentRequest.rent_amount.toLocaleString()} was not approved.`,
        type: 'info',
      });

      // Agent in-app notification
      if (rentRequest.agent_id) {
        await adminClient.from('notifications').insert({
          user_id: rentRequest.agent_id,
          title: '❌ Rent Request Rejected',
          message: `${tenantName}'s rent request for UGX ${rentRequest.rent_amount.toLocaleString()} was not approved.`,
          type: 'info',
          metadata: { rent_request_id, tenant_id: rentRequest.tenant_id },
        });
      }

      // Tenant SMS on rejection (fire-and-forget)
      if (tenantPhone) {
        const rejectMsg = `WELILE: Your rent request for UGX ${Number(rentRequest.rent_amount).toLocaleString()} was not approved. Contact your agent for details.`;
        sendSMS(tenantPhone, rejectMsg).catch(e => console.error("Rejection SMS error:", e));
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Rent request rejected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Notify managers (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ title: "🏠 Rent Request Processed", body: "Activity: rent request", url: "/manager" }),
    }).catch(() => {});


    return new Response(JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Unexpected error:', errorMessage);
    return new Response(JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
