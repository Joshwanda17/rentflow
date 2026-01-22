import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { UserCog, Loader2, Plus, Check, X, Sparkles, ShieldAlert, History } from 'lucide-react';
import { toast } from 'sonner';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { RoleHistoryViewer } from './RoleHistoryViewer';
import { useAuth } from '@/hooks/useAuth';

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

const allRoles: { value: AppRole; label: string; emoji: string; color: string }[] = [
  { value: 'tenant', label: 'Tenant', emoji: '🏠', color: 'bg-primary/20 text-primary border-primary/30' },
  { value: 'agent', label: 'Agent', emoji: '💼', color: 'bg-warning/20 text-warning border-warning/30' },
  { value: 'landlord', label: 'Landlord', emoji: '🏢', color: 'bg-chart-5/20 text-chart-5 border-chart-5/30' },
  { value: 'supporter', label: 'Supporter', emoji: '💰', color: 'bg-success/20 text-success border-success/30' },
  { value: 'manager', label: 'Manager', emoji: '👑', color: 'bg-destructive/20 text-destructive border-destructive/30' },
];

interface QuickRoleEditorProps {
  userId: string;
  userName: string;
  currentRoles: string[];
  roleEnabledStatus: Record<string, boolean>;
  onRolesUpdated?: () => void;
  compact?: boolean;
}

export function QuickRoleEditor({ 
  userId, 
  userName, 
  currentRoles, 
  roleEnabledStatus,
  onRolesUpdated,
  compact = false
}: QuickRoleEditorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>(currentRoles);
  const [enabledStatus, setEnabledStatus] = useState<Record<string, boolean>>(roleEnabledStatus);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmManagerRemoval, setConfirmManagerRemoval] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("roles");

  const sendRoleChangeNotification = async (role: string, action: 'added' | 'removed' | 'enabled' | 'disabled') => {
    try {
      const roleLabels: Record<string, string> = {
        tenant: '🏠 Tenant',
        agent: '💼 Agent', 
        landlord: '🏢 Landlord',
        supporter: '💰 Supporter',
        manager: '👑 Manager'
      };
      
      const messages: Record<string, { title: string; body: string }> = {
        added: {
          title: `✨ New Role: ${roleLabels[role] || role}`,
          body: `You've been granted the ${role} role! New features are now available in your dashboard.`
        },
        removed: {
          title: `🔔 Role Removed: ${roleLabels[role] || role}`,
          body: `Your ${role} role has been removed. Some features may no longer be accessible.`
        },
        enabled: {
          title: `✅ ${roleLabels[role] || role} Dashboard Enabled`,
          body: `Your ${role} dashboard has been enabled. You can now access it from the role switcher.`
        },
        disabled: {
          title: `⏸️ ${roleLabels[role] || role} Dashboard Disabled`,
          body: `Your ${role} dashboard has been temporarily disabled.`
        }
      };

      const { title, body } = messages[action];
      
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userIds: [userId],
          payload: { title, body, url: '/dashboard', type: 'role_change' }
        }
      });
    } catch (error) {
      console.error('Failed to send role notification:', error);
    }
  };

  const logRoleChange = async (actionType: string, role: string, oldEnabled?: boolean, newEnabled?: boolean) => {
    if (!user?.id) return;
    
    try {
      await supabase.from('audit_logs').insert({
        action_type: actionType,
        table_name: 'user_roles',
        record_id: userId,
        performed_by: user.id,
        old_values: actionType === 'role_removed' ? { role } : 
                    actionType === 'role_disabled' ? { role, enabled: true } :
                    actionType === 'role_enabled' ? { role, enabled: false } : null,
        new_values: actionType === 'role_added' ? { role } :
                    actionType === 'role_enabled' ? { role, enabled: true } :
                    actionType === 'role_disabled' ? { role, enabled: false } : null,
        metadata: { user_name: userName }
      });
    } catch (error) {
      console.error('Failed to log role change:', error);
    }
  };

  const executeRemoveRole = async (role: AppRole) => {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', role);
    
    if (error) throw error;
    
    await logRoleChange('role_removed', role);
    await sendRoleChangeNotification(role, 'removed');
    setRoles(prev => prev.filter(r => r !== role));
    toast.success(`Removed ${role} from ${userName}`);
    onRolesUpdated?.();
  };

  const handleToggleRole = async (role: AppRole) => {
    hapticTap();
    setLoading(role);
    
    const hasRole = roles.includes(role);
    
    try {
      if (hasRole) {
        // Remove role
        if (roles.length <= 1) {
          toast.error('User must have at least one role');
          setLoading(null);
          return;
        }
        
        // Show confirmation dialog for Manager role
        if (role === 'manager') {
          setLoading(null);
          setConfirmManagerRemoval(true);
          return;
        }
        
        await executeRemoveRole(role);
      } else {
        // Add role
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
          await sendRoleChangeNotification(role, 'added');
          setRoles(prev => [...prev, role]);
          setEnabledStatus(prev => ({ ...prev, [role]: true }));
          hapticSuccess();
          toast.success(`Added ${role} to ${userName}`);
          onRolesUpdated?.();
        }
      }
    } catch (error) {
      console.error('Error toggling role:', error);
      toast.error('Failed to update role');
    } finally {
      setLoading(null);
    }
  };

  const handleConfirmManagerRemoval = async () => {
    setLoading('manager');
    try {
      await executeRemoveRole('manager');
    } catch (error) {
      console.error('Error removing manager role:', error);
      toast.error('Failed to remove Manager role');
    } finally {
      setLoading(null);
      setConfirmManagerRemoval(false);
    }
  };

  const handleToggleEnabled = async (role: AppRole) => {
    hapticTap();
    setLoading(`toggle-${role}`);
    
    const currentEnabled = enabledStatus[role] ?? true;
    const newEnabled = !currentEnabled;
    
    // Check if this would disable all enabled roles
    const enabledRolesCount = Object.entries(enabledStatus).filter(([r, enabled]) => enabled && r !== role).length;
    if (!newEnabled && enabledRolesCount === 0) {
      toast.error('User must have at least one enabled dashboard');
      setLoading(null);
      return;
    }
    
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ enabled: newEnabled })
        .eq('user_id', userId)
        .eq('role', role);
      
      if (error) throw error;
      
      await logRoleChange(newEnabled ? 'role_enabled' : 'role_disabled', role);
      await sendRoleChangeNotification(role, newEnabled ? 'enabled' : 'disabled');
      setEnabledStatus(prev => ({ ...prev, [role]: newEnabled }));
      toast.success(newEnabled ? `Enabled ${role} for ${userName}` : `Disabled ${role} for ${userName}`);
      onRolesUpdated?.();
    } catch (error) {
      console.error('Error toggling enabled:', error);
      toast.error('Failed to update role status');
    } finally {
      setLoading(null);
    }
  };

  const activeRolesCount = roles.length;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size={compact ? "sm" : "default"}
            className={`gap-1.5 ${compact ? 'h-8 px-2' : 'h-10'}`}
            onClick={() => hapticTap()}
          >
            <UserCog className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {!compact && <span>Roles</span>}
            <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              {activeRolesCount}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm">Quick Role Editor</h4>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Manage roles for {userName}
            </p>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-9 rounded-none border-b">
              <TabsTrigger value="roles" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <UserCog className="h-3.5 w-3.5" />
                Roles
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5 data-[state=active]:bg-background">
                <History className="h-3.5 w-3.5" />
                History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="roles" className="m-0">
              <div className="p-2 space-y-1">
                {allRoles.map((role) => {
                  const hasRole = roles.includes(role.value);
                  const isEnabled = enabledStatus[role.value] ?? true;
                  const isLoading = loading === role.value || loading === `toggle-${role.value}`;
                  
                  return (
                    <div 
                      key={role.value}
                      className={`flex items-center justify-between p-2.5 rounded-lg transition-all ${
                        hasRole 
                          ? isEnabled 
                            ? 'bg-card border border-border' 
                            : 'bg-muted/30 border border-muted opacity-70'
                          : 'bg-muted/20 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{role.emoji}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{role.label}</span>
                            {hasRole && (
                              <Badge 
                                variant="outline" 
                                className={`text-[9px] px-1.5 py-0 ${
                                  isEnabled 
                                    ? 'bg-success/10 text-success border-success/30' 
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {isEnabled ? 'Active' : 'Disabled'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {hasRole && (
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => handleToggleEnabled(role.value)}
                            disabled={isLoading}
                            className="scale-75"
                          />
                        )}
                        <Button
                          variant={hasRole ? "destructive" : "default"}
                          size="sm"
                          onClick={() => handleToggleRole(role.value)}
                          disabled={isLoading || (hasRole && roles.length <= 1)}
                          className={`h-8 w-8 p-0 ${!hasRole ? 'bg-success hover:bg-success/90' : ''}`}
                        >
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : hasRole ? (
                            <X className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="p-2 border-t bg-muted/20">
                <p className="text-[10px] text-center text-muted-foreground">
                  Tap + to add • Tap ✕ to remove • Toggle to enable/disable
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="history" className="m-0 p-3">
              <RoleHistoryViewer userId={userId} />
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      {/* Manager Role Removal Confirmation */}
      <AlertDialog open={confirmManagerRemoval} onOpenChange={setConfirmManagerRemoval}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Remove Manager Access?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to remove the <strong>Manager</strong> role from <strong>{userName}</strong>.
              </p>
              <p className="text-destructive font-medium">
                This will revoke their admin access to the platform, including:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>User management and role editing</li>
                <li>Financial dashboard and reports</li>
                <li>Deposit and withdrawal approvals</li>
                <li>System-wide notifications</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading === 'manager'}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmManagerRemoval}
              disabled={loading === 'manager'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading === 'manager' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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