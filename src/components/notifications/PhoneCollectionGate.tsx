import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const SNOOZE_KEY = "welile:phone-collection:snoozed-until";

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let d = digits.startsWith("+") ? digits.slice(1) : digits;
  if (d.startsWith("0")) d = "256" + d.slice(1);
  if (d.startsWith("7") && d.length === 9) d = "256" + d;
  if (!d.startsWith("256") || d.length !== 12) return null;
  return "+" + d;
}

export default function PhoneCollectionGate() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [momoName, setMomoName] = useState("");
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user?.id || !user.email) return;
      const snoozed = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      if (snoozed && Date.now() < snoozed) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("phone, full_name, mobile_money_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || error) return;
      if (!data?.phone || data.phone.trim() === "") {
        setMomoName(data?.mobile_money_name || data?.full_name || "");
        setOpen(true);
      }
      setChecked(true);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  const handleSave = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("Enter a valid Ugandan phone number (e.g. 0772 123 456)");
      return;
    }
    const trimmedName = momoName.trim();
    if (trimmedName.length < 2) {
      toast.error("Enter the name that appears on your mobile money");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          phone: normalized,
          mobile_money_name: trimmedName,
        })
        .eq("id", user!.id);
      if (error) throw error;
      toast.success("Phone saved — you'll now get SMS updates");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const snoozeOneDay = () => {
    localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + 24 * 60 * 60 * 1000),
    );
    setOpen(false);
  };

  if (!checked && !open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) snoozeOneDay(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Phone className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Add your phone number</DialogTitle>
          <DialogDescription className="text-center">
            We use your phone to send you SMS receipts, payment alerts and
            security codes. Add it once so you never miss an update.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="pcg-phone">Phone number</Label>
            <Input
              id="pcg-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0772 123 456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pcg-momo">
              Name shown when you receive mobile money
            </Label>
            <Input
              id="pcg-momo"
              type="text"
              autoComplete="name"
              placeholder="e.g. WATSALA ENOCK"
              value={momoName}
              onChange={(e) => setMomoName(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              This is the exact name your MTN / Airtel account shows so
              payouts match correctly.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={snoozeOneDay}
              disabled={saving}
            >
              Not now
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save phone number"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}