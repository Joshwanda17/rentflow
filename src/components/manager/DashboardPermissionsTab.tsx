import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const DASHBOARDS = [
  { key: 'ceo', label: 'CEO Dashboard' },
  { key: 'cto', label: 'CTO Dashboard' },
  { key: 'cfo', label: 'CFO Dashboard' },
  { key: 'coo', label: 'COO Dashboard' },
  { key: 'cmo', label: 'CMO Dashboard' },
  { key: 'crm', label: 'CRM Dashboard' },
  { key: 'financial-ops', label: 'Financial Ops' },
  { key: 'company-ops', label: 'Company Staff' },
  { key: 'agent-ops', label: 'Agent Ops' },
  { key: 'tenant-ops', label: 'Tenant Ops' },
  { key: 'landlord-ops', label: 'Landlord Ops' },
  { key: 'partner-ops', label: 'Partner Ops' },
];

interface DashboardPermissionsTabProps {
  userId: string;
}

export default function DashboardPermissionsTab({ userId }: DashboardPermissionsTabProps) {
  const { user } = useAuth();
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('staff_permissions')
        .select('permitted_dashboard')
        .eq('user_id', userId);
      setGranted(new Set((data || []).map((p: any) => p.permitted_dashboard)));
      setLoading(false);
    };
    fetch();
  }, [userId]);

  const toggle = async (dashboard: string, checked: boolean) => {
    if (!user) return;
    setToggling(dashboard);

    try {
      if (checked) {
        await supabase.from('staff_permissions').insert({
          user_id: userId,
          permitted_dashboard: dashboard,
          granted_by: user.id,
        } as any);

        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'permission_granted',
          record_id: userId,
          metadata: { dashboard, granted_to: userId },
        });

        setGranted(prev => new Set([...prev, dashboard]));
        toast.success(`Access granted: ${dashboard}`);
      } else {
        await supabase
          .from('staff_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('permitted_dashboard', dashboard);

        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'permission_revoked',
          record_id: userId,
          metadata: { dashboard, revoked_from: userId },
        });

        setGranted(prev => {
          const next = new Set(prev);
          next.delete(dashboard);
          return next;
        });
        toast.success(`Access revoked: ${dashboard}`);
      }
    } catch {
      toast.error('Failed to update permission');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Dashboard Permissions</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Select which dashboards this staff member can access. Changes are logged for auditing.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DASHBOARDS.map((d) => (
          <div key={d.key} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
            {toggling === d.key ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Checkbox
                checked={granted.has(d.key)}
                onCheckedChange={(checked) => toggle(d.key, !!checked)}
              />
            )}
            <Label className="text-sm cursor-pointer">{d.label}</Label>
          </div>
        ))}
      </div>
    </div>
  );
}
