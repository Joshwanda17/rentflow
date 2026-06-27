import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EntityDetailSheet } from '@/components/executive/EntityDetailSheet';
import { Loader2, UserRound } from 'lucide-react';

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
  targetUserId: string | null;
  recipientName: string | null;
  createdAt: string | null;
  schedule: string | null;
  amount: number | null;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function StandingOrderProfileSheet({ open, onClose, targetUserId, recipientName, createdAt, schedule, amount }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);

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
    </EntityDetailSheet>
  );
}

export default StandingOrderProfileSheet;
