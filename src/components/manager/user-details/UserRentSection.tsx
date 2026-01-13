import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Home, 
  Calendar, 
  CheckCircle, 
  Clock, 
  XCircle,
  TrendingUp,
  Wallet,
  AlertCircle
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface RentRequest {
  id: string;
  rent_amount: number;
  total_repayment: number;
  daily_repayment: number;
  duration_days: number;
  status: string | null;
  created_at: string;
  approved_at: string | null;
  funded_at: string | null;
  disbursed_at: string | null;
  access_fee: number;
  request_fee: number;
  landlord: {
    name: string;
    property_address: string;
  } | null;
}

interface Repayment {
  id: string;
  amount: number;
  payment_date: string;
  rent_request_id: string;
}

interface UserRentSectionProps {
  userId: string;
}

export default function UserRentSection({ userId }: UserRentSectionProps) {
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRentData();
  }, [userId]);

  const fetchRentData = async () => {
    setLoading(true);
    try {
      const [{ data: requests }, { data: payments }] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('*, landlord:landlords(name, property_address)')
          .eq('tenant_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('repayments')
          .select('*')
          .eq('tenant_id', userId)
          .order('payment_date', { ascending: false })
      ]);

      setRentRequests((requests as RentRequest[]) || []);
      setRepayments(payments || []);
    } catch (error) {
      console.error('Error fetching rent data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'funded':
        return <Badge className="bg-primary/20 text-primary"><Wallet className="h-3 w-3 mr-1" />Funded</Badge>;
      case 'disbursed':
        return <Badge className="bg-chart-5/20 text-chart-5"><TrendingUp className="h-3 w-3 mr-1" />Active</Badge>;
      case 'completed':
        return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  // Calculate totals
  const activeRequests = rentRequests.filter(r => r.status === 'disbursed' || r.status === 'funded');
  const completedRequests = rentRequests.filter(r => r.status === 'completed');
  
  const totalOwed = activeRequests.reduce((sum, r) => sum + r.total_repayment, 0);
  const totalPaid = repayments.reduce((sum, r) => sum + r.amount, 0);
  const totalRequested = rentRequests.reduce((sum, r) => sum + r.rent_amount, 0);
  const balance = totalOwed - totalPaid;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rent Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Home className="h-3 w-3" />
            Total Requested
          </div>
          <p className="font-semibold text-sm">{formatUGX(totalRequested)}</p>
          <p className="text-xs text-muted-foreground">{rentRequests.length} requests</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <CheckCircle className="h-3 w-3" />
            Total Paid
          </div>
          <p className="font-semibold text-sm text-success">{formatUGX(totalPaid)}</p>
          <p className="text-xs text-muted-foreground">{repayments.length} payments</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            Active Loans
          </div>
          <p className="font-semibold text-sm">{formatUGX(totalOwed)}</p>
          <p className="text-xs text-muted-foreground">{activeRequests.length} active</p>
        </Card>
        <Card className={`p-3 ${balance > 0 ? 'border-warning/50' : 'border-success/50'}`}>
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <AlertCircle className="h-3 w-3" />
            Outstanding
          </div>
          <p className={`font-semibold text-sm ${balance > 0 ? 'text-warning' : 'text-success'}`}>
            {formatUGX(Math.max(0, balance))}
          </p>
          <p className="text-xs text-muted-foreground">{completedRequests.length} completed</p>
        </Card>
      </div>

      {/* Rent Requests List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            Rent Request History
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {rentRequests.length === 0 ? (
            <div className="text-center py-6">
              <Home className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No rent requests yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rentRequests.slice(0, 5).map((request) => {
                // Calculate paid amount for this request
                const requestPayments = repayments.filter(r => r.rent_request_id === request.id);
                const paidAmount = requestPayments.reduce((sum, r) => sum + r.amount, 0);
                const progress = request.total_repayment > 0 
                  ? Math.min(100, (paidAmount / request.total_repayment) * 100) 
                  : 0;

                return (
                  <div key={request.id} className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {request.landlord?.property_address || 'Unknown Property'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {request.landlord?.name || 'Unknown Landlord'}
                        </p>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div>
                        <span className="text-muted-foreground">Rent: </span>
                        <span className="font-medium">{formatUGX(request.rent_amount)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Repay: </span>
                        <span className="font-medium">{formatUGX(request.total_repayment)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Daily: </span>
                        <span className="font-medium">{formatUGX(request.daily_repayment)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Days: </span>
                        <span className="font-medium">{request.duration_days}</span>
                      </div>
                    </div>

                    {(request.status === 'disbursed' || request.status === 'funded' || request.status === 'completed') && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Paid: {formatUGX(paidAmount)}</span>
                          <span className="font-medium">{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(request.created_at), 'MMM d, yyyy')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
