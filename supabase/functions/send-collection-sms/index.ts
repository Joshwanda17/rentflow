import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatPhoneInternational(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("256")) return `+${digits}`;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.length === 9) return `+256${digits}`;
  return `+${digits}`;
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME");
  if (!apiKey || !username) {
    console.error("[send-collection-sms] Missing AT credentials");
    return false;
  }

  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const formattedPhone = formatPhoneInternational(phone);

  try {
    const params: Record<string, string> = {
      username,
      to: formattedPhone,
      message,
    };
    // NOTE: 'from' / sender ID removed — "WELILE" is not yet approved on Africa's Talking.
    // Re-enable once the sender ID is approved on the AT dashboard.
    const body = new URLSearchParams(params);

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
        Accept: "application/json",
      },
      body: body.toString(),
    });

    const rawText = await res.text();
    console.log(`[send-collection-sms] AT raw response for ${formattedPhone} (status ${res.status}):`, rawText);
    
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error(`[send-collection-sms] Non-JSON response from AT: ${rawText}`);
      return false;
    }
    const recipients = data?.SMSMessageData?.Recipients || [];
    const success = recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
    console.log(`[send-collection-sms] SMS to ${formattedPhone}: ${success ? "sent" : "failed"} (status: ${res.status}, recipients: ${JSON.stringify(recipients)})`);
    return success;
  } catch (err) {
    console.error("[send-collection-sms] Error:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      tenant_name,
      tenant_phone,
      agent_name,
      agent_phone,
      amount,
      payment_mode,
      tracking_id,
      date,
      collection_id,
    } = await req.json();

    if (!tenant_phone || !agent_phone || !amount || !tracking_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formattedAmount = `UGX ${Number(amount).toLocaleString()}`;
    const modeLabel = payment_mode === "mobile_money" ? "Mobile Money" : payment_mode === "cash" ? "Cash" : "Agent Wallet";

    const message = [
      "WELILE Payment Confirmation",
      `Tenant: ${tenant_name || "N/A"}`,
      `Amount: ${formattedAmount}`,
      `Mode: ${modeLabel}`,
      `Agent: ${agent_name || "N/A"}`,
      `Date: ${date || new Date().toLocaleDateString()}`,
      `Ref: ${tracking_id}`,
      "Thank you for using WELILE.",
    ].join("\n");

    // Send SMS to both tenant and agent in parallel
    const [tenantSent, agentSent] = await Promise.all([
      sendSMS(tenant_phone, message),
      sendSMS(agent_phone, message),
    ]);

    // Update sms_sent flags on agent_collections
    if (collection_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("agent_collections")
        .update({
          sms_sent_tenant: tenantSent,
          sms_sent_agent: agentSent,
        })
        .eq("id", collection_id);
    }

    return new Response(
      JSON.stringify({ success: true, tenant_sms: tenantSent, agent_sms: agentSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-collection-sms] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
