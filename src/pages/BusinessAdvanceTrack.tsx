import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Briefcase, ArrowRight, Shield } from 'lucide-react';
import BusinessAdvanceStatusTracker, { AdvanceStatusRow } from '@/components/business-advance/BusinessAdvanceStatusTracker';

export default function BusinessAdvanceTrack() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const phone = (params.get('phone') || '').replace(/\s/g, '');

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<AdvanceStatusRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setIsAuthed(!!user);

      if (!phone) {
        if (alive) { setError('Missing phone number in the link'); setLoading(false); }
        return;
      }
      const { data, error } = await supabase.rpc('get_business_advance_public_status', { p_phone: phone });
      if (!alive) return;
      if (error) {
        setError(error.message);
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        setError('No Business Advance request found for this number yet.');
      } else {
        const r = Array.isArray(data) ? data[0] : data;
        setRow(r as AdvanceStatusRow);
      }
      setLoading(false);
    };
    load();

    // Live updates
    const ch = supabase
      .channel('public-advance-track')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'business_advances' }, () => load())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [phone]);

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
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 space-y-2 text-center">
                <p className="text-sm font-semibold">Manage everything from your dashboard</p>
                <p className="text-xs text-muted-foreground">
                  Sign in to view payments, make repayments, and unlock more credit.
                </p>
                <Button className="w-full gap-2" onClick={() => navigate(isAuthed ? '/dashboard/tenant' : `/auth?phone=${encodeURIComponent(phone)}`)}>
                  {isAuthed ? 'Open my dashboard' : 'Sign in / Create account'} <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
