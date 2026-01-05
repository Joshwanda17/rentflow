import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { Receipt, CreditCard, CheckCircle, XCircle, ArrowLeft, TrendingUp, Loader2, ShoppingBag, FileText, Plus, Percent, Home, Sparkles, Camera, ChevronDown, ChevronUp } from 'lucide-react';
import { ReceiptStatusTimeline } from '@/components/receipts/ReceiptStatusTimeline';
import { ThemeToggle } from '@/components/ThemeToggle';
import { QRScanner } from '@/components/receipts/QRScanner';

interface UserReceipt {
  id: string;
  receipt_number_id: string;
  items_description: string;
  claimed_amount: number;
  verified: boolean;
  verified_at: string | null;
  rejection_reason: string | null;
  loan_contribution: number | null;
  created_at: string;
  receipt_numbers?: {
    receipt_code: string;
    vendor_marked_at: string | null;
    vendors?: {
      name: string;
    };
  };
}

interface LoanLimit {
  total_verified_amount: number;
  available_limit: number;
  used_limit: number;
}

interface UserLoan {
  id: string;
  amount: number;
  interest_rate: number;
  total_repayment: number;
  status: string;
  due_date: string;
  created_at: string;
  lender?: {
    full_name: string;
  };
}

export default function MyReceipts() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [receipts, setReceipts] = useState<UserReceipt[]>([]);
  const [loanLimit, setLoanLimit] = useState<LoanLimit | null>(null);
  const [loans, setLoans] = useState<UserLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  
  // Rent discount state
  const [monthlyReceipts, setMonthlyReceipts] = useState(0);
  const [rentDiscount, setRentDiscount] = useState(0);
  const [monthlyReceiptCount, setMonthlyReceiptCount] = useState(0);
  
  // Form state
  const [receiptCode, setReceiptCode] = useState('');
  const [itemsDescription, setItemsDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchData();
    }
  }, [user, authLoading, navigate]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    // Get current month boundaries
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const [receiptsRes, loanLimitRes, loansRes, monthlyReceiptsRes] = await Promise.all([
      supabase
        .from('user_receipts')
        .select(`
          *,
          receipt_numbers (
            receipt_code,
            vendor_marked_at,
            vendors (name)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('loan_limits')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('user_loans')
        .select('*')
        .eq('borrower_id', user.id)
        .order('created_at', { ascending: false }),
      // Get this month's verified receipts for rent discount calculation
      supabase
        .from('user_receipts')
        .select('claimed_amount')
        .eq('user_id', user.id)
        .eq('verified', true)
        .gte('verified_at', startOfMonth)
        .lte('verified_at', endOfMonth)
    ]);

    // Fetch lender profiles for loans
    const loanData = loansRes.data || [];
    const lenderIds = [...new Set(loanData.map(l => l.lender_id))];
    const { data: lenderProfiles } = lenderIds.length > 0 
      ? await supabase.from('profiles').select('id, full_name').in('id', lenderIds)
      : { data: [] };

    const loansWithLenders = loanData.map(l => ({
      ...l,
      lender: lenderProfiles?.find(p => p.id === l.lender_id)
    }));

    // Calculate monthly rent discount (1% of verified receipts)
    const monthlyTotal = monthlyReceiptsRes.data?.reduce((sum, r) => sum + Number(r.claimed_amount), 0) || 0;
    setMonthlyReceipts(monthlyTotal);
    setRentDiscount(Math.round(monthlyTotal * 0.01));
    setMonthlyReceiptCount(monthlyReceiptsRes.data?.length || 0);

    setReceipts(receiptsRes.data || []);
    setLoanLimit(loanLimitRes.data);
    setLoans(loansWithLenders);
    setLoading(false);
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);

    // Find the receipt number by code
    const { data: receiptNumber, error: findError } = await supabase
      .from('receipt_numbers')
      .select('id, status, vendor_amount')
      .eq('receipt_code', receiptCode.toUpperCase().trim())
      .single();

    if (findError || !receiptNumber) {
      toast({
        title: 'Invalid Receipt',
        description: 'This receipt number does not exist in our system',
        variant: 'destructive'
      });
      setSubmitting(false);
      return;
    }

    if (receiptNumber.status === 'used') {
      toast({
        title: 'Receipt Already Used',
        description: 'This receipt has already been submitted by another user',
        variant: 'destructive'
      });
      setSubmitting(false);
      return;
    }

    // Submit the receipt
    const { error: submitError } = await supabase
      .from('user_receipts')
      .insert({
        user_id: user.id,
        receipt_number_id: receiptNumber.id,
        items_description: itemsDescription.trim(),
        claimed_amount: parseFloat(claimedAmount)
      });

    if (submitError) {
      // Check for unique constraint violation
      if (submitError.code === '23505' || submitError.message.includes('unique') || submitError.message.includes('duplicate')) {
        toast({
          title: 'Receipt Already Submitted',
          description: 'This receipt code has already been claimed. Each receipt can only be used once.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Error',
          description: submitError.message,
          variant: 'destructive'
        });
      }
    } else {
      toast({
        title: 'Receipt Submitted',
        description: 'Your receipt has been submitted for verification'
      });
      setReceiptCode('');
      setItemsDescription('');
      setClaimedAmount('');
      fetchData();
    }

    setSubmitting(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const verifiedReceipts = receipts.filter(r => r.verified);
  const pendingReceipts = receipts.filter(r => !r.verified && !r.rejection_reason);
  const rejectedReceipts = receipts.filter(r => !r.verified && r.rejection_reason);
  const activeLoans = loans.filter(l => l.status === 'active');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">My Receipts</h1>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Rent Discount Card - NEW! Shows monthly savings */}
        <Card className="elevated-card overflow-hidden border-success/20 bg-gradient-to-br from-success/10 via-success/5 to-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-success/20">
                  <Percent className="h-6 w-6 text-success" />
                </div>
                <div>
                  <CardTitle className="text-lg">Your Rent Discount</CardTitle>
                  <CardDescription>Earn 1% of your shopping as rent savings</CardDescription>
                </div>
              </div>
              <Badge variant="success" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-bold text-success">{formatUGX(rentDiscount)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  earned from {monthlyReceiptCount} receipts this month
                </p>
              </div>
              <Button 
                onClick={() => navigate('/pay-landlord')} 
                className="bg-success hover:bg-success/90 gap-2"
              >
                <Home className="h-4 w-4" />
                Pay Rent
              </Button>
            </div>
            
            <div className="p-3 rounded-xl bg-background/50 border border-border/50">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Monthly shopping</span>
                <span className="font-medium">{formatUGX(monthlyReceipts)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Max discount (70% of rent)</span>
                <span className="font-medium text-muted-foreground">varies</span>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Keep shopping at Welile partner stores to grow your discount!
            </p>
          </CardContent>
        </Card>

        {/* Loan Limit Card */}
        <Card className="elevated-card bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/20">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Your Loan Limit</CardTitle>
                <CardDescription>Based on verified shopping receipts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-xl bg-background/50">
                <p className="text-sm text-muted-foreground mb-1">Total Verified</p>
                <p className="text-xl font-bold">{formatUGX(loanLimit?.total_verified_amount || 0)}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-success/10 border border-success/20">
                <p className="text-sm text-muted-foreground mb-1">Available Limit</p>
                <p className="text-xl font-bold text-success">{formatUGX(loanLimit?.available_limit || 0)}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-warning/10 border border-warning/20">
                <p className="text-sm text-muted-foreground mb-1">Used Limit</p>
                <p className="text-xl font-bold text-warning">{formatUGX(loanLimit?.used_limit || 0)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              <TrendingUp className="h-3 w-3 inline mr-1" />
              Your loan limit grows by 20% of each verified receipt amount
            </p>
          </CardContent>
        </Card>

        {/* Submit Receipt Form */}
        <Card className="elevated-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Submit Shopping Receipt</CardTitle>
                <CardDescription>Enter your Welile receipt number from the vendor</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitReceipt} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="receiptCode">Receipt Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="receiptCode"
                    placeholder="Enter receipt code (e.g., WL-001234)"
                    value={receiptCode}
                    onChange={(e) => setReceiptCode(e.target.value.toUpperCase())}
                    required
                    className="font-mono uppercase flex-1"
                  />
                  <QRScanner 
                    onScan={(code) => setReceiptCode(code.toUpperCase())}
                    buttonClassName="shrink-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Camera className="h-3 w-3" />
                  Tap the camera icon to scan QR code
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="items">Items Purchased</Label>
                <Textarea
                  id="items"
                  placeholder="List the items you purchased..."
                  value={itemsDescription}
                  onChange={(e) => setItemsDescription(e.target.value)}
                  required
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Total Amount (UGX)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter total amount"
                  value={claimedAmount}
                  onChange={(e) => setClaimedAmount(e.target.value)}
                  required
                  min="1000"
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Submit Receipt
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Active Loans */}
        {activeLoans.length > 0 && (
          <Card className="elevated-card border-warning/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <CreditCard className="h-4 w-4 text-warning" />
                </div>
                <CardTitle className="text-lg">Active Loans</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeLoans.map((loan) => (
                <div key={loan.id} className="p-4 rounded-xl bg-warning/5 border border-warning/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{formatUGX(loan.amount)}</span>
                    <Badge variant="warning">Due: {new Date(loan.due_date).toLocaleDateString()}</Badge>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Repayment: {formatUGX(loan.total_repayment)}</span>
                    <span>From: {loan.lender?.full_name || 'Unknown'}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Receipt History */}
        <Card className="elevated-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-lg">Receipt History</CardTitle>
              </div>
              <Badge variant="outline">{receipts.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No receipts submitted yet</p>
                <p className="text-sm text-muted-foreground/70">Submit your shopping receipts to grow your loan limit</p>
              </div>
            ) : (
              <div className="space-y-3">
                {receipts.map((receipt) => {
                  const isExpanded = expandedReceipt === receipt.id;
                  return (
                    <div 
                      key={receipt.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        receipt.verified 
                          ? 'bg-success/5 border-success/20' 
                          : receipt.rejection_reason 
                            ? 'bg-destructive/5 border-destructive/20'
                            : 'bg-secondary/30 border-border/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono bg-background/50 px-2 py-0.5 rounded">
                              {receipt.receipt_numbers?.receipt_code || 'N/A'}
                            </code>
                            {receipt.verified ? (
                              <Badge variant="success" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Verified
                              </Badge>
                            ) : receipt.rejection_reason ? (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Rejected
                              </Badge>
                            ) : (
                              <Badge variant="warning">Pending</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {receipt.receipt_numbers?.vendors?.name || 'Unknown Vendor'}
                          </p>
                          <p className="text-sm mt-1 line-clamp-2">{receipt.items_description}</p>
                          {receipt.rejection_reason && (
                            <p className="text-sm text-destructive mt-2">{receipt.rejection_reason}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">{formatUGX(receipt.claimed_amount)}</p>
                          {receipt.loan_contribution && (
                            <p className="text-xs text-success">+{formatUGX(receipt.loan_contribution)} limit</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(receipt.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      {/* Timeline Toggle */}
                      <button
                        onClick={() => setExpandedReceipt(isExpanded ? null : receipt.id)}
                        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3" />
                            Hide timeline
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" />
                            View timeline
                          </>
                        )}
                      </button>
                      
                      {/* Status Timeline */}
                      {isExpanded && (
                        <ReceiptStatusTimeline
                          submittedAt={receipt.created_at}
                          vendorVerifiedAt={receipt.receipt_numbers?.vendor_marked_at || null}
                          approvedAt={receipt.verified_at}
                          rejectedReason={receipt.rejection_reason}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
