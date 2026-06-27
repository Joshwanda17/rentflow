import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EntityDetailSheet } from '@/components/executive/EntityDetailSheet';
import { Loader2, UserRound, MessageSquare, Mail, CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react';

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

export function StandingOrderProfileSheet({ open, onClose, scheduledPayoutId, targetUserId, recipientName, createdAt, schedule, amount }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifs, setNotifs] = useState<NotifStatus[]>([]);

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
          <p className="text-xs text-muted-foreground">No delivery records yet.</p>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </EntityDetailSheet>
  );
}

export default StandingOrderProfileSheet;
