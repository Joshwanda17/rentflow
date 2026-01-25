import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { FileText } from 'lucide-react';
import { calculateRentRepayment, formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';

interface RentRequestFormProps {
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const MIN_DAYS = 7;
const MAX_DAYS = 120;

// Quick select options
const quickOptions = [
  { days: 7, label: '1 Week' },
  { days: 14, label: '2 Weeks' },
  { days: 30, label: '1 Month' },
  { days: 60, label: '2 Months' },
  { days: 90, label: '3 Months' },
  { days: 120, label: '4 Months' },
];

export default function RentRequestForm({ userId, onSuccess, onCancel }: RentRequestFormProps) {
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState(30);
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const calc = useMemo(() => {
    const amount = parseInt(rentAmount.replace(/,/g, '')) || 0;
    if (amount <= 0) return null;
    return calculateRentRepayment(amount, duration);
  }, [rentAmount, duration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calc) return;
    
    setLoading(true);

    // Create landlord
    const { data: landlord, error: landlordError } = await supabase
      .from('landlords')
      .insert({ name: landlordName, phone: landlordPhone, property_address: propertyAddress })
      .select('id')
      .single();

    if (landlordError) {
      toast({ title: 'Error', description: landlordError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Create LC1
    const { data: lc1, error: lc1Error } = await supabase
      .from('lc1_chairpersons')
      .insert({ name: lc1Name, phone: lc1Phone, village: lc1Village })
      .select('id')
      .single();

    if (lc1Error) {
      toast({ title: 'Error', description: lc1Error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Get referral agent ID from localStorage
    const agentId = localStorage.getItem('referral_agent_id');

    // Create rent request
    const { error: requestError } = await supabase.from('rent_requests').insert({
      tenant_id: userId,
      agent_id: agentId || null,
      landlord_id: landlord.id,
      lc1_id: lc1.id,
      rent_amount: calc.rentAmount,
      duration_days: calc.durationDays,
      access_fee: calc.accessFee,
      request_fee: calc.requestFee,
      total_repayment: calc.totalRepayment,
      daily_repayment: calc.dailyRepayment
    });

    if (requestError) {
      toast({ title: 'Error', description: requestError.message, variant: 'destructive' });
    } else {
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Rent Request Form
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Rent Amount */}
          <div className="space-y-2">
            <Label>Rent Amount (UGX)</Label>
            <Input 
              value={rentAmount} 
              onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))} 
              placeholder="e.g., 500000"
              required 
            />
          </div>

          {/* Quick Select Buttons */}
          <div className="space-y-2">
            <Label>Payback Period</Label>
            <div className="flex flex-wrap gap-2">
              {quickOptions.map((option) => (
                <Button
                  key={option.days}
                  type="button"
                  variant={duration === option.days ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDuration(option.days)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Days Slider */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Custom Days</Label>
              <span className="text-sm font-medium text-primary">{duration} days</span>
            </div>
            <Slider
              value={[duration]}
              onValueChange={(value) => setDuration(value[0])}
              min={MIN_DAYS}
              max={MAX_DAYS}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{MIN_DAYS} days</span>
              <span>{MAX_DAYS} days</span>
            </div>
          </div>

          {/* Calculation Preview */}
          {calc && (
            <div className="p-4 rounded-lg bg-secondary/50 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Rent Amount:</span>
                <span className="font-mono font-medium">{formatUGX(calc.rentAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Access Fee:</span>
                <span className="font-mono font-medium text-warning">{formatUGX(calc.accessFee)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Request Fee:</span>
                <span className="font-mono font-medium">{formatUGX(calc.requestFee)}</span>
              </div>
              <div className="border-t border-border pt-3">
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Daily Payment for {calc.durationDays} days</p>
                  <p className="text-2xl font-bold text-primary font-mono">{formatUGX(calc.dailyRepayment)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total: {formatUGX(calc.totalRepayment)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-medium">Landlord Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Landlord Name" value={landlordName} onChange={(e) => setLandlordName(e.target.value)} required />
              <Input placeholder="Landlord Phone" value={landlordPhone} onChange={(e) => setLandlordPhone(e.target.value)} required />
            </div>
            <Input placeholder="Property Address" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} required />
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">LC1 Chairperson Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input placeholder="LC1 Name" value={lc1Name} onChange={(e) => setLc1Name(e.target.value)} required />
              <Input placeholder="LC1 Phone" value={lc1Phone} onChange={(e) => setLc1Phone(e.target.value)} required />
              <Input placeholder="Village" value={lc1Village} onChange={(e) => setLc1Village(e.target.value)} required />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={loading || !calc} className="flex-1">
              {loading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
