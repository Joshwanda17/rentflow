import { Inngest } from "npm:inngest@3";
import { serve } from "npm:inngest@3/deno";

const inngest = new Inngest({ id: "welile-app" });

const sendPaymentSMS = inngest.createFunction(
  {
    id: "send-payment-sms",
    retries: 3,
  },
  { event: "app/payment.sms.requested" },
  async ({ event }) => {
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
    } = event.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Call the existing send-collection-sms edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/send-collection-sms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_name,
        tenant_phone,
        agent_name,
        agent_phone,
        amount,
        payment_mode,
        tracking_id,
        date,
        collection_id,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`send-collection-sms failed [${response.status}]: ${body}`);
    }

    const result = await response.json();
    console.log("[inngest/send-payment-sms] Result:", JSON.stringify(result));
    return result;
  }
);

export default serve({ client: inngest, functions: [sendPaymentSMS] });
