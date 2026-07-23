import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatUGX } from '@/lib/formatUGX';
import { Loader2, ShieldCheck, ShieldAlert, CheckCircle2, PenLine, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Status = 'loading' | 'auth_required' | 'wrong_account' | 'invalid' | 'ready' | 'submitting' | 'done';

interface PortfolioSnapshot {
  portfolio_code: string;
  investment_amount: number;
  roi_percentage: number;
  duration_months: number;
  roi_mode: string;
  status: string;
}

interface ProfileSnapshot {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  national_id: string | null;
  mobile_money_name: string | null;
}

/**
 * /partners/:partnerId/portfolios/:portfolioId/complete?token=…
 *
 * Mobile-first single-column page for an existing partner to complete a new
 * portfolio addendum: confirm identity fields, sign, submit. Auth-gated to
 * the invited partner only. No client-side partner search — the page reads
 * only the signed-in user's own data.
 */
export default function PortfolioCompletion() {
  const { partnerId = '', portfolioId = '' } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get('token') || '';
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [existingSig, setExistingSig] = useState<string | null>(null);

  // Form state — only edit fields that are missing
  const [nationalId, setNationalId] = useState('');
  const [mobileMoneyName, setMobileMoneyName] = useState('');
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [useExistingSig, setUseExistingSig] = useState(true);

  // ─── Load: gate access and hydrate snapshots ───
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const load = async () => {
      if (!token || !partnerId || !portfolioId) {
        setStatus('invalid');
        setErrorMsg('This invite link is missing required information.');
        return;
      }
      if (!user) {
        setStatus('auth_required');
        return;
      }
      if (user.id !== partnerId) {
        setStatus('wrong_account');
        return;
      }

      // Batched read — single round-trip.
      const [portfolioRes, profileRes, agreementRes, tokenRes] = await Promise.all([
        supabase.from('investor_portfolios')
          .select('portfolio_code, investment_amount, roi_percentage, duration_months, roi_mode, status, investor_id')
          .eq('id', portfolioId).maybeSingle(),
        supabase.from('profiles')
          .select('full_name, email, phone, national_id, mobile_money_name')
          .eq('id', user.id).maybeSingle(),
        supabase.from('partner_agreements')
          .select('partner_signature_data_url')
          .eq('user_id', user.id).limit(1).maybeSingle(),
        supabase.from('portfolio_completion_tokens')
          .select('portfolio_id, consumed_at, expires_at, email_snapshot, phone_snapshot')
          .eq('portfolio_id', portfolioId).maybeSingle(),
      ]);

      if (cancelled) return;

      if (!portfolioRes.data || portfolioRes.data.investor_id !== user.id) {
        setStatus('invalid');
        setErrorMsg('This portfolio does not belong to your account.');
        return;
      }
      if (portfolioRes.data.status !== 'awaiting_partner_details') {
        if (portfolioRes.data.status === 'pending_ops_approval') {
          setStatus('done');
          return;
        }
        setStatus('invalid');
        setErrorMsg('This portfolio has already been processed.');
        return;
      }
      if (!tokenRes.data) {
        setStatus('invalid');
        setErrorMsg('This invite link is not valid.');
        return;
      }
      if (tokenRes.data.consumed_at) {
        setStatus('invalid');
        setErrorMsg('This invite has already been completed.');
        return;
      }
      if (new Date(tokenRes.data.expires_at) < new Date()) {
        setStatus('invalid');
        setErrorMsg('This invite has expired. Please contact Welile Partner Operations for a new link.');
        return;
      }
      // Anti-fraud: the profile's contact must match the snapshot captured
      // when the invite was sent. If either was rotated after the invite
      // was issued the link is invalidated.
      const emailMatch = !tokenRes.data.email_snapshot
        || (profileRes.data?.email || '').toLowerCase() === (tokenRes.data.email_snapshot || '').toLowerCase();
      const phoneMatch = !tokenRes.data.phone_snapshot
        || (profileRes.data?.phone || '') === tokenRes.data.phone_snapshot;
      if (!emailMatch && !phoneMatch) {
        setStatus('wrong_account');
        setErrorMsg('Your account details no longer match this invite. Please contact Welile Partner Operations.');
        return;
      }

      setPortfolio({
        portfolio_code: portfolioRes.data.portfolio_code,
        investment_amount: Number(portfolioRes.data.investment_amount),
        roi_percentage: Number(portfolioRes.data.roi_percentage),
        duration_months: Number(portfolioRes.data.duration_months),
        roi_mode: portfolioRes.data.roi_mode,
        status: portfolioRes.data.status,
      });
      setProfile(profileRes.data as ProfileSnapshot);
      setExistingSig(agreementRes.data?.partner_signature_data_url || null);
      setNationalId(profileRes.data?.national_id || '');
      setMobileMoneyName(profileRes.data?.mobile_money_name || '');
      setStatus('ready');
    };

    load().catch((e) => {
      if (!cancelled) {
        setStatus('invalid');
        setErrorMsg(e?.message || 'Could not load this invite.');
      }
    });
    return () => { cancelled = true; };
  }, [authLoading, user, partnerId, portfolioId, token]);

  const submit = async () => {
    if (!portfolio) return;
    const nin = nationalId.trim();
    if (!nin || nin.length < 6) {
      toast.error('Please enter your National ID number.');
      return;
    }
    const mmName = mobileMoneyName.trim();
    if (mmName.length < 3) {
      toast.error('Please enter the name that shows on your mobile money.');
      return;
    }
    const signature = useExistingSig && existingSig ? existingSig : sigDataUrl;
    if (!signature) {
      toast.error('Please add your signature before submitting.');
      return;
    }

    setStatus('submitting');
    try {
      const { data, error } = await supabase.functions.invoke('submit-portfolio-completion', {
        body: {
          portfolio_id: portfolioId,
          token,
          national_id: nin,
          mobile_money_name: mmName,
          signature_data_url: signature,
        },
      });
      if (error) {
        const msg = await extractFromErrorObject(error, 'Submission failed.');
        toast.error(msg);
        setStatus('ready');
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        setStatus('ready');
        return;
      }
      setStatus('done');
    } catch (e: any) {
      const msg = await extractFromErrorObject(e, 'Submission failed.');
      toast.error(msg);
      setStatus('ready');
    }
  };

  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'auth_required') {
    const redirect = `${window.location.pathname}${window.location.search}`;
    return (
      <FullScreenNotice
        icon={<ShieldCheck className="h-8 w-8 text-primary" />}
        title="Sign in to review your portfolio"
        message="For your security, please sign in with the same account we sent the invite to."
        cta={{ label: 'Sign in', onClick: () => navigate(`/auth?redirect=${encodeURIComponent(redirect)}`) }}
      />
    );
  }

  if (status === 'wrong_account') {
    return (
      <FullScreenNotice
        icon={<ShieldAlert className="h-8 w-8 text-destructive" />}
        title="This invite belongs to another account"
        message={errorMsg || 'Sign out and sign back in with the account the invite was sent to, or contact Welile Partner Operations.'}
        cta={{ label: 'Back to sign in', onClick: () => navigate('/auth') }}
      />
    );
  }

  if (status === 'invalid') {
    return (
      <FullScreenNotice
        icon={<ShieldAlert className="h-8 w-8 text-destructive" />}
        title="This invite is no longer valid"
        message={errorMsg || 'Please contact Welile Partner Operations for a fresh link.'}
      />
    );
  }

  if (status === 'done') {
    return (
      <FullScreenNotice
        icon={<CheckCircle2 className="h-8 w-8 text-primary" />}
        title="Submitted for approval"
        message="Thank you. Welile Partner Operations has been notified and will approve your portfolio shortly. You'll receive the final signed agreement by email."
      />
    );
  }

  const partnerName = profile?.full_name || 'Partner';

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <div className="max-w-lg mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-5">
        {/* Hero */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Portfolio addendum</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">Welcome, {partnerName}</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Confirm your details and sign to activate portfolio <span className="font-mono font-semibold text-foreground">{portfolio?.portfolio_code}</span>.
          </p>
        </div>

        {/* Portfolio summary */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Amount</p>
              <p className="text-xl sm:text-2xl font-black text-primary">{formatUGX(portfolio!.investment_amount)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <SummaryRow label="Monthly ROI" value={`${portfolio!.roi_percentage}%`} />
              <SummaryRow label="Duration" value={`${portfolio!.duration_months} months`} />
              <SummaryRow label="Mode" value={portfolio!.roi_mode === 'monthly_compounding' ? 'Compounding' : 'Monthly payout'} />
              <SummaryRow label="Reference" value={portfolio!.portfolio_code} mono />
            </div>
          </CardContent>
        </Card>

        {/* Identity fields */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold">Your identity</h2>
          <ReadOnlyRow label="Full name" value={profile?.full_name || '—'} />
          <ReadOnlyRow label="Email" value={profile?.email || '—'} />
          <ReadOnlyRow label="Phone" value={profile?.phone || '—'} />

          <div className="space-y-1.5">
            <Label htmlFor="nin" className="text-xs">National ID / Passport number</Label>
            <Input
              id="nin"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value.toUpperCase())}
              placeholder="e.g. CM12345678ABCD"
              disabled={status === 'submitting'}
              maxLength={40}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mmn" className="text-xs">Mobile money name (as it appears when we send money)</Label>
            <Input
              id="mmn"
              value={mobileMoneyName}
              onChange={(e) => setMobileMoneyName(e.target.value)}
              placeholder="e.g. Jane Namuli"
              disabled={status === 'submitting'}
              maxLength={120}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Signature */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold">Signature</h2>
          {existingSig && useExistingSig ? (
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="border rounded-md p-2 bg-white grid place-items-center min-h-24">
                  <img src={existingSig} alt="Signature on file" className="max-h-20 object-contain" />
                </div>
                <Button variant="outline" size="sm" onClick={() => setUseExistingSig(false)} className="w-full">
                  <PenLine className="h-3.5 w-3.5 mr-1.5" /> Draw a new signature
                </Button>
              </CardContent>
            </Card>
          ) : (
            <SignaturePad value={sigDataUrl} onChange={setSigDataUrl} onRestoreExisting={existingSig ? () => { setUseExistingSig(true); setSigDataUrl(null); } : undefined} />
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          By submitting, you confirm the details above are accurate and consent to the Welile Portfolio Addendum for reference {portfolio!.portfolio_code}. No wallet is charged yet — Partner Operations will contact you to fund the portfolio after approval.
        </p>
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur px-4 sm:px-6 py-3 z-30">
        <div className="max-w-lg mx-auto">
          <Button
            className="w-full h-11"
            size="lg"
            onClick={submit}
            disabled={status === 'submitting'}
          >
            {status === 'submitting'
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
              : <>Submit for approval</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">{label}</p>
      <p className={`mt-0.5 font-semibold text-foreground ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</p>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0 gap-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground truncate max-w-[60%] text-right">{value}</p>
    </div>
  );
}

function FullScreenNotice({
  icon, title, message, cta,
}: { icon: React.ReactNode; title: string; message: string; cta?: { label: string; onClick: () => void } }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 sm:p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-muted grid place-items-center">{icon}</div>
          <h1 className="text-lg sm:text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
          {cta && <Button onClick={cta.onClick} className="w-full">{cta.label}</Button>}
        </CardContent>
      </Card>
    </div>
  );
}

// Minimal touch-friendly signature pad — self-contained, no external deps.
function SignaturePad({ value, onChange, onRestoreExisting }: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  onRestoreExisting?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = point(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const dataUrl = canvasRef.current?.toDataURL('image/png') || null;
    onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="border-2 border-dashed rounded-md bg-white relative">
          <canvas
            ref={canvasRef}
            className="w-full h-36 touch-none block"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          {empty && (
            <p className="absolute inset-0 grid place-items-center pointer-events-none text-xs text-muted-foreground">
              Sign here
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clear} disabled={empty} className="text-xs">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
          {onRestoreExisting && (
            <Button variant="ghost" size="sm" onClick={onRestoreExisting} className="text-xs">
              Use signature on file
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}