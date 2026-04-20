import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatUGX } from "@/lib/rentCalculations";

export function LandlordPayoutSLAHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ["landlord-payout-sla-health"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("landlord_payouts")
        .select("status, amount, otp_verified_at, disbursed_at")
        .gte("otp_verified_at", since);
      const list = rows ?? [];
      const completed = list.filter((r: any) => r.status === "completed");
      const escalated = list.filter((r: any) => r.status === "escalated");
      const inFlight = list.filter((r: any) => r.status === "otp_verified" || r.status === "disbursing");

      const avgSeconds = completed.length
        ? Math.round(
            completed.reduce((acc: number, r: any) => {
              if (!r.disbursed_at || !r.otp_verified_at) return acc;
              return acc + (new Date(r.disbursed_at).getTime() - new Date(r.otp_verified_at).getTime()) / 1000;
            }, 0) / completed.length,
          )
        : 0;

      const totalDisbursed = completed.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      return {
        total: list.length,
        completed: completed.length,
        escalated: escalated.length,
        inFlight: inFlight.length,
        avgSeconds,
        totalDisbursed,
      };
    },
    refetchInterval: 30_000,
  });

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Landlord Payout SLA Health
          <Badge variant="outline" className="ml-auto text-[10px]">Last 24h</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          label="Completed"
          value={isLoading ? "…" : String(data?.completed ?? 0)}
          sub={isLoading ? "" : formatUGX(data?.totalDisbursed ?? 0)}
        />
        <Stat
          icon={<Clock className="h-3.5 w-3.5 text-primary" />}
          label="Avg time-to-pay"
          value={isLoading ? "…" : `${data?.avgSeconds ?? 0}s`}
          sub="OTP → settled"
        />
        <Stat
          icon={<Activity className="h-3.5 w-3.5 text-amber-500" />}
          label="In flight"
          value={isLoading ? "…" : String(data?.inFlight ?? 0)}
          sub="awaiting MoMo"
        />
        <Stat
          icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
          label="Escalated"
          value={isLoading ? "…" : String(data?.escalated ?? 0)}
          sub="needs Fin Ops"
        />
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
