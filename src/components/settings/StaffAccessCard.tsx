import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Lock, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { STAFF_ROLES } from '@/lib/roleConstants';
import { roleDashboardRoutes } from '@/components/layout/executiveSidebarConfig';
import type { AppRole } from '@/hooks/auth/types';
import { getStaffSession, setStaffSession } from '@/lib/staffSessionCache';

const ADMIN_ACCESS_CODE = 'Manager@welile';

export default function StaffAccessCard() {
  const { user, roles, addRole, switchRole } = useAuth();
  const navigate = useNavigate();
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // If user already has a staff role, show a quick-switch button
  const existingStaffRoles = roles.filter(r => STAFF_ROLES.includes(r));
  const hasStaffAccess = existingStaffRoles.length > 0;

  const getStaffDashboardRoute = (staffRole: AppRole): string => {
    return roleDashboardRoutes[staffRole] || '/admin/dashboard';
  };

  const handleVerify = async () => {
    if (code !== ADMIN_ACCESS_CODE) {
      toast.error('Invalid access code');
      setCode('');
      return;
    }

    setLoading(true);
    try {
      // Grant the manager role as the entry point to staff
      const targetRole: AppRole = 'manager';
      if (!roles.includes(targetRole)) {
        const { error } = await addRole(targetRole);
        if (error) {
          toast.error(error.message);
          setLoading(false);
          return;
        }
      }

      // Log the staff access attempt
      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'staff_access_granted',
          metadata: { method: 'access_code', role: targetRole },
        }).then(() => {});
      }

      // Cache staff session for 24 hours
      if (user) setStaffSession(user.id, 'staff');

      switchRole(targetRole);
      toast.success('Staff access granted! Redirecting...');
      
      // Navigate directly to the manager dashboard
      const route = getStaffDashboardRoute(targetRole);
      navigate(route, { replace: true });
    } catch (err) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSwitch = (staffRole?: AppRole) => {
    const role = staffRole || existingStaffRoles[0];
    if (role) {
      switchRole(role);
      const route = getStaffDashboardRoute(role);
      navigate(route, { replace: true });
    } else {
      navigate('/staff-portal');
    }
  };

  return (
    <Card className="border-border/40 rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-warning" />
          <div>
            <CardTitle className="text-sm">Staff / Admin Access</CardTitle>
            <CardDescription className="text-xs">Switch to administrative dashboard</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasStaffAccess ? (
          <Button
            onClick={() => handleQuickSwitch()}
            className="w-full gap-2"
            variant="outline"
          >
            <Shield className="h-4 w-4" />
            Open Staff Portal
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
        ) : getStaffSession() ? (
          <Button
            onClick={() => {
              const session = getStaffSession();
              if (session) {
                const targetRole: AppRole = 'manager';
                if (roles.includes(targetRole)) {
                  switchRole(targetRole);
                  const route = getStaffDashboardRoute(targetRole);
                  navigate(route, { replace: true });
                } else {
                  // Session cached but role missing — re-grant
                  setShowCode(true);
                }
              }
            }}
            className="w-full gap-2"
            variant="outline"
          >
            <CheckCircle className="h-4 w-4 text-primary" />
            Continue as Staff
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
        ) : showCode ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter the admin access code to unlock staff features.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Access code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                className="flex-1"
              />
              <Button onClick={handleVerify} disabled={loading || !code} size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setShowCode(false); setCode(''); }} className="text-xs">
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setShowCode(true)}
            variant="outline"
            className="w-full gap-2"
          >
            <Lock className="h-4 w-4" />
            Unlock Admin Access
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
