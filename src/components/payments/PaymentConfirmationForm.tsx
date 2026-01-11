import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, Receipt, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface PaymentConfirmationFormProps {
  dashboardType: 'tenant' | 'supporter';
  onSuccess?: () => void;
}

export default function PaymentConfirmationForm({ dashboardType, onSuccess }: PaymentConfirmationFormProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [partner, setPartner] = useState<'mtn' | 'airtel' | ''>('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setScreenshot(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !amount || !partner || !transactionId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      let screenshotUrl = null;

      // Upload screenshot if provided
      if (screenshot) {
        const fileExt = screenshot.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('reviews')
          .upload(fileName, screenshot);

        if (uploadError) {
          console.error('Upload error:', uploadError);
        } else {
          const { data: urlData } = supabase.storage
            .from('reviews')
            .getPublicUrl(fileName);
          screenshotUrl = urlData.publicUrl;
        }
      }

      // Check if this transaction ID was already recorded by a manager (auto-verify)
      const { data: matchingRecord } = await supabase
        .from('manager_recorded_transactions')
        .select('id, amount')
        .ilike('transaction_id', transactionId.trim())
        .eq('payment_partner', partner)
        .eq('matched', false)
        .single();

      const isAutoVerified = !!matchingRecord;
      const confirmationStatus = isAutoVerified ? 'approved' : 'pending';

      // Insert payment confirmation
      const { data: newConfirmation, error } = await supabase
        .from('payment_confirmations')
        .insert({
          user_id: user.id,
          dashboard_type: dashboardType,
          payment_partner: partner,
          amount: parseFloat(amount),
          transaction_id: transactionId.trim(),
          screenshot_url: screenshotUrl,
          status: confirmationStatus,
          admin_note: isAutoVerified ? 'Auto-verified: Transaction ID matched manager records' : null,
          processed_at: isAutoVerified ? new Date().toISOString() : null
        })
        .select()
        .single();

      if (error) throw error;

      // If auto-verified, update the manager record and credit wallet
      if (isAutoVerified && matchingRecord && newConfirmation) {
        // Mark the manager record as matched
        await supabase
          .from('manager_recorded_transactions')
          .update({
            matched: true,
            matched_confirmation_id: newConfirmation.id,
            matched_at: new Date().toISOString()
          })
          .eq('id', matchingRecord.id);

        // Credit user's wallet
        const { data: walletData } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', user.id)
          .single();

        if (walletData) {
          await supabase
            .from('wallets')
            .update({ balance: walletData.balance + parseFloat(amount) })
            .eq('user_id', user.id);
        }

        // Create success notification
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: '✅ Payment Auto-Verified!',
          message: `Your payment of UGX ${parseFloat(amount).toLocaleString()} has been automatically verified and added to your wallet.`,
          type: 'success'
        });

        setSubmitted(true);
        toast.success('🎉 Payment verified automatically! Funds added to wallet.');
      } else {
        setSubmitted(true);
        toast.success('Payment confirmation submitted! We\'ll verify shortly.');
      }
      
      // Reset form after delay
      setTimeout(() => {
        setAmount('');
        setPartner('');
        setTransactionId('');
        setScreenshot(null);
        setScreenshotPreview(null);
        setSubmitted(false);
        onSuccess?.();
      }, 3000);

    } catch (error: any) {
      console.error('Error submitting payment:', error);
      toast.error(error.message || 'Failed to submit payment confirmation');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-success/50 bg-success/5">
        <CardContent className="py-8 text-center">
          <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Payment Submitted!</h3>
          <p className="text-muted-foreground">We'll verify your payment shortly.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          Confirm Your Payment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount Paid (UGX) *</Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g. 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner">Payment Partner *</Label>
              <Select value={partner} onValueChange={(v) => setPartner(v as 'mtn' | 'airtel')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn">MTN MoMo</SelectItem>
                  <SelectItem value="airtel">Airtel Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transactionId">Transaction ID *</Label>
            <Input
              id="transactionId"
              placeholder="Enter transaction reference"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="screenshot">Screenshot (Optional)</Label>
            <div className="flex items-center gap-3">
              <label className="flex-1 cursor-pointer">
                <div className="border-2 border-dashed rounded-lg p-4 text-center hover:bg-muted/50 transition-colors">
                  {screenshotPreview ? (
                    <img 
                      src={screenshotPreview} 
                      alt="Preview" 
                      className="max-h-24 mx-auto rounded"
                    />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">Tap to upload</p>
                    </>
                  )}
                </div>
                <input
                  id="screenshot"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              {screenshotPreview && (
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setScreenshot(null);
                    setScreenshotPreview(null);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            size="lg"
            disabled={isSubmitting || !amount || !partner || !transactionId}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Payment Confirmation'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
