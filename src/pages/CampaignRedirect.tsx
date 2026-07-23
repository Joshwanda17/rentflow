import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  getVisitorId,
  storeCampaignRef,
  type CampaignRef,
} from "@/lib/campaignAttribution";

type CampaignRedirectState =
  | { status: "loading" }
  | { status: "invalid"; message: string };

export default function CampaignRedirect() {
  const { slug = "", code = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<CampaignRedirectState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) {
        setState({ status: "invalid", message: "Missing campaign code." });
        return;
      }
      // Fire click record (best-effort) + resolve link metadata in parallel.
      const visitorId = getVisitorId();
      const [clickRes, resolveRes] = await Promise.all([
        supabase.functions.invoke("campaign-click", {
          body: {
            short_code: code,
            visitor_id: visitorId,
            referrer:
              typeof document !== "undefined" ? document.referrer : null,
          },
        }),
        supabase.rpc("resolve_campaign_short_code", { p_short_code: code }),
      ]);
      if (cancelled) return;

      const meta = (resolveRes.data ?? null) as {
        link_id?: string;
        campaign_id?: string;
        campaign_name?: string;
        agent_id?: string;
        location_slug?: string;
        location_display?: string;
        district?: string;
        selected_source?: string;
        status?: string;
        campaign_status?: string;
      } | null;

      if (!meta || !meta.link_id) {
        setState({
          status: "invalid",
          message:
            "This campaign link is no longer active. Please contact a Welile agent for a valid registration link.",
        });
        return;
      }
      if (meta.status !== "active" || meta.campaign_status !== "active") {
        setState({
          status: "invalid",
          message:
            "This campaign link is no longer active. Please contact a Welile agent for a valid registration link.",
        });
        return;
      }

      const ref: CampaignRef = {
        short_code: code,
        campaign_id: meta.campaign_id!,
        campaign_name: meta.campaign_name,
        agent_id: meta.agent_id!,
        location_slug: meta.location_slug ?? slug,
        location_display: meta.location_display,
        district: meta.district,
        selected_source: meta.selected_source,
        captured_at: Date.now(),
      };
      storeCampaignRef(ref);

      // Canonical slug redirect if user hand-edited the location in the URL
      if (meta.location_slug && meta.location_slug !== slug) {
        window.history.replaceState(
          {},
          "",
          `/c/${meta.location_slug}/${code}`,
        );
      }

      void clickRes; // click already recorded server-side (best effort)
      navigate(`/auth?ref=campaign`, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [code, slug, navigate]);

  if (state.status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground mb-2">
            Link unavailable
          </h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">
        Opening Welile registration…
      </div>
    </div>
  );
}