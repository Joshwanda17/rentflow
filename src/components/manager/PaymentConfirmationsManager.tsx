import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search, 
  RefreshCw,
  ExternalLink,
  Phone,
  User,
  Calendar,
  Receipt,
  Loader2,
  ImageIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface PaymentConfirmation {
  id: string;
  user_id: string;
  dashboard_type: string;
  payment_partner: string;
  amount: number;
  transaction_id: string;
  screenshot_url: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  profile?: {
    full_name: string;
    phone: string;
  };
}

export default function PaymentConfirmationsManager() {
  const { user } = useAuth();
  const [confirmations, setConfirmations] = useState<PaymentConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedConfirmation, setSelectedConfirmation] = useState<PaymentConfirmation | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fetchConfirmations = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payment_confirmations')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profiles for each confirmation
      const enrichedData = await Promise.all(
        (data || []).map(async (conf) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', conf.user_id)
            .single();
          return { ...conf, profile };
        })
      );

      setConfirmations(enrichedData);
    } catch (error) {
      console.error('Error fetching confirmations:', error);
      toast.error('Failed to load payment confirmations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfirmations();
  }, [statusFilter]);

  const handleProcess = async (action: 'approve' | 'reject') => {
    if (!selectedConfirmation || !user) return;
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('payment_confirmations')
        .update({
          status: action === 'approve' ? 'approved' : 'rejected',
          admin_note: adminNote || null,
          processed_by: user.id,
          processed_at: new Date().toISOString()
        })
        .eq('id', selectedConfirmation.id);

      if (error) throw error;

      // If approved, credit the user's wallet
      if (action === 'approve') {
        // Get current wallet balance
        const { data: walletData } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', selectedConfirmation.user_id)
          .single();

        if (walletData) {
          await supabase
            .from('wallets')
            .update({ balance: walletData.balance + selectedConfirmation.amount })
            .eq('user_id', selectedConfirmation.user_id);
        }

        // Create notification for user
        await supabase.from('notifications').insert({
          user_id: selectedConfirmation.user_id,
          title: '✅ Payment Approved!',
          message: `Your payment of UGX ${selectedConfirmation.amount.toLocaleString()} has been verified and added to your wallet.`,
          type: 'success',
          metadata: { amount: selectedConfirmation.amount, confirmation_id: selectedConfirmation.id }
        });
      } else {
        // Create rejection notification
        await supabase.from('notifications').insert({
          user_id: selectedConfirmation.user_id,
          title: '❌ Payment Rejected',
          message: adminNote || 'Your payment confirmation was not approved. Please contact support.',
          type: 'warning',
          metadata: { confirmation_id: selectedConfirmation.id }
        });
      }

      toast.success(`Payment ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      setSelectedConfirmation(null);
      setAdminNote('');
      fetchConfirmations();
    } catch (error: any) {
      console.error('Error processing confirmation:', error);
      toast.error(error.message || 'Failed to process payment');
    } finally {
      setProcessing(false);
    }
  };

  const filteredConfirmations = confirmations.filter(conf => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      conf.transaction_id.toLowerCase().includes(term) ||
      conf.profile?.full_name?.toLowerCase().includes(term) ||
      conf.profile?.phone?.includes(term)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success text-success-foreground"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getPartnerBadge = (partner: string) => {
    if (partner === 'mtn') {
      return <Badge className="bg-[#FFCC00] text-black">MTN MoMo</Badge>;
    }
    return <Badge className="bg-[#ED1C24] text-white">Airtel</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          Payment Confirmations
        </h2>
        <Button variant="outline" size="sm" onClick={fetchConfirmations}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or transaction ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Confirmations List */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-3 pr-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredConfirmations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No payment confirmations found</p>
              </CardContent>
            </Card>
          ) : (
            filteredConfirmations.map((conf) => (
              <Card 
                key={conf.id} 
                className={cn(
                  'cursor-pointer hover:shadow-md transition-shadow',
                  conf.status === 'pending' && 'border-warning/50 bg-warning/5'
                )}
                onClick={() => setSelectedConfirmation(conf)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center',
                      conf.payment_partner === 'mtn' ? 'bg-[#FFCC00]' : 'bg-[#ED1C24]'
                    )}>
                      <Phone className={cn(
                        'w-5 h-5',
                        conf.payment_partner === 'mtn' ? 'text-black' : 'text-white'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {conf.profile?.full_name || 'Unknown User'}
                        </span>
                        {getPartnerBadge(conf.payment_partner)}
                        <Badge variant="outline" className="capitalize text-xs">
                          {conf.dashboard_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="font-mono">{conf.transaction_id}</span>
                        <span>•</span>
                        <span>{format(new Date(conf.created_at), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">
                        UGX {conf.amount.toLocaleString()}
                      </p>
                      {getStatusBadge(conf.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Detail Dialog */}
      <Dialog open={!!selectedConfirmation} onOpenChange={() => setSelectedConfirmation(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Confirmation Details</DialogTitle>
          </DialogHeader>
          
          {selectedConfirmation && (
            <div className="space-y-4">
              {/* User Info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedConfirmation.profile?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedConfirmation.profile?.phone}</p>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-bold text-xl">UGX {selectedConfirmation.amount.toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Partner</p>
                  {getPartnerBadge(selectedConfirmation.payment_partner)}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Transaction ID</p>
                  <p className="font-mono text-sm">{selectedConfirmation.transaction_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Submitted</p>
                  <p className="text-sm">{format(new Date(selectedConfirmation.created_at), 'PPp')}</p>
                </div>
              </div>

              {/* Screenshot */}
              {selectedConfirmation.screenshot_url && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Screenshot</p>
                  <button 
                    onClick={() => setImagePreview(selectedConfirmation.screenshot_url)}
                    className="block w-full"
                  >
                    <img 
                      src={selectedConfirmation.screenshot_url} 
                      alt="Payment screenshot"
                      className="w-full max-h-48 object-cover rounded-lg border cursor-pointer hover:opacity-90"
                    />
                  </button>
                </div>
              )}

              {/* Admin Note */}
              {selectedConfirmation.status === 'pending' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Admin Note (optional)</p>
                  <Textarea
                    placeholder="Add a note for the user..."
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={2}
                  />
                </div>
              )}

              {selectedConfirmation.admin_note && selectedConfirmation.status !== 'pending' && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Admin Note</p>
                  <p className="text-sm">{selectedConfirmation.admin_note}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {selectedConfirmation?.status === 'pending' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleProcess('reject')}
                  disabled={processing}
                  className="flex-1"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Reject
                </Button>
                <Button
                  onClick={() => handleProcess('approve')}
                  disabled={processing}
                  className="flex-1 bg-success hover:bg-success/90"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setSelectedConfirmation(null)} className="w-full">
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-2xl p-2">
          {imagePreview && (
            <img 
              src={imagePreview} 
              alt="Full screenshot"
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
