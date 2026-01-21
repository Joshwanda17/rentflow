import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { hapticTap } from '@/lib/haptics';

interface VerifyTenantButtonProps {
  requestId: string;
  agentVerified?: boolean;
  managerVerified?: boolean;
  onVerified: () => void;
  variant?: 'agent' | 'manager';
}

export function VerifyTenantButton({ 
  requestId, 
  agentVerified, 
  managerVerified, 
  onVerified,
  variant = 'agent'
}: VerifyTenantButtonProps) {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(false);

  const isAgent = variant === 'agent';
  const isAlreadyVerified = isAgent ? agentVerified : managerVerified;
  const canVerify = isAgent ? role === 'agent' : role === 'manager';

  const handleVerify = async () => {
    if (!user || !canVerify) return;
    hapticTap();
    setLoading(true);

    try {
      const updateData = isAgent 
        ? {
            agent_verified: true,
            agent_verified_at: new Date().toISOString(),
            agent_verified_by: user.id
          }
        : {
            manager_verified: true,
            manager_verified_at: new Date().toISOString(),
            manager_verified_by: user.id
          };

      const { error } = await supabase
        .from('rent_requests')
        .update(updateData)
        .eq('id', requestId);

      if (error) throw error;

      toast.success(`Tenant ${isAgent ? 'agent' : 'manager'} verification complete!`);
      onVerified();
    } catch (error: any) {
      toast.error(error.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (isAlreadyVerified) {
    return (
      <Badge 
        variant="outline" 
        className={`gap-1 ${isAgent ? 'bg-success/10 text-success border-success/30' : 'bg-primary/10 text-primary border-primary/30'}`}
      >
        <CheckCircle2 className="h-3 w-3" />
        {isAgent ? 'Agent Verified' : 'Manager Verified'}
      </Badge>
    );
  }

  if (!canVerify) return null;

  return (
    <Button
      size="sm"
      variant={isAgent ? 'success' : 'default'}
      onClick={handleVerify}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Shield className="h-4 w-4" />
      )}
      Verify Tenant
    </Button>
  );
}
