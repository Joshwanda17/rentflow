import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EntityDetailSheet } from '@/components/executive/EntityDetailSheet';
import { Loader2, UserRound, MessageSquare, Mail, CheckCircle2, XCircle, MinusCircle, Clock, RotateCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ProfileData {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  verified: boolean | null;
  primary_persona: string | null;
  occupation: string | null;
  district: string | null;
  city: string | null;
  town: string | null;
  village: string | null;
  created_at: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  scheduledPayoutId: string | null;
  targetUserId: string | null;
  recipientName: string | null;
  createdAt: string | null;
  schedule: string | null;
  amount: number | null;
}

interface NotifStatus {
  channel: 'sms' | 'email';
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error: string | null;
  last_sent_at: string | null;
}

interface NotifAttempt {
  channel: 'sms' | 'email';
  attempt_number: number;
  outcome: 'success' | 'transient_failure' | 'permanent_failure' | 'skipped';
  error: string | null;
  attempted_at: string;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_META: Record<NotifStatus['status'], { icon: typeof CheckCircle2; cls: string; label: string }> = {
  sent: { icon: CheckCircle2, cls: 'text-emerald-600', label: 'Delivered' },
  failed: { icon: XCircle, cls: 'text-destructive', label: 'Failed' },
  skipped: { icon: MinusCircle, cls: 'text-muted-foreground', label: 'Skipped' },
  pending: { icon: Clock, cls: 'text-amber-600', label: 'Pending' },
};

const OUTCOME_META: Record<NotifAttempt['outcome'], { icon: typeof CheckCircle2; cls: string; label: string }> = {
  success: { icon: CheckCircle2, cls: 'text-emerald-600', label: 'Sent' },
  transient_failure: { icon: RotateCw, cls: 'text-amber-600', label: 'Retrying' },
  permanent_failure: { icon: XCircle, cls: 'text-destructive', label: 'Failed' },
  skipped: { icon: MinusCircle, cls: 'text-muted-foreground', label: 'Skipped' },
};

export function StandingOrderProfileSheet({ open, onClose, scheduledPayoutId, targetUserId, recipientName, createdAt, schedule, amount }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifs, setNotifs] = useState<NotifStatus[]>([]);
  const [attempts, setAttempts] = useState<NotifAttempt[]>([]);
  const [resending, setResending] = useState<'sms' | 'email' | null>(null);

  const refreshDelivery = () => {
    if (!scheduledPayoutId) return;
    supabase
      .from('standing_order_setup_notifications')
      .select('channel, status, attempts, last_error, last_sent_at')
      .eq('scheduled_payout_id', scheduledPayoutId)
      .then(({ data }) => setNotifs((data ?? []) as NotifStatus[]));
    supabase
      .from('standing_order_notification_attempts')
      .select('channel, attempt_number, outcome, error, attempted_at')
      .eq('scheduled_payout_id', scheduledPayoutId)
      .order('channel', { ascending: true })
      .order('attempt_number', { ascending: true })
      .then(({ data }) => setAttempts((data ?? []) as NotifAttempt[]));
  };

  const handleResend = async (channel: 'sms' | 'email') => {
    if (!targetUserId || amount == null) return;
    setResending(channel);
    try {
      const { data, error } = await supabase.functions.invoke('notify-standing-order-setup', {
        body: {
          target_user_id: targetUserId,
          scheduled_payout_id: scheduledPayoutId,
          amount,
          schedule,
          channel,
        },
      });
      if (error) throw error;
      const ok = channel === 'sms' ? data?.sms_sent : data?.email_sent;
      if (ok) {
        toast.success(`${channel === 'sms' ? 'SMS' : 'Email'} resent successfully`);
      } else {
        toast.error(`${channel === 'sms' ? 'SMS' : 'Email'} could not be delivered — check the timeline`);
      }
      refreshDelivery();
    } catch (e) {
      toast.error(`Failed to resend ${channel}: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setResending(null);
    }
  };

  useEffect(() => {
    if (!open || !targetUserId) { setProfile(null); return; }
    let active = true;
    setLoading(true);
    supabase
      .from('profiles')
      .select('full_name, phone, email, verified, primary_persona, occupation, district, city, town, village, created_at')
      .eq('id', targetUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) { setProfile(data as ProfileData | null); setLoading(false); }
      });
    return () => { active = false; };
  }, [open, targetUserId]);

  useEffect(() => {
    if (!open || !scheduledPayoutId) { setNotifs([]); return; }
    let active = true;
    supabase
      .from('standing_order_setup_notifications')
      .select('channel, status, attempts, last_error, last_sent_at')
      .eq('scheduled_payout_id', scheduledPayoutId)
      .then(({ data }) => {
        if (active) setNotifs((data ?? []) as NotifStatus[]);
      });
    return () => { active = false; };
  }, [open, scheduledPayoutId]);

  useEffect(() => {
    if (!open || !scheduledPayoutId) { setAttempts([]); return; }
    let active = true;
    supabase
      .from('standing_order_notification_attempts')
      .select('channel, attempt_number, outcome, error, attempted_at')
      .eq('scheduled_payout_id', scheduledPayoutId)
      .order('channel', { ascending: true })
      .order('attempt_number', { ascending: true })
      .then(({ data }) => {
        if (active) setAttempts((data ?? []) as NotifAttempt[]);
      });
    return () => { active = false; };
  }, [open, scheduledPayoutId]);

  const location = profile
    ? [profile.village, profile.town, profile.city, profile.district].filter(Boolean).join(', ')
    : '';

  const fields = [
    { label: 'Order created', value: fmt(createdAt) },
    { label: 'Schedule', value: schedule || '—' },
    { label: 'Amount', value: amount != null ? `UGX ${Number(amount).toLocaleString()}` : '—' },
    { label: 'Phone', value: profile?.phone || '—' },
    { label: 'Email', value: profile?.email || '—' },
    { label: 'Role', value: profile?.primary_persona || '—' },
    { label: 'Occupation', value: profile?.occupation || '—' },
    { label: 'Location', value: location || '—' },
    { label: 'Verified', value: profile?.verified ? 'Yes' : 'No' },
    { label: 'Member since', value: fmt(profile?.created_at ?? null) },
  ];

  return (
    <EntityDetailSheet
      open={open}
      onClose={onClose}
      title={recipientName || profile?.full_name || 'Standing order recipient'}
      subtitle="Standing order & profile details"
      icon={<UserRound className="h-4 w-4 text-primary" />}
      fields={fields}
    >
      {loading && (
        <div className="flex items-center justify-center py-3 text-muted-foreground text-xs gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      )}
      <div className="mt-3 border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Setup notification delivery</p>
        {notifs.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No delivery records yet.</p>
            <div className="flex gap-2">
              {(['sms', 'email'] as const).map((ch) => (
                <Button
                  key={ch}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={resending !== null}
                  onClick={() => handleResend(ch)}
                >
                  {resending === ch ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send {ch}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => {
              const meta = STATUS_META[n.status];
              const StatusIcon = meta.icon;
              const ChannelIcon = n.channel === 'sms' ? MessageSquare : Mail;
              return (
                <div key={n.channel} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium capitalize">
                      <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {n.channel}
                    </span>
                    <span className={`flex items-center gap-1 font-semibold ${meta.cls}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                    <span>Attempts: {n.attempts}</span>
                    {n.last_sent_at && <span>Sent: {fmt(n.last_sent_at)}</span>}
                  </div>
                  {n.last_error && (
                    <p className="mt-1 text-destructive break-words">{n.last_error}</p>
                  )}
                  <div className="mt-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={resending !== null}
                      onClick={() => handleResend(n.channel)}
                    >
                      {resending === n.channel ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Resend {n.channel}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Delivery attempt timeline</p>
        {attempts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attempt history yet.</p>
        ) : (
          (['sms', 'email'] as const).map((ch) => {
            const chAttempts = attempts.filter((a) => a.channel === ch);
            if (chAttempts.length === 0) return null;
            const ChannelIcon = ch === 'sms' ? MessageSquare : Mail;
            return (
              <div key={ch} className="mb-3 last:mb-0">
                <p className="flex items-center gap-1.5 text-xs font-medium capitalize mb-1.5">
                  <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {ch}
                </p>
                <ol className="relative border-l border-border ml-1 pl-3 space-y-2">
                  {chAttempts.map((a) => {
                    const meta = OUTCOME_META[a.outcome];
                    const Icon = meta.icon;
                    return (
                      <li key={`${a.channel}-${a.attempt_number}`} className="relative">
                        <span className={`absolute -left-[17px] top-0.5 h-3 w-3 rounded-full bg-background border-2 ${meta.cls.replace('text-', 'border-')}`} />
                        <div className="flex items-start gap-1.5 text-xs">
                          <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta.cls}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">
                              Attempt {a.attempt_number} · <span className={meta.cls}>{meta.label}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">{fmt(a.attempted_at)}</p>
                            {a.error && <p className="mt-0.5 text-destructive break-words">{a.error}</p>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })
        )}
      </div>
    </EntityDetailSheet>
  );
}

export default StandingOrderProfileSheet;
