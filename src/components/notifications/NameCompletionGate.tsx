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
import { Loader2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { validateFullName } from "@/lib/authValidation";

const SNOOZE_KEY = "welile:name-completion:snoozed-until";
// Shorter snooze than the phone gate — we really do need a real name so payouts,
// receipts and legal documents don't ship with "jd" or "hshseh" on them.
const SNOOZE_MS = 6 * 60 * 60 * 1000;

export default function NameCompletionGate() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user?.id) return;
      const snoozed = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      if (snoozed && Date.now() < snoozed) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || error) return;
      const currentName = String(data?.full_name ?? "").trim();
      const check = validateFullName(currentName);
      if (!check.valid) {
        // Pre-fill any usable first token so the user isn't retyping.
        const parts = currentName.split(/\s+/).filter(Boolean);
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
        setReason(check.error || "Please add your full legal name.");
        setOpen(true);
      }
      setChecked(true);
    }
    void check();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleSave = async () => {
    const combined = `${firstName.trim()} ${lastName.trim()}`.trim();
    const check = validateFullName(combined);
    if (!check.valid) {
      toast.error(check.error || "Enter your real first and last name");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: check.trimmed })
        .eq("id", user!.id);
      if (error) throw error;
      toast.success("Name updated — thank you");
      localStorage.removeItem(SNOOZE_KEY);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setOpen(false);
  };

  if (!checked && !open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) snooze(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UserCircle2 className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Complete your profile name</DialogTitle>
          <DialogDescription className="text-center">
            {reason} Your real first and last name appears on receipts,
            payouts and legal documents, so please enter it exactly as on
            your national ID.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ncg-first">First name</Label>
            <Input
              id="ncg-first"
              autoComplete="given-name"
              autoCapitalize="words"
              placeholder="e.g. Alice"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ncg-last">Last name (surname)</Label>
            <Input
              id="ncg-last"
              autoComplete="family-name"
              autoCapitalize="words"
              placeholder="e.g. Namono"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={snooze} disabled={saving}>
              Not now
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save my full name"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}