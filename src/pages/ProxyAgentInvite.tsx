import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react';

const STORAGE_KEY = 'pendingProxyInvite';

interface Agreement {
  id: string;
  version_code: string;
  body_md: string;
  already_accepted: boolean;
}

export default function ProxyAgentInvite() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nin, setNin] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Remember the invite code so the user can resume after signing in.
  useEffect(() => {
    if (!code) return;
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* storage unavailable — ignore */
    }
  }, [code]);

  // Not signed in → send to auth with the agent intent.
  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate('/auth?become=agent', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc('current_proxy_agreement');
      if (cancelled) return;

      if (rpcError) {
        setError(rpcError.message);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setAgreement(row as unknown as Agreement);
        } else {
          setError('No active proxy agreement is available right now.');
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const canAccept = useMemo(
    () => agreed && nin.trim().length >= 8 && !submitting,
    [agreed, nin, submitting],
  );

  const handleAccept = async () => {
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('accept_proxy_agreement', {
      p_code: code,
      p_nin: nin.trim(),
    });
    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const row: any = Array.isArray(data) ? data[0] : data;
    if (row?.status === 'accepted') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setAccepted(true);
      return;
    }

    setError(row?.message || row?.status || 'Could not accept the agreement.');
  };

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Proxy agent agreement
              {agreement?.version_code && (
                <span className="text-xs font-normal text-muted-foreground">
                  Version {agreement.version_code}
                </span>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading agreement…
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}

            {accepted ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    You're connected. Promissory notes you submit will now be credited to your lead.
                  </span>
                </div>
                <Link to="/pa/record" className="text-sm text-primary underline">
                  Go to record a promissory note
                </Link>
              </div>
            ) : agreement?.already_accepted ? (
              <div className="space-y-3">
                <p className="text-sm">You have already accepted this month's agreement</p>
                <Link to="/pa/record" className="text-sm text-primary underline">
                  Go to record a promissory note
                </Link>
              </div>
            ) : agreement ? (
              <>
                <ScrollArea className="h-[45vh] rounded-md border p-4">
                  <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed">
                    <ReactMarkdown>{agreement.body_md || ''}</ReactMarkdown>
                  </div>
                </ScrollArea>

                <div className="space-y-1.5">
                  <Label htmlFor="proxy-nin" className="text-sm">
                    National ID number
                  </Label>
                  <Input
                    id="proxy-nin"
                    value={nin}
                    onChange={(e) => setNin(e.target.value)}
                    placeholder="Enter your National ID number"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required to verify your identity for payments.
                  </p>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 text-sm hover:bg-muted/40">
                  <Checkbox
                    checked={agreed}
                    onCheckedChange={(c) => setAgreed(c === true)}
                    className="mt-0.5"
                  />
                  <span>I have read and accept this agreement.</span>
                </label>

                <Button onClick={handleAccept} disabled={!canAccept} className="w-full">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}