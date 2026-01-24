import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, Phone, Calendar, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface DepositRequest {
  id: string;
  amount: number;
  status: string;
  provider: string | null;
  transaction_id: string | null;
  transaction_date: string | null;
  created_at: string;
  notes: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  rejected_at: string | null;
}

export default function DepositHistory() {
  const navigate = useNavigate();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeposits();
  }, []);

  const fetchDeposits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeposits(data || []);
    } catch (error) {
      console.error('Error fetching deposits:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-success/20 text-success border-success/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-warning/20 text-warning border-warning/30">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getProviderBadge = (provider: string | null) => {
    if (!provider) return null;
    const colors = provider === 'mtn' 
      ? 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30' 
      : 'bg-red-500/20 text-red-600 border-red-500/30';
    return (
      <Badge variant="outline" className={colors}>
        {provider.toUpperCase()}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Deposit History</h1>
            <p className="text-xs text-muted-foreground">
              {deposits.length} deposit request{deposits.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {deposits.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No Deposits Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                You haven't made any deposit requests yet.
              </p>
              <Button onClick={() => navigate('/dashboard')}>
                Make a Deposit
              </Button>
            </CardContent>
          </Card>
        ) : (
          deposits.map((deposit) => (
            <Card key={deposit.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">
                      {formatCurrency(deposit.amount)}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(deposit.status)}
                      {getProviderBadge(deposit.provider)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {deposit.transaction_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Transaction ID:</span>
                    <span className="font-mono font-medium">{deposit.transaction_id}</span>
                  </div>
                )}
                
                {deposit.transaction_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Transaction Date:</span>
                    <span>{format(new Date(deposit.transaction_date), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Requested:</span>
                  <span>{format(new Date(deposit.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>

                {deposit.status === 'approved' && deposit.approved_at && (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Verified on {format(new Date(deposit.approved_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                )}

                {deposit.status === 'rejected' && deposit.rejection_reason && (
                  <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <p className="text-sm text-destructive">
                      <strong>Rejection reason:</strong> {deposit.rejection_reason}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
