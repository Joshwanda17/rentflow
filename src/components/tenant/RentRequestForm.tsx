import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { FileText } from 'lucide-react';
import { calculateRentRepayment, formatUGX } from '@/lib/rentCalculations';
import { generateRepaymentSchedule, insertRepaymentSchedule } from '@/lib/scheduleUtils';
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
  { days: 30, label: '30 Days' },
  { days: 60, label: '60 Days' },
  { days: 100, label: '100 Days' },
  { days: 120, label: '4 Months' },
];

export default function RentRequestForm({ userId, onSuccess, onCancel }: RentRequestFormProps) {
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState(30);
  const [numberOfPayments, setNumberOfPayments] = useState(4);
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Max payments based on duration
  const maxPayments = Math.min(duration, 30);

  const calc = useMemo(() => {
    const amount = parseInt(rentAmount.replace(/,/g, '')) || 0;
    if (amount <= 0) return null;
    return calculateRentRepayment(amount, duration);
  }, [rentAmount, duration]);

  // Adjust numberOfPayments if duration changes
  const handleDurationChange = (days: number) => {
    setDuration(days);
    const newMax = Math.min(days, 30);
    if (numberOfPayments > newMax) {
      setNumberOfPayments(Math.max(1, newMax));
    }
  };

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

    // Create rent request with number_of_payments
    const { data: rentRequest, error: requestError } = await supabase
      .from('rent_requests')
      .insert({
        tenant_id: userId,
        agent_id: agentId || null,
        landlord_id: landlord.id,
        lc1_id: lc1.id,
        rent_amount: calc.rentAmount,
        duration_days: calc.durationDays,
        access_fee: calc.accessFee,
        request_fee: calc.requestFee,
        total_repayment: calc.totalRepayment,
        daily_repayment: calc.dailyRepayment,
        number_of_payments: numberOfPayments,
        schedule_status: 'pending_acceptance',
      })
      .select('id')
      .single();

    if (requestError) {
      toast({ title: 'Error', description: requestError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Generate and insert repayment schedule
    const schedule = generateRepaymentSchedule(
      calc.totalRepayment,
      numberOfPayments,
      calc.durationDays
    );

    const scheduleResult = await insertRepaymentSchedule(
      supabase,
      rentRequest.id,
      userId,
      schedule
    );

    if (!scheduleResult.success) {
      toast({ title: 'Warning', description: 'Request created but schedule generation failed.', variant: 'destructive' });
    }

    onSuccess();
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
                  onClick={() => handleDurationChange(option.days)}
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
              onValueChange={(value) => handleDurationChange(value[0])}
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

          {/* Number of Payments */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Number of Payments</Label>
              <span className="text-sm font-medium text-primary">{numberOfPayments} payment{numberOfPayments > 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].filter(n => n <= maxPayments).map((num) => (
                <Button
                  key={num}
                  type="button"
                  variant={numberOfPayments === num ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNumberOfPayments(num)}
                  className="text-xs min-w-[40px]"
                >
                  {num}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Max {maxPayments} payments for {duration} days
            </p>
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
              <div className="border-t border-border pt-3 space-y-3">
                {/* Per Payment Amount */}
                <div className="p-3 rounded-lg bg-accent/20 border border-accent/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    {numberOfPayments} payment{numberOfPayments > 1 ? 's' : ''} of
                  </p>
                  <p className="text-xl font-bold text-accent-foreground font-mono">
                    {formatUGX(Math.ceil(calc.totalRepayment / numberOfPayments))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    every {Math.floor(calc.durationDays / numberOfPayments)} days
                  </p>
                </div>
                {/* Total */}
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total to Repay in {calc.durationDays} days</p>
                  <p className="text-2xl font-bold text-primary font-mono">{formatUGX(calc.totalRepayment)}</p>
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
