import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Briefcase, ArrowRight, Shield, Lock, UserPlus, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import BusinessAdvanceStatusTracker, { AdvanceStatusRow } from '@/components/business-advance/BusinessAdvanceStatusTracker';
import { useBusinessAdvanceRealtime } from '@/hooks/useBusinessAdvanceRealtime';
import { BusinessAdvanceAuditLog } from '@/components/business-advance/BusinessAdvanceAuditLog';

export default function BusinessAdvanceTrack() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const phone = (params.get('phone') || '').replace(/\s/g, '');

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<AdvanceStatusRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  // Inline onboarding form state — applicant sets a password to claim the
  // account the agent provisioned for them and is auto-signed-in.
  const [claiming, setClaiming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountReady, setAccountReady] = useState(false);

  const aliveRef = useRef(true);
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (aliveRef.current) setIsAuthed(!!user);
    if (!phone) {
      if (aliveRef.current) { setError('Missing phone number in the link'); setLoading(false); }
      return;
    }
    const { data, error } = await supabase.rpc('get_business_advance_public_status', { p_phone: phone });
    if (!aliveRef.current) return;
    if (error) {
      setError(error.message);
    } else if (!data || (Array.isArray(data) && data.length === 0)) {
      setError('No Business Advance request found for this number yet.');
    } else {
      const r = Array.isArray(data) ? data[0] : data;
      setRow(r as AdvanceStatusRow);
      setError(null);
    }
    setLoading(false);
  }, [phone]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  // Shared realtime — covers INSERT (request just created) and UPDATE
  // (stage advanced) so the public tracker mirrors the tenant dashboard hero.
  useBusinessAdvanceRealtime(
    phone ? `public-track-${phone}` : null,
    () => { load(); }
  );

  const handleClaim = async () => {
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirmPassword) return toast.error('Passwords do not match');
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke('claim-business-advance-account', {
        body: { phone, password, full_name: fullName.trim() || undefined },
      });
      if (error) throw error;
      const email = (data as any)?.email;
      if (!email) throw new Error('Could not provision account');
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;
      setIsAuthed(true);
      setAccountReady(true);
      toast.success('Account ready — welcome aboard!');
      setTimeout(() => navigate('/dashboard/tenant'), 900);
    } catch (e: any) {
      toast.error(e?.message || 'Could not set up account');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 to-background p-4">
      <div className="max-w-md mx-auto space-y-4 pt-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center gap-2 text-primary">
            <Briefcase className="h-5 w-5" />
            <h1 className="text-xl font-bold">Your Business Advance</h1>
          </div>
          <p className="text-xs text-muted-foreground">Live approval progress — updates automatically</p>
        </div>

        {loading ? (
          <Card><CardContent className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <Shield className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
            </CardContent>
          </Card>
        ) : row ? (
          <>
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="p-5">
                <BusinessAdvanceStatusTracker row={row} />
                <div className="mt-3">
                  <BusinessAdvanceAuditLog advanceId={row.id} phone={phone} />
                </div>
              </CardContent>
            </Card>

            {isAuthed || accountReady ? (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 space-y-2 text-center">
                  {accountReady && <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />}
                  <p className="text-sm font-semibold">Manage everything from your dashboard</p>
                  <p className="text-xs text-muted-foreground">
                    View payments, make repayments, and unlock more credit.
                  </p>
                  <Button className="w-full gap-2" onClick={() => navigate('/dashboard/tenant')}>
                    Open my dashboard <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/30 shadow-md">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-sm">Set up your account</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your agent has already pre-registered you using <strong>{phone}</strong>. Just choose a password to access your dashboard, track approval, and manage repayments.
                  </p>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Your full name (optional)</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Sarah Nakato" autoComplete="name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" />Choose a password</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confirm password</Label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
                  </div>

                  <Button className="w-full h-11 gap-2" onClick={handleClaim} disabled={claiming}>
                    {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Activate my account
                  </Button>

                  <button
                    type="button"
                    className="w-full text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => navigate(`/auth?phone=${encodeURIComponent(phone)}`)}
                  >
                    I already have an account — sign in instead
                  </button>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
