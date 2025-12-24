import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText } from 'lucide-react';
import { calculateRentRepayment, formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';

interface RentRequestFormProps {
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function RentRequestForm({ userId, onSuccess, onCancel }: RentRequestFormProps) {
  const [rentAmount, setRentAmount] = useState('');
  const [duration, setDuration] = useState<'30' | '60' | '90'>('30');
  const [landlordName, setLandlordName] = useState('');
  const [landlordPhone, setLandlordPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [lc1Name, setLc1Name] = useState('');
  const [lc1Phone, setLc1Phone] = useState('');
  const [lc1Village, setLc1Village] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const amount = parseInt(rentAmount.replace(/,/g, ''));
    const calc = calculateRentRepayment(amount, parseInt(duration) as 30 | 60 | 90);

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

  const amount = parseInt(rentAmount.replace(/,/g, '')) || 0;
  const calc = amount > 0 ? calculateRentRepayment(amount, parseInt(duration) as 30 | 60 | 90) : null;

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rent Amount (UGX)</Label>
              <Input value={rentAmount} onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9]/g, ''))} required />
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={(v) => setDuration(v as '30' | '60' | '90')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="60">60 Days</SelectItem>
                  <SelectItem value="90">90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {calc && (
            <div className="p-3 rounded-lg bg-primary/10 text-sm">
              Total: {formatUGX(calc.totalRepayment)} • Daily: {formatUGX(calc.dailyRepayment)}
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
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
