import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
}

/**
 * Standalone panel for viewing / editing `profiles.mobile_money_name` — the
 * exact name a user's MoMo (MTN / Airtel) account shows on incoming payments.
 * Kept separate from phone editing so users can tweak it any time without
 * going through the SMS OTP verification flow.
 */
export default function MobileMoneyNameCard({ userId }: Props) {
  const [initial, setInitial] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("mobile_money_name, full_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      const current = (data?.mobile_money_name ?? "").trim();
      setInitial(current);
      setValue(current || (data?.full_name ?? ""));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const trimmed = value.trim();
  const dirty = trimmed !== initial;

  const handleSave = async () => {
    if (trimmed.length < 2) {
      toast.error("Enter the name that appears on your mobile money");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ mobile_money_name: trimmed })
        .eq("id", userId);
      if (error) throw error;
      setInitial(trimmed);
      toast.success("Mobile money name updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Mobile money name
        </CardTitle>
        <CardDescription>
          The exact name your MTN / Airtel account shows when you receive
          money. Used to match your incoming payments and payouts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mm-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Name on mobile money
          </Label>
          <Input
            id="mm-name"
            type="text"
            autoComplete="name"
            placeholder="e.g. WATSALA ENOCK"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading || saving}
            className="h-12 rounded-xl"
          />
        </div>
        <Button
          className="w-full gap-2 h-12 rounded-xl text-sm font-bold"
          onClick={handleSave}
          disabled={loading || saving || !dirty}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? "Save mobile money name" : "Saved"}
        </Button>
      </CardContent>
    </Card>
  );
}