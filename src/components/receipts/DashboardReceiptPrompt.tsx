import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Receipt, 
  Loader2, 
  FileText, 
  TrendingUp, 
  CreditCard, 
  Camera, 
  Upload, 
  Sparkles,
  Gift,
  Percent,
  Home,
  ArrowRight,
  ShoppingBag,
  CheckCircle2
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useConfetti } from '@/components/Confetti';

interface DashboardReceiptPromptProps {
  userId: string;
}

interface LoanLimit {
  total_verified_amount: number;
  available_limit: number;
  used_limit: number;
}

const MAX_LOAN_LIMIT = 30000000;

export function DashboardReceiptPrompt({ userId }: DashboardReceiptPromptProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  const [submitting, setSubmitting] = useState(false);
  const [receiptCode, setReceiptCode] = useState('');
  const [itemsDescription, setItemsDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [loanLimit, setLoanLimit] = useState<LoanLimit | null>(null);
  const [loadingLimit, setLoadingLimit] = useState(true);
  const [lastIncrease, setLastIncrease] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [rentDiscount, setRentDiscount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    if (!userId) return;
    setLoadingLimit(true);
    
    // Fetch loan limit
    const { data: limitData } = await supabase
      .from('loan_limits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    setLoanLimit(limitData);

    // Fetch monthly verified receipts for rent discount calculation
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: receipts } = await supabase
      .from('user_receipts')
      .select('claimed_amount')
      .eq('user_id', userId)
      .eq('verified', true)
      .gte('verified_at', startOfMonth.toISOString());

    const totalVerified = receipts?.reduce((sum, r) => sum + (r.claimed_amount || 0), 0) || 0;
    const discount = Math.min(totalVerified * 0.007, 70); // 0.7% of receipts, max 70%
    setRentDiscount(Math.round(discount));
    
    setLoadingLimit(false);
  };

  const handleScanReceipt = async (file: File) => {
    setScanning(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setScanPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { imageBase64: base64 }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: 'Scan Issue',
          description: data.error,
          variant: 'destructive'
        });
        return;
      }

      if (data.success && data.data) {
        const { receiptNumber, items, totalAmount } = data.data;
        
        if (receiptNumber) setReceiptCode(receiptNumber);
        if (items) setItemsDescription(items);
        if (totalAmount) setClaimedAmount(String(totalAmount));
        
        const filledFields = [receiptNumber, items, totalAmount].filter(Boolean).length;
        
        toast({
          title: 'Receipt Scanned',
          description: filledFields > 0 
            ? `Extracted ${filledFields} field${filledFields > 1 ? 's' : ''}. Please verify.`
            : 'Could not extract details. Please enter manually.',
          variant: filledFields > 0 ? 'default' : 'destructive'
        });
      }
    } catch (err) {
      console.error('Scan error:', err);
      toast({
        title: 'Scan Failed',
        description: 'Could not scan receipt. Please enter details manually.',
        variant: 'destructive'
      });
    } finally {
      setScanning(false);
      setTimeout(() => setScanPreview(null), 3000);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid File',
          description: 'Please select an image file',
          variant: 'destructive'
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: 'Please select an image under 10MB',
          variant: 'destructive'
        });
        return;
      }
      handleScanReceipt(file);
    }
    e.target.value = '';
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const previousLimit = loanLimit?.available_limit || 0;
    setSubmitting(true);

    const { data: receiptNumber, error: findError } = await supabase
      .from('receipt_numbers')
      .select('id, status, vendor_amount')
      .eq('receipt_code', receiptCode.toUpperCase().trim())
      .maybeSingle();

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
        description: 'This receipt has already been submitted',
        variant: 'destructive'
      });
      setSubmitting(false);
      return;
    }

    const { error: submitError } = await supabase
      .from('user_receipts')
      .insert({
        user_id: userId,
        receipt_number_id: receiptNumber.id,
        items_description: itemsDescription.trim(),
        claimed_amount: parseFloat(claimedAmount)
      });

    if (submitError) {
      toast({
        title: 'Error',
        description: submitError.message,
        variant: 'destructive'
      });
    } else {
      fireSuccess();
      
      toast({
        title: '🎉 Receipt Submitted!',
        description: 'Your loan limit will increase by 20% of the amount after verification.'
      });
      setReceiptCode('');
      setItemsDescription('');
      setClaimedAmount('');
      
      await fetchData();
      const newLimit = loanLimit?.available_limit || 0;
      if (newLimit > previousLimit) {
        setLastIncrease(newLimit - previousLimit);
        setTimeout(() => setLastIncrease(null), 5000);
      }
    }

    setSubmitting(false);
  };

  const availableLimit = Math.min(loanLimit?.available_limit || 0, MAX_LOAN_LIMIT);
  const progressPercent = (availableLimit / MAX_LOAN_LIMIT) * 100;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-secondary/5 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Hero Section - Benefits */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Post Your Shopping Receipt</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Shop anywhere, submit your receipt, and unlock amazing benefits!
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
            <div className="p-1.5 rounded-full bg-success/20">
              <Home className="h-3.5 w-3.5 text-success" />
            </div>
            <div>
              <p className="text-xs font-semibold text-success">Save on Rent</p>
              <p className="text-[10px] text-muted-foreground">Up to 70% off</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
            <div className="p-1.5 rounded-full bg-primary/20">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary">Grow Loan Limit</p>
              <p className="text-[10px] text-muted-foreground">+20% per receipt</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20">
            <div className="p-1.5 rounded-full bg-warning/20">
              <Gift className="h-3.5 w-3.5 text-warning" />
            </div>
            <div>
              <p className="text-xs font-semibold text-warning">Earn Rewards</p>
              <p className="text-[10px] text-muted-foreground">Points & cashback</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 border border-secondary/40">
            <div className="p-1.5 rounded-full bg-secondary/50">
              <ShoppingBag className="h-3.5 w-3.5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-xs font-semibold">Shop Anywhere</p>
              <p className="text-[10px] text-muted-foreground">Any store works</p>
            </div>
          </div>
        </div>

        {/* Current Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="h-3.5 w-3.5 text-success" />
              <span className="text-[10px] font-medium text-muted-foreground">Rent Discount</span>
            </div>
            <p className="text-lg font-bold text-success">{rentDiscount}%</p>
            <p className="text-[10px] text-muted-foreground">This month</p>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-medium text-muted-foreground">Loan Limit</span>
              {lastIncrease && lastIncrease > 0 && (
                <Badge variant="secondary" className="text-[8px] h-4 px-1 text-success">
                  <TrendingUp className="h-2 w-2 mr-0.5" />
                  +{formatUGX(lastIncrease)}
                </Badge>
              )}
            </div>
            {loadingLimit ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <p className="text-lg font-bold">{formatUGX(availableLimit)}</p>
                <Progress value={progressPercent} className="h-1 mt-1" />
              </>
            )}
          </div>
        </div>

        {/* AI Scanner */}
        <div className="p-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI Receipt Scanner</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">FAST</Badge>
          </div>
          
          {scanning ? (
            <div className="flex items-center justify-center gap-3 p-3">
              {scanPreview && (
                <img src={scanPreview} alt="Scanning" className="h-12 w-12 object-cover rounded opacity-60" />
              )}
              <div className="text-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mb-1" />
                <span className="text-xs">Scanning receipt...</span>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                Take Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture');
                    fileInputRef.current.click();
                    fileInputRef.current.setAttribute('capture', 'environment');
                  }
                }}
              >
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </div>
          )}
        </div>

        {/* Manual Form */}
        <form onSubmit={handleSubmitReceipt} className="space-y-3">
          <div className="text-center">
            <span className="text-xs text-muted-foreground">Or enter details manually</span>
          </div>
          
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="dashboard-receipt-code" className="text-xs">Receipt Number</Label>
              <Input
                id="dashboard-receipt-code"
                placeholder="WL-001234"
                value={receiptCode}
                onChange={(e) => setReceiptCode(e.target.value.toUpperCase())}
                required
                className="font-mono uppercase h-9 text-sm"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="dashboard-amount" className="text-xs">Amount (UGX)</Label>
                <Input
                  id="dashboard-amount"
                  type="number"
                  placeholder="50000"
                  value={claimedAmount}
                  onChange={(e) => setClaimedAmount(e.target.value)}
                  required
                  min="1000"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dashboard-items" className="text-xs">Items Bought</Label>
                <Input
                  id="dashboard-items"
                  placeholder="Groceries, food..."
                  value={itemsDescription}
                  onChange={(e) => setItemsDescription(e.target.value)}
                  required
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
          
          <Button type="submit" className="w-full gap-2" disabled={submitting || scanning}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Submit Receipt & Earn Benefits
              </>
            )}
          </Button>
        </form>

        {/* View All Link */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full gap-1.5 text-xs text-muted-foreground" 
          onClick={() => navigate('/my-receipts')}
        >
          View All Receipts & History
          <ArrowRight className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
