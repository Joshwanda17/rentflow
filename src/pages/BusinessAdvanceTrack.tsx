import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Briefcase, ArrowRight, Shield, Lock, UserPlus, CheckCircle2, ChevronDown, TrendingUp, Sparkles, BadgeCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import BusinessAdvanceStatusTracker, { AdvanceStatusRow, getActiveAdvanceStage } from '@/components/business-advance/BusinessAdvanceStatusTracker';
import { useBusinessAdvanceRealtime } from '@/hooks/useBusinessAdvanceRealtime';
import { BusinessAdvanceAuditLog } from '@/components/business-advance/BusinessAdvanceAuditLog';
import { BusinessAdvanceDocumentUploadPanel } from '@/components/business-advance/DocumentUploadPanel';
import { LiveUpdatingBadge } from '@/components/business-advance/LiveUpdatingBadge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BusinessAdvanceNotificationPreferences } from '@/components/business-advance/NotificationPreferences';

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
  const [trackerOpen, setTrackerOpen] = useState(true);
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (aliveRef.current) {
      setIsAuthed(!!user);
      setAuthedUserId(user?.id ?? null);
    }
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
  const rtStatus = useBusinessAdvanceRealtime(
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
        {/* Marketing hero — modern, professional, business-owner focused */}
        <Card className="relative overflow-hidden border-primary/20 shadow-xl bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
          <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden>
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-white blur-2xl" />
          </div>
          <CardContent className="relative p-5 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider bg-white/15 backdrop-blur px-2.5 py-1 rounded-full">
              <Sparkles className="h-3 w-3" /> Rent Business Advance
            </div>
            <div>
              <p className="text-[11px] font-medium opacity-90">Access working capital up to</p>
              <p className="text-3xl font-extrabold tracking-tight leading-none mt-0.5">
                UGX 30,000,000
              </p>
              <p className="text-xs opacity-90 mt-1.5 leading-relaxed">
                Your rent history is your collateral. Turn every receipt into fuel for your business — fast, fair, and built for hardworking owners like you.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-center">
                <TrendingUp className="h-4 w-4 mx-auto mb-0.5" />
                <p className="text-[10px] font-semibold leading-tight">Grow faster</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-center">
                <BadgeCheck className="h-4 w-4 mx-auto mb-0.5" />
                <p className="text-[10px] font-semibold leading-tight">No bank queues</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-lg p-2 text-center">
                <Shield className="h-4 w-4 mx-auto mb-0.5" />
                <p className="text-[10px] font-semibold leading-tight">Trust-scored</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
              <Collapsible open={trackerOpen} onOpenChange={setTrackerOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-muted/40 transition-colors rounded-t-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Briefcase className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold leading-tight">Rent Business Advance</h2>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          Live approval progress — tap to {trackerOpen ? 'hide' : 'view'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <LiveUpdatingBadge status={rtStatus} />
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${trackerOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-5 pb-5 pt-1 border-t">
                    <BusinessAdvanceStatusTracker row={row} />
                    <div className="mt-3">
                      <BusinessAdvanceAuditLog advanceId={row.id} phone={phone} />
                    </div>
                    {authedUserId && (() => {
                      const stage = getActiveAdvanceStage(row);
                      if (!stage) return null;
                      return (
                        <div className="mt-3">
                          <BusinessAdvanceDocumentUploadPanel
                            advanceId={row.id}
                            tenantId={authedUserId}
                            stageKey={stage.key}
                            stageLabel={stage.label}
                          />
                        </div>
                      );
                    })()}
                    {authedUserId && (
                      <div className="mt-3">
                        <BusinessAdvanceNotificationPreferences userId={authedUserId} />
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
