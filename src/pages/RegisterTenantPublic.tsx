import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, CheckCircle2, AlertCircle, Phone, User, CreditCard, Home, Banknote, Loader2 } from 'lucide-react';

export default function RegisterTenantPublic() {
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get('agent');
  const token = searchParams.get('token');

  const [agentInfo, setAgentInfo] = useState<{ name: string; phone: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');

  // Fetch agent info on mount
  useEffect(() => {
    async function fetchAgent() {
      if (!agentId || !token) {
        setError('Invalid link — missing agent or token.');
        setLoading(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', agentId)
          .maybeSingle();

        if (profile) {
          setAgentInfo({ name: profile.full_name || 'Welile Agent', phone: profile.phone || '' });
        }
      } catch {
        // Non-critical — just won't show agent info
      }
      setLoading(false);
    }
    fetchAgent();
  }, [agentId, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId || !token) return;

    setSubmitting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('submit-tenant-form', {
        body: {
          token,
          agent_id: agentId,
          full_name: fullName,
          phone,
          national_id: nationalId || undefined,
          rent_amount: rentAmount ? Number(rentAmount) : undefined,
          property_address: propertyAddress || undefined,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!agentId || !token) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="text-muted-foreground text-sm">This registration link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Registration Submitted!</h1>
          <p className="text-muted-foreground text-sm">
            Your details have been received. {agentInfo?.name ? `${agentInfo.name} will` : 'Your agent will'} follow up with you shortly.
          </p>
          <div className="pt-4">
            <p className="text-xs text-muted-foreground">Powered by <span className="font-semibold text-primary">Welile</span></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <UserPlus className="h-6 w-6" />
          <h1 className="text-xl font-bold">Tenant Registration</h1>
        </div>
        <p className="text-sm opacity-90">Fill in your details to get started with Welile</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-md mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="fullName" className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Full Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Alice Namono"
            required
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="on"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" /> Phone Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 0770 123 456"
            required
            autoComplete="tel"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nationalId" className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> National ID
          </Label>
          <Input
            id="nationalId"
            value={nationalId}
            onChange={e => setNationalId(e.target.value)}
            placeholder="e.g. CM12345678ABCD"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rentAmount" className="flex items-center gap-1.5">
            <Banknote className="h-3.5 w-3.5" /> Monthly Rent (UGX)
          </Label>
          <Input
            id="rentAmount"
            type="number"
            value={rentAmount}
            onChange={e => setRentAmount(e.target.value)}
            placeholder="e.g. 350000"
            min="0"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="propertyAddress" className="flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5" /> Property / Unit Address
          </Label>
          <Input
            id="propertyAddress"
            value={propertyAddress}
            onChange={e => setPropertyAddress(e.target.value)}
            placeholder="e.g. Plot 12, Bukoto Street"
            autoComplete="street-address"
          />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={submitting || !fullName || !phone}>
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
          ) : (
            <><UserPlus className="h-4 w-4" /> Submit Registration</>
          )}
        </Button>

        {/* Agent Footer */}
        {agentInfo && (
          <div className="mt-6 pt-4 border-t border-border/40 text-center space-y-1">
            <p className="text-xs text-muted-foreground">This form was shared by:</p>
            <p className="text-sm font-semibold">{agentInfo.name}</p>
            {agentInfo.phone && (
              <p className="text-xs text-muted-foreground">{agentInfo.phone}</p>
            )}
          </div>
        )}

        {/* Branding */}
        <div className="text-center pt-4">
          <p className="text-xs text-muted-foreground">Powered by <span className="font-semibold text-primary">Welile</span></p>
        </div>
      </form>
    </div>
  );
}
