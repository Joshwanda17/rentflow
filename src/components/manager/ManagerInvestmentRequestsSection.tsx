import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { useConfetti } from '@/components/Confetti';
import { formatDistanceToNow } from 'date-fns';
import { 
  Users, 
  HandCoins, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Loader2,
  Phone,
  Copy,
  Check,
  Share2,
  Sparkles,
  TrendingUp,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InvestmentRequest {
  id: string;
  supporter_id: string;
  supporter_name: string | null;
  supporter_phone: string | null;
  amount: number;
  status: string;
  manager_notes: string | null;
  investment_account_id: string | null;
  created_at: string;
  processed_at: string | null;
}

export function ManagerInvestmentRequestsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  const [requests, setRequests] = useState<InvestmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<InvestmentRequest | null>(null);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountColor, setAccountColor] = useState('#22c55e');
  const [notes, setNotes] = useState('');
  const [createdAccountLink, setCreatedAccountLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('manager_investment_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('manager-investment-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'manager_investment_requests',
        },
        () => fetchRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleProcess = async (action: 'complete' | 'reject') => {
    if (!selectedRequest || !user) return;
    
    hapticTap();
    setProcessing(true);

    try {
      if (action === 'complete') {
        // Create investment account for supporter
        const { data: account, error: accountError } = await supabase
          .from('investment_accounts')
          .insert({
            user_id: selectedRequest.supporter_id,
            name: accountName || `Investment Account - ${formatUGX(selectedRequest.amount)}`,
            balance: selectedRequest.amount,
            color: accountColor,
            status: 'approved',
            approved_at: new Date().toISOString()
          })
          .select()
          .single();

        if (accountError) throw accountError;

        // Generate activation link
        const activationLink = `${window.location.origin}/activate-supporter?account=${account.id}`;
        setCreatedAccountLink(activationLink);

        // Update request
        const { error: updateError } = await supabase
          .from('manager_investment_requests')
          .update({
            status: 'completed',
            manager_id: user.id,
            manager_notes: notes,
            investment_account_id: account.id,
            processed_at: new Date().toISOString()
          })
          .eq('id', selectedRequest.id);

        if (updateError) throw updateError;

        // Notify supporter
        await supabase.from('notifications').insert({
          user_id: selectedRequest.supporter_id,
          title: '🎉 Investment Account Created!',
          message: `Your ${formatUGX(selectedRequest.amount)} investment is now active. You'll earn 15% monthly ROI!`,
          type: 'investment_created'
        });

        hapticSuccess();
        fireSuccess();
        toast({
          title: 'Investment Created!',
          description: `Account for ${selectedRequest.supporter_name} is now active.`
        });
      } else {
        // Reject request
        const { error } = await supabase
          .from('manager_investment_requests')
          .update({
            status: 'rejected',
            manager_id: user.id,
            manager_notes: notes,
            processed_at: new Date().toISOString()
          })
          .eq('id', selectedRequest.id);

        if (error) throw error;

        // Notify supporter
        await supabase.from('notifications').insert({
          user_id: selectedRequest.supporter_id,
          title: 'Investment Request Update',
          message: notes || 'Your investment request could not be processed. Please contact support.',
          type: 'investment_rejected'
        });

        toast({
          title: 'Request Rejected',
          description: 'Supporter has been notified.'
        });
      }

      if (action !== 'complete') {
        setShowProcessDialog(false);
        setSelectedRequest(null);
      }
      fetchRequests();
    } catch (error) {
      console.error('Error processing request:', error);
      toast({
        title: 'Error',
        description: 'Failed to process request',
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdAccountLink) return;
    await navigator.clipboard.writeText(createdAccountLink);
    setCopiedLink(true);
    hapticTap();
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!createdAccountLink || !selectedRequest) return;
    hapticTap();
    const message = encodeURIComponent(
      `🎉 Your Welile Investment Account is Ready!\n\n` +
      `Amount: ${formatUGX(selectedRequest.amount)}\n` +
      `Monthly Return: ${formatUGX(selectedRequest.amount * 0.15)} (15%)\n\n` +
      `View your account: ${createdAccountLink}`
    );
    window.open(`https://wa.me/${selectedRequest.supporter_phone?.replace(/\D/g, '')}?text=${message}`, '_blank');
  };

  const handleCloseDialog = () => {
    setShowProcessDialog(false);
    setSelectedRequest(null);
    setAccountName('');
    setNotes('');
    setCreatedAccountLink(null);
    setCopiedLink(false);
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const totalPendingAmount = requests
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + r.amount, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-success/20 text-success"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'processing':
        return <Badge className="bg-primary/20 text-primary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      default:
        return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Loading requests...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" />
              Manager Investment Requests
            </CardTitle>
            {pendingCount > 0 && (
              <Badge className="bg-warning text-warning-foreground">
                {pendingCount} pending
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          {pendingCount > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-warning/10 to-primary/10 border border-warning/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending Investment</p>
                  <p className="text-2xl font-black text-foreground">{formatUGX(totalPendingAmount)}</p>
                </div>
                <div className="p-3 rounded-full bg-warning/20">
                  <Users className="h-6 w-6 text-warning" />
                </div>
              </div>
            </div>
          )}

          {/* Requests List */}
          {requests.length === 0 ? (
            <div className="text-center py-8">
              <HandCoins className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No investment requests yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Supporters can request you to invest on their behalf
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                <AnimatePresence>
                  {requests.map((request, index) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card 
                        className={`border cursor-pointer hover:shadow-md transition-all ${
                          request.status === 'pending' ? 'border-warning/30 bg-warning/5' : ''
                        }`}
                        onClick={() => {
                          if (request.status === 'pending') {
                            setSelectedRequest(request);
                            setAccountName(`${request.supporter_name}'s Investment`);
                            setShowProcessDialog(true);
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-bold text-foreground truncate">
                                  {request.supporter_name || 'Unknown Supporter'}
                                </p>
                                {getStatusBadge(request.status)}
                              </div>
                              {request.supporter_phone && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {request.supporter_phone}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xl font-black text-foreground">
                                {formatUGX(request.amount)}
                              </p>
                              <p className="text-xs text-success font-semibold">
                                +{formatUGX(request.amount * 0.15)}/mo
                              </p>
                            </div>
                          </div>
                          
                          {request.status === 'pending' && (
                            <Button 
                              size="sm" 
                              className="w-full mt-3 h-10 font-bold"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRequest(request);
                                setAccountName(`${request.supporter_name}'s Investment`);
                                setShowProcessDialog(true);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Process Request
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Process Dialog */}
      <Dialog open={showProcessDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-md">
          {!createdAccountLink ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Process Investment Request
                </DialogTitle>
                <DialogDescription>
                  Create an investment account for {selectedRequest?.supporter_name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Request Summary */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Investment Amount</p>
                        <p className="text-2xl font-black">{formatUGX(selectedRequest?.amount || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Monthly ROI</p>
                        <p className="text-xl font-bold text-success">
                          +{formatUGX((selectedRequest?.amount || 0) * 0.15)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label>Account Name</Label>
                  <Input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Enter account name"
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Account Color</Label>
                  <div className="flex gap-2">
                    {['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'].map(color => (
                      <button
                        key={color}
                        onClick={() => setAccountColor(color)}
                        className={`w-10 h-10 rounded-full transition-all ${
                          accountColor === color ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes..."
                    rows={2}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => handleProcess('reject')}
                    disabled={processing}
                    className="flex-1 h-12"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleProcess('complete')}
                    disabled={processing}
                    className="flex-1 h-12 font-bold bg-gradient-to-r from-success to-primary"
                  >
                    {processing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        Create Account
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            // Success State - Share Link
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6 space-y-4"
            >
              <div className="w-20 h-20 mx-auto rounded-full bg-success/20 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
              </div>
              
              <div>
                <h3 className="text-xl font-bold">Account Created!</h3>
                <p className="text-muted-foreground mt-1">
                  Share this link with {selectedRequest?.supporter_name}
                </p>
              </div>

              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success shrink-0" />
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground">Monthly Return</p>
                      <p className="text-lg font-black text-success">
                        +{formatUGX((selectedRequest?.amount || 0) * 0.15)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="w-full h-12 font-bold"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-5 w-5 mr-2 text-success" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5 mr-2" />
                      Copy Link
                    </>
                  )}
                </Button>

                {selectedRequest?.supporter_phone && (
                  <Button
                    onClick={handleShareWhatsApp}
                    className="w-full h-12 font-bold bg-[#25D366] hover:bg-[#25D366]/90 text-white"
                  >
                    <Share2 className="h-5 w-5 mr-2" />
                    Share via WhatsApp
                  </Button>
                )}
              </div>

              <Button
                variant="ghost"
                onClick={handleCloseDialog}
                className="w-full"
              >
                Done
              </Button>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
