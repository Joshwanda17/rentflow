import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';
import { Loader2, UsersRound, CheckCircle2, AlertTriangle, LogIn } from 'lucide-react';

type Phase = 'idle' | 'accepting' | 'accepted' | 'error' | 'need-login';

export default function SubAgentInvite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, loading } = useAuth();

  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [parentName, setParentName] = useState('your agent');

  const handleAccept = async () => {
    if (!token) {
      setPhase('error');
      setMessage('This invitation link is missing its token.');
      return;
    }
    setPhase('accepting');
    try {
      const response = await supabase.functions.invoke('accept-subagent-invite', {
        body: { acceptanceToken: token },
      });
      if (response.error || response.data?.error) {
        const msg = await extractEdgeFunctionError(response, 'Could not accept the invitation.');
        throw new Error(msg);
      }
      if (response.data?.parentName) setParentName(response.data.parentName);
      setPhase('accepted');
    } catch (err: any) {
      setPhase('error');
      setMessage(err?.message || 'Could not accept the invitation. Please try again.');
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setPhase('need-login');
    }
  }, [loading, user]);

  if (loading || (!user && phase === 'idle')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-2 border-primary/20">
        <CardContent className="p-6 space-y-5 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            {phase === 'accepted' ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : phase === 'error' ? (
              <AlertTriangle className="h-7 w-7 text-destructive" />
            ) : (
              <UsersRound className="h-7 w-7" />
            )}
          </div>

          {phase === 'need-login' && (
            <>
              <div>
                <h1 className="text-lg font-bold">Sub-agent invitation</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Sign in to your Welile account to accept this invitation.
                </p>
              </div>
              <Button
                className="w-full h-11 gap-2"
                onClick={() => navigate(`/?redirect=${encodeURIComponent(`/sub-agent-invite?token=${token}`)}`)}
              >
                <LogIn className="h-4 w-4" /> Sign in to accept
              </Button>
            </>
          )}

          {(phase === 'idle' || phase === 'accepting') && user && (
            <>
              <div>
                <h1 className="text-lg font-bold">You've been invited as a sub-agent</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Accept to join the team and start earning on Welile.
                </p>
              </div>
              <Button className="w-full h-11 gap-2" onClick={handleAccept} disabled={phase === 'accepting'}>
                {phase === 'accepting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Accept invitation
              </Button>
            </>
          )}

          {phase === 'accepted' && (
            <>
              <div>
                <h1 className="text-lg font-bold">Invitation accepted!</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  You're now a sub-agent of {parentName}. Welcome aboard!
                </p>
              </div>
              <Button className="w-full h-11" onClick={() => navigate('/dashboard/agent')}>
                Go to my dashboard
              </Button>
            </>
          )}

          {phase === 'error' && (
            <>
              <div>
                <h1 className="text-lg font-bold">Couldn't accept</h1>
                <p className="text-sm text-muted-foreground mt-1">{message}</p>
              </div>
              <Button variant="outline" className="w-full h-11" onClick={() => { setPhase('idle'); setMessage(''); }}>
                Try again
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
