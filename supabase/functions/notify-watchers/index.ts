import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WatcherNotification {
  rent_request_id: string;
  rent_amount: number;
  tenant_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { rent_request_id, rent_amount, tenant_name } = await req.json() as WatcherNotification;

    if (!rent_request_id) {
      throw new Error("rent_request_id is required");
    }

    // Get all watchers for this opportunity
    const { data: watchers, error: watchersError } = await supabase
      .from("watched_opportunities")
      .select("user_id")
      .eq("rent_request_id", rent_request_id);

    if (watchersError) {
      throw watchersError;
    }

    if (!watchers || watchers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No watchers to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatUGX = (amount: number) => {
      return new Intl.NumberFormat("en-UG", {
        style: "currency",
        currency: "UGX",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    const title = "✅ Opportunity Ready!";
    const body = `A rent request you're watching (${formatUGX(rent_amount)}) is now fully verified and ready to fund!`;

    let successCount = 0;
    let failureCount = 0;

    // Send push notification to each watcher using the existing edge function
    for (const watcher of watchers) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: watcher.user_id,
            title,
            body,
            url: "/dashboard",
            tag: `watch-${rent_request_id}`,
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          const errorText = await response.text();
          console.error(`Push failed for user ${watcher.user_id}: ${errorText}`);
          failureCount++;
        }
      } catch (err) {
        console.error("Error sending push:", err);
        failureCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        watchersCount: watchers.length,
        successCount,
        failureCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-watchers:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
