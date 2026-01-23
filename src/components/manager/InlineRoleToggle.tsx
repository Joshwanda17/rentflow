import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { hapticTap, hapticSuccess, hapticError } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

interface InlineRoleToggleProps {
  userId: string;
  userName: string;
  currentRoles: string[];
  roleEnabledStatus: Record<string, boolean>;
  onRolesUpdated?: () => void;
}

const roles: { value: AppRole; emoji: string; label: string }[] = [
  { value: 'tenant', emoji: '🏠', label: 'Tenant' },
  { value: 'agent', emoji: '💼', label: 'Agent' },
  { value: 'landlord', emoji: '🏢', label: 'Landlord' },
  { value: 'supporter', emoji: '💰', label: 'Supporter' },
  { value: 'manager', emoji: '👑', label: 'Manager' },
];

const roleColors: Record<string, string> = {
  tenant: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  agent: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  supporter: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  landlord: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  manager: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
};

export function InlineRoleToggle({
  userId,
  userName,
  currentRoles,
  roleEnabledStatus,
  onRolesUpdated
}: InlineRoleToggleProps) {
  const { user } = useAuth();
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [localRoles, setLocalRoles] = useState<string[]>(currentRoles);
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: 'add' | 'remove';
    role: AppRole | null;
  }>({ open: false, action: 'add', role: null });

  const logRoleChange = async (actionType: string, role: string) => {
    if (!user?.id) return;
    
    try {
      await supabase.from('audit_logs').insert({
        action_type: actionType,
        table_name: 'user_roles',
        record_id: userId,
        performed_by: user.id,
        new_values: { role },
        metadata: { user_name: userName, inline_toggle: true }
      });
    } catch (error) {
      console.error('Failed to log role change:', error);
    }
  };

  const executeAddRole = async (role: AppRole) => {
    setLoadingRole(role);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      
      if (error) throw error;
      
      setLocalRoles(prev => [...prev, role]);
      await logRoleChange('role_added', role);
      
      // Send notification
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            userIds: [userId],
            payload: {
              title: `✨ New Role: ${roles.find(r => r.value === role)?.emoji} ${role}`,
              body: `You've been granted the ${role} role!`,
              url: '/dashboard',
              type: 'role_change'
            }
          }
        });
      } catch {}
      
      hapticSuccess();
      toast.success(`Added ${role} role to ${userName}`);
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error adding role:', error);
      hapticError();
      toast.error('Failed to add role');
    } finally {
      setLoadingRole(null);
    }
  };

  const executeRemoveRole = async (role: AppRole) => {
    setLoadingRole(role);
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);
      
      if (error) throw error;
      
      setLocalRoles(prev => prev.filter(r => r !== role));
      await logRoleChange('role_removed', role);
      
      // Send notification
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            userIds: [userId],
            payload: {
              title: `Role Removed: ${role}`,
              body: `Your ${role} role has been removed.`,
              url: '/dashboard',
              type: 'role_change'
            }
          }
        });
      } catch {}
      
      hapticSuccess();
      toast.success(`Removed ${role} role from ${userName}`);
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error removing role:', error);
      hapticError();
      toast.error('Failed to remove role');
    } finally {
      setLoadingRole(null);
    }
  };

  const handleAddRoleClick = (role: AppRole, e: React.MouseEvent) => {
    e.stopPropagation();
    if (localRoles.includes(role)) return;
    
    hapticTap();
    setPopoverOpen(false);
    setConfirmDialog({ open: true, action: 'add', role });
  };

  const handleRemoveRoleClick = (role: AppRole, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!localRoles.includes(role)) return;
    
    // Prevent removing last role
    if (localRoles.length <= 1) {
      hapticError();
      toast.error('User must have at least one role');
      return;
    }
    
    hapticTap();
    setConfirmDialog({ open: true, action: 'remove', role });
  };

  const handleConfirm = async () => {
    if (!confirmDialog.role) return;
    
    if (confirmDialog.action === 'add') {
      await executeAddRole(confirmDialog.role);
    } else {
      await executeRemoveRole(confirmDialog.role);
    }
    
    setConfirmDialog({ open: false, action: 'add', role: null });
  };

  const availableRoles = roles.filter(r => !localRoles.includes(r.value));
  const pendingRole = confirmDialog.role ? roles.find(r => r.value === confirmDialog.role) : null;

  return (
    <>
      <div 
        className="flex flex-wrap items-center gap-1.5" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Current Roles with Remove Button */}
        {localRoles.map((role) => {
          const roleInfo = roles.find(r => r.value === role);
          const isEnabled = roleEnabledStatus[role] ?? true;
          const isLoading = loadingRole === role;
          
          return (
            <div key={role} className="group relative">
              <Badge 
                variant="outline"
                className={`text-xs font-semibold pl-2 pr-1 py-1 ${roleColors[role] || 'bg-muted'} ${!isEnabled ? 'opacity-40' : ''} flex items-center gap-1`}
              >
                <span>{roleInfo?.emoji}</span>
                <span className={!isEnabled ? 'line-through' : ''}>{role}</span>
                <button
                  onClick={(e) => handleRemoveRoleClick(role as AppRole, e)}
                  disabled={isLoading || localRoles.length <= 1}
                  className="ml-0.5 p-1 rounded-full hover:bg-destructive/20 disabled:opacity-50 transition-colors touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </Badge>
            </div>
          );
        })}
        
        {/* Add Role Button with Popover */}
        {availableRoles.length > 0 && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  hapticTap();
                }}
                className="h-7 w-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center hover:bg-primary/20 active:scale-95 transition-all touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Plus className="h-4 w-4 text-primary" />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-48 p-2" 
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-2">Add Role</p>
              <div className="space-y-1">
                {availableRoles.map((role) => (
                  <button
                    key={role.value}
                    onClick={(e) => handleAddRoleClick(role.value, e)}
                    disabled={loadingRole === role.value}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-muted active:scale-[0.98] transition-all text-left touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    {loadingRole === role.value ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="text-lg">{role.emoji}</span>
                    )}
                    <span className="font-medium text-sm">{role.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog 
        open={confirmDialog.open} 
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingRole?.emoji}
              {confirmDialog.action === 'add' ? 'Add' : 'Remove'} {pendingRole?.label} Role
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'add' ? (
                <>
                  Are you sure you want to give <span className="font-semibold text-foreground">{userName}</span> the{' '}
                  <span className="font-semibold text-foreground">{pendingRole?.label}</span> role? 
                  They will receive a notification and gain access to {pendingRole?.label.toLowerCase()} features.
                </>
              ) : (
                <>
                  Are you sure you want to remove the{' '}
                  <span className="font-semibold text-foreground">{pendingRole?.label}</span> role from{' '}
                  <span className="font-semibold text-foreground">{userName}</span>? 
                  They will lose access to {pendingRole?.label.toLowerCase()} features immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={(e) => {
                e.stopPropagation();
                hapticTap();
              }}
              className="h-12"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                handleConfirm();
              }}
              disabled={loadingRole !== null}
              className={`h-12 ${confirmDialog.action === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
            >
              {loadingRole ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {confirmDialog.action === 'add' ? 'Add Role' : 'Remove Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
