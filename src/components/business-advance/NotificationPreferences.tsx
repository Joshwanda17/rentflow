import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, Mail, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Compact notification-preferences card letting a tenant toggle SMS and/or
 * email alerts for Business Advance status changes. Persists to
 * `profiles.business_advance_notify_sms` / `business_advance_notify_email`
 * which the `notify-business-advance-status` edge function reads before
 * dispatching each channel.
 */
export function BusinessAdvanceNotificationPreferences({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(true);
  const [emailAddr, setEmailAddr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [saving, setSaving] = useState<'sms' | 'email' | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('business_advance_notify_sms, business_advance_notify_email, email, phone')
        .eq('id', userId)
        .maybeSingle();
      if (!alive) return;
      if (!error && data) {
        setSms(data.business_advance_notify_sms !== false);
        setEmail(data.business_advance_notify_email !== false);
        setEmailAddr((data as any).email ?? null);
        setPhone((data as any).phone ?? null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]);

  const update = async (field: 'sms' | 'email', value: boolean) => {
    const col = field === 'sms' ? 'business_advance_notify_sms' : 'business_advance_notify_email';
    setSaving(field);
    // optimistic
    if (field === 'sms') setSms(value); else setEmail(value);
    const { error } = await supabase.from('profiles').update({ [col]: value }).eq('id', userId);
    setSaving(null);
    if (error) {
      toast.error('Could not save preference', {
        description: `We couldn't update your ${field === 'sms' ? 'SMS' : 'email'} alert setting. Please try again.`,
      });
      if (field === 'sms') setSms(!value); else setEmail(!value);
    } else {
      const channelLabel = field === 'sms' ? 'SMS alerts' : 'Email alerts';
      const destination = field === 'sms' ? phone : emailAddr;
      toast.success(value ? `${channelLabel} turned on` : `${channelLabel} turned off`, {
        description: value
          ? `We'll notify you${destination ? ` at ${destination}` : ''} when your Business Advance moves between stages.`
          : `You won't receive ${field === 'sms' ? 'SMS' : 'email'} updates for Business Advance stage changes.`,
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading preferences…
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <Bell className="h-3.5 w-3.5 text-primary" /> Notification preferences
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Choose how we alert you when your Business Advance moves between stages.
      </p>

      <div className="flex items-center justify-between gap-3 pt-1">
        <Label htmlFor="ba-notify-sms" className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            SMS
            {phone && <span className="block text-[10px] text-muted-foreground font-normal">{phone}</span>}
          </span>
        </Label>
        <Switch
          id="ba-notify-sms"
          checked={sms}
          disabled={saving === 'sms'}
          onCheckedChange={(v) => update('sms', v)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="ba-notify-email" className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            Email
            {emailAddr
              ? <span className="block text-[10px] text-muted-foreground font-normal">{emailAddr}</span>
              : <span className="block text-[10px] text-amber-600 font-normal">Add an email in your profile to enable</span>}
          </span>
        </Label>
        <Switch
          id="ba-notify-email"
          checked={email}
          disabled={saving === 'email' || !emailAddr}
          onCheckedChange={(v) => update('email', v)}
        />
      </div>
    </div>
  );
}

export default BusinessAdvanceNotificationPreferences;