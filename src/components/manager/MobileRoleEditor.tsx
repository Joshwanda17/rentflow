import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserCog, Loader2, Plus, X, ShieldAlert, Check } from 'lucide-react';
import { toast } from 'sonner';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

const allRoles: { value: AppRole; label: string; emoji: string; description: string }[] = [
  { value: 'tenant', label: 'Tenant', emoji: '🏠', description: 'Request rent assistance' },
  { value: 'agent', label: 'Agent', emoji: '💼', description: 'Manage deposits & loans' },
  { value: 'landlord', label: 'Landlord', emoji: '🏢', description: 'Receive rent payments' },
  { value: 'supporter', label: 'Supporter', emoji: '💰', description: 'Invest & fund requests' },
  { value: 'manager', label: 'Manager', emoji: '👑', description: 'Full admin access' },
];

interface MobileRoleEditorProps {
  userId: string;
  userName: string;
  currentRoles: string[];
  roleEnabledStatus: Record<string, boolean>;
  onRolesUpdated?: () => void;
}

export function MobileRoleEditor({ 
  userId, 
  userName, 
  currentRoles, 
  roleEnabledStatus,
  onRolesUpdated 
}: MobileRoleEditorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>(currentRoles);
  const [enabledStatus, setEnabledStatus] = useState<Record<string, boolean>>(roleEnabledStatus);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmManagerRemoval, setConfirmManagerRemoval] = useState(false);

  const logRoleChange = async (actionType: string, role: string) => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        action_type: actionType,
        user_id: currentUser?.id,
        record_id: userId,
        table_name: 'user_roles',
        metadata: { role, user_name: userName, ...(actionType.includes('added') || actionType.includes('enabled') ? { new_values: { role } } : { old_values: { role } }) },
      });
    } catch (error) {
      console.error('Failed to log role change:', error);
    }
  };

  const sendNotification = async (role: string, action: 'added' | 'removed') => {
    try {
      const titles = {
        added: `✨ New Role: ${role}`,
        removed: `🔔 Role Removed: ${role}`
      };
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userIds: [userId],
          payload: { 
            title: titles[action], 
            body: action === 'added' 
              ? `You've been granted the ${role} role!`
              : `Your ${role} role has been removed.`,
            url: '/dashboard' 
          }
        }
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  };

  const handleAddRole = async (role: AppRole) => {
    hapticTap();
    setLoading(role);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      
      if (error) {
        if (error.code === '23505') {
          toast.error('User already has this role');
        } else {
          throw error;
        }
      } else {
        await logRoleChange('role_added', role);
        await sendNotification(role, 'added');
        setRoles(prev => [...prev, role]);
        setEnabledStatus(prev => ({ ...prev, [role]: true }));
        hapticSuccess();
        toast.success(`Added ${role} role`);
        onRolesUpdated?.();
      }
    } catch (error) {
      console.error('Error adding role:', error);
      toast.error('Failed to add role');
    } finally {
      setLoading(null);
    }
  };

  const handleRemoveRole = async (role: AppRole) => {
    if (roles.length <= 1) {
      toast.error('User must have at least one role');
      return;
    }
    
    if (role === 'manager') {
      setConfirmManagerRemoval(true);
      return;
    }
    
    hapticTap();
    setLoading(role);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: false })
        .eq('user_id', userId)
        .eq('role', role);
      
      if (error) throw error;
      
      await logRoleChange('role_removed', role);
      await sendNotification(role, 'removed');
      setRoles(prev => prev.filter(r => r !== role));
      hapticSuccess();
      toast.success(`Removed ${role} role`);
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error removing role:', error);
      toast.error('Failed to remove role');
    } finally {
      setLoading(null);
    }
  };

  const handleConfirmManagerRemoval = async () => {
    setLoading('manager');
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'manager');
      
      if (error) throw error;
      
      await logRoleChange('role_removed', 'manager');
      await sendNotification('manager', 'removed');
      setRoles(prev => prev.filter(r => r !== 'manager'));
      hapticSuccess();
      toast.success('Removed Manager role');
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error removing manager:', error);
      toast.error('Failed to remove Manager role');
    } finally {
      setLoading(null);
      setConfirmManagerRemoval(false);
    }
  };

  const handleToggleEnabled = async (role: AppRole) => {
    hapticTap();
    const currentEnabled = enabledStatus[role] ?? true;
    const newEnabled = !currentEnabled;
    
    const enabledCount = Object.entries(enabledStatus)
      .filter(([r, enabled]) => enabled && roles.includes(r) && r !== role).length;
    
    if (!newEnabled && enabledCount === 0) {
      toast.error('Must have at least one enabled dashboard');
      return;
    }
    
    setLoading(`toggle-${role}`);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: newEnabled })
        .eq('user_id', userId)
        .eq('role', role);
      
      if (error) throw error;
      
      setEnabledStatus(prev => ({ ...prev, [role]: newEnabled }));
      toast.success(newEnabled ? `Enabled ${role}` : `Disabled ${role}`);
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error toggling:', error);
      toast.error('Failed to update');
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="default" 
            className="h-14 gap-3 text-base font-semibold w-full"
            onClick={() => hapticTap()}
          >
            <UserCog className="h-5 w-5" />
            Edit Roles
            <Badge variant="secondary" className="ml-auto h-7 px-2.5 text-sm">
              {roles.length}
            </Badge>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-xl flex items-center gap-2">
              <UserCog className="h-6 w-6 text-primary" />
              Edit Roles for {userName.split(' ')[0]}
            </SheetTitle>
          </SheetHeader>
          
          <div className="space-y-3 overflow-y-auto pb-8" style={{ maxHeight: 'calc(85vh - 100px)' }}>
            {allRoles.map((role) => {
              const hasRole = roles.includes(role.value);
              const isEnabled = enabledStatus[role.value] ?? true;
              const isLoading = loading === role.value || loading === `toggle-${role.value}`;
              
              return (
                <div 
                  key={role.value}
                  className={`rounded-2xl border-2 p-4 transition-all ${
                    hasRole 
                      ? isEnabled 
                        ? 'border-primary/50 bg-primary/5' 
                        : 'border-muted bg-muted/30'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Left side - Role info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-3xl">{role.emoji}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-lg">{role.label}</span>
                          {hasRole && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                isEnabled 
                                  ? 'bg-success/20 text-success border-success/40' 
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {isEnabled ? 'Active' : 'Disabled'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {role.description}
                        </p>
                      </div>
                    </div>
                    
                    {/* Right side - Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      {hasRole ? (
                        <>
                          {/* Enable/Disable Toggle */}
                          <div className="flex flex-col items-center gap-1">
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={() => handleToggleEnabled(role.value)}
                              disabled={isLoading}
                              className="scale-125"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              {isEnabled ? 'On' : 'Off'}
                            </span>
                          </div>
                          
                          {/* Remove Button */}
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleRemoveRole(role.value)}
                            disabled={isLoading || roles.length <= 1}
                            className="h-12 w-12 rounded-xl"
                          >
                            {isLoading ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <X className="h-5 w-5" />
                            )}
                          </Button>
                        </>
                      ) : (
                        /* Add Button */
                        <Button
                          variant="default"
                          onClick={() => handleAddRole(role.value)}
                          disabled={isLoading}
                          className="h-12 px-5 rounded-xl gap-2 bg-success hover:bg-success/90 text-success-foreground"
                        >
                          {isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-5 w-5" />
                              Add
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Legend */}
            <div className="mt-6 p-4 rounded-xl bg-muted/50 border">
              <p className="text-sm text-muted-foreground text-center">
                <strong className="text-foreground">Toggle</strong> = Show/hide dashboard • 
                <strong className="text-foreground"> ✕</strong> = Remove role completely
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Manager Removal Confirmation */}
      <AlertDialog open={confirmManagerRemoval} onOpenChange={setConfirmManagerRemoval}>
        <AlertDialogContent className="max-w-[90vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive text-xl">
              <ShieldAlert className="h-6 w-6" />
              Remove Manager Access?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base space-y-3">
              <p>
                Remove <strong>Manager</strong> role from <strong>{userName}</strong>?
              </p>
              <p className="text-destructive font-medium">
                This revokes all admin access:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>User & role management</li>
                <li>Financial dashboard</li>
                <li>Approval powers</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel 
              disabled={loading === 'manager'}
              className="h-12 text-base"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmManagerRemoval}
              disabled={loading === 'manager'}
              className="h-12 text-base bg-destructive hover:bg-destructive/90"
            >
              {loading === 'manager' ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Manager Role'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default MobileRoleEditor;
