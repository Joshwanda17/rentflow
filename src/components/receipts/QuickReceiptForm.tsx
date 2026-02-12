import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Loader2, FileText, ArrowRight, TrendingUp, CreditCard, Lightbulb, ChevronDown, ShoppingBag, Store, Percent, Clock, MapPin, Phone, Search, X, Camera, Upload, Sparkles } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useConfetti } from '@/components/Confetti';
import { QRScanner } from '@/components/receipts/QRScanner';
import { LoanLimitSuccessDialog } from '@/components/receipts/LoanLimitSuccessDialog';

interface QuickReceiptFormProps {
  userId: string;
  onSuccess?: () => void;
}

interface LoanLimit {
  total_verified_amount: number;
  available_limit: number;
  used_limit: number;
}

interface Vendor {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
}

const MAX_LOAN_LIMIT = 30000000;

export function QuickReceiptForm({ userId, onSuccess }: QuickReceiptFormProps) {
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
  const [showTips, setShowTips] = useState(false);
  const [showVendors, setShowVendors] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successData, setSuccessData] = useState<{
    previousLimit: number;
    newLimit: number;
    receiptAmount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLoanLimit();
  }, [userId]);

  useEffect(() => {
    if (showVendors && vendors.length === 0) {
      fetchVendors();
    }
  }, [showVendors]);

  const fetchLoanLimit = async () => {
    if (!userId) return;
    setLoadingLimit(true);
    
    // loan_limits table removed - stub
    setLoanLimit(null as any);
    setLoadingLimit(false);
  };

  const fetchVendors = async () => {
    setLoadingVendors(true);
    const { data } = await supabase
      .from('vendors')
      .select('id, name, location, phone')
      .eq('active', true)
      .order('name');
    
    setVendors(data || []);
    setLoadingVendors(false);
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
      fireSuccess();
      
      const submittedAmount = parseFloat(claimedAmount);
      
      setReceiptCode('');
      setItemsDescription('');
      setClaimedAmount('');
      
      await fetchLoanLimit();
      const newLimit = loanLimit?.available_limit || 0;
      const estimatedIncrease = submittedAmount * 0.2; // 20% of receipt amount
      const actualNewLimit = Math.max(newLimit, previousLimit + estimatedIncrease);
      
      // Show the success dialog with animated increase
      setSuccessData({
        previousLimit,
        newLimit: actualNewLimit,
        receiptAmount: submittedAmount,
      });
      setShowSuccessDialog(true);
      
      if (actualNewLimit > previousLimit) {
        setLastIncrease(actualNewLimit - previousLimit);
        setTimeout(() => setLastIncrease(null), 5000);
      }
      
      onSuccess?.();
    }

    setSubmitting(false);
  };

  const availableLimit = Math.min(loanLimit?.available_limit || 0, MAX_LOAN_LIMIT);
  const progressPercent = (availableLimit / MAX_LOAN_LIMIT) * 100;
  const remainingToMax = MAX_LOAN_LIMIT - availableLimit;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Quick Receipt Submission</CardTitle>
              <CardDescription className="text-xs">Submit receipts to grow your loan limit</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/my-receipts')} className="gap-1 text-xs h-8">
            View All
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Loan Limit Progress */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">Your Loan Limit</span>
            </div>
            {lastIncrease && lastIncrease > 0 && (
              <div className="flex items-center gap-1 text-success text-xs font-medium">
                <TrendingUp className="h-3 w-3" />
                +{formatUGX(lastIncrease)}
              </div>
            )}
          </div>
          
          {loadingLimit ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-base font-semibold">{formatUGX(availableLimit)}</span>
                <span className="text-xs text-muted-foreground">of {formatUGX(MAX_LOAN_LIMIT)}</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>{progressPercent.toFixed(1)}% unlocked</span>
                <span>{formatUGX(remainingToMax)} to max</span>
              </div>
              {loanLimit && loanLimit.used_limit > 0 && (
                <p className="text-xs text-warning mt-2">
                  Currently using: {formatUGX(loanLimit.used_limit)}
                </p>
              )}
            </>
          )}
        </div>

        {/* AI Receipt Scanner */}
        <div className="p-3 rounded-lg border border-border">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">AI Receipt Scanner</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">NEW</Badge>
          </div>
          
          {scanning ? (
            <div className="flex items-center gap-3 p-2.5 rounded-md bg-muted/50">
              {scanPreview && (
                <img src={scanPreview} alt="Scanning" className="h-10 w-10 object-cover rounded opacity-60" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs">Scanning receipt...</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Extracting details with AI</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 h-8 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-3.5 w-3.5" />
                Take Photo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 h-8 text-xs"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture');
                    fileInputRef.current.click();
                    fileInputRef.current.setAttribute('capture', 'environment');
                  }
                }}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </Button>
            </div>
          )}
          
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Auto-fill receipt details with a photo
          </p>
        </div>

        {/* Receipt Form */}
        <form onSubmit={handleSubmitReceipt} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-receipt-code" className="text-xs">Receipt Number</Label>
              <div className="flex gap-1.5">
                <Input
                  id="quick-receipt-code"
                  placeholder="WL-001234"
                  value={receiptCode}
                  onChange={(e) => setReceiptCode(e.target.value.toUpperCase())}
                  required
                  className="font-mono uppercase h-9 text-sm flex-1"
                />
                <QRScanner 
                  onScan={(code) => setReceiptCode(code.toUpperCase())}
                  buttonSize="sm"
                  buttonClassName="h-9 w-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-amount" className="text-xs">Amount (UGX)</Label>
              <Input
                id="quick-amount"
                type="number"
                placeholder="Enter amount"
                value={claimedAmount}
                onChange={(e) => setClaimedAmount(e.target.value)}
                required
                min="1000"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-items" className="text-xs">Items</Label>
              <Input
                id="quick-items"
                placeholder="Brief description..."
                value={itemsDescription}
                onChange={(e) => setItemsDescription(e.target.value)}
                required
                className="h-9 text-sm"
              />
            </div>
          </div>
          <Button type="submit" size="sm" className="w-full gap-2 h-9" disabled={submitting || scanning}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" />
                Submit Receipt
              </>
            )}
          </Button>
        </form>

        {/* Tips Section */}
        <Collapsible open={showTips} onOpenChange={setShowTips}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full gap-2 text-xs text-muted-foreground hover:text-foreground h-8">
              <Lightbulb className="h-3.5 w-3.5" />
              Tips to Maximize Your Limit
              <ChevronDown className={`h-3 w-3 ml-auto transition-transform duration-150 ${showTips ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-start gap-2">
                <div className="p-1 rounded bg-success/10 shrink-0">
                  <ShoppingBag className="h-3 w-3 text-success" />
                </div>
                <div>
                  <p className="text-xs font-medium">Shop at Partner Vendors</p>
                  <p className="text-[10px] text-muted-foreground">Each verified receipt adds 20% to your limit.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <div className="p-1 rounded bg-primary/10 shrink-0">
                  <Store className="h-3 w-3 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium">Choose Welile-Partnered Shops</p>
                  <p className="text-[10px] text-muted-foreground">Look for the Welile logo for faster verification.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <div className="p-1 rounded bg-warning/10 shrink-0">
                  <Percent className="h-3 w-3 text-warning" />
                </div>
                <div>
                  <p className="text-xs font-medium">Larger Purchases = Bigger Limits</p>
                  <p className="text-[10px] text-muted-foreground">UGX 500K receipt adds UGX 100K to your limit.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <div className="p-1 rounded bg-muted shrink-0">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-medium">Submit Promptly</p>
                  <p className="text-[10px] text-muted-foreground">Submit within 24 hours for fastest verification.</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Partner Vendors Section */}
        <Collapsible open={showVendors} onOpenChange={setShowVendors}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full gap-2 text-xs text-muted-foreground hover:text-foreground h-8">
              <Store className="h-3.5 w-3.5" />
              Partner Vendors
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                {vendors.length > 0 ? vendors.length : '...'}
              </Badge>
              <ChevronDown className={`h-3 w-3 ml-auto transition-transform duration-150 ${showVendors ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="p-2 bg-muted/30 border-b border-border">
                <p className="text-[10px] text-center text-muted-foreground">
                  <MapPin className="h-3 w-3 inline mr-1" />
                  Shop at these stores to grow your loan limit
                </p>
              </div>
              
              {vendors.length > 0 && (
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Search vendors..."
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      className="h-7 pl-7 pr-7 text-xs"
                    />
                    {vendorSearch && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setVendorSearch('')}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
              
              {loadingVendors ? (
                <div className="flex items-center justify-center gap-2 p-6">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Loading...</span>
                </div>
              ) : vendors.length === 0 ? (
                <div className="p-6 text-center">
                  <Store className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No partner vendors available yet.</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const filteredVendors = vendors.filter((vendor) => {
                      const searchLower = vendorSearch.toLowerCase();
                      return (
                        vendor.name.toLowerCase().includes(searchLower) ||
                        (vendor.location && vendor.location.toLowerCase().includes(searchLower))
                      );
                    });
                    
                    if (filteredVendors.length === 0) {
                      return (
                        <div className="p-6 text-center">
                          <Search className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-xs text-muted-foreground">No vendors match "{vendorSearch}"</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="text-xs mt-1 h-auto p-0"
                            onClick={() => setVendorSearch('')}
                          >
                            Clear search
                          </Button>
                        </div>
                      );
                    }
                    
                    return (
                      <ScrollArea className="h-[180px]">
                        <div className="divide-y divide-border">
                          {filteredVendors.map((vendor) => (
                            <div key={vendor.id} className="p-2.5 hover:bg-muted/30 transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{vendor.name}</p>
                                  {vendor.location && (
                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <MapPin className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">{vendor.location}</span>
                                    </p>
                                  )}
                                </div>
                                {vendor.phone && (
                                  <a 
                                    href={`tel:${vendor.phone}`}
                                    className="shrink-0 p-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                                  >
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    );
                  })()}
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      {/* Success Dialog */}
      {successData && (
        <LoanLimitSuccessDialog
          open={showSuccessDialog}
          onClose={() => {
            setShowSuccessDialog(false);
            setSuccessData(null);
          }}
          previousLimit={successData.previousLimit}
          newLimit={successData.newLimit}
          receiptAmount={successData.receiptAmount}
        />
      )}
    </Card>
  );
}