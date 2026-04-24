import { useState, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { hapticTap, hapticSuccess, hapticError } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion';
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

type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager' | 'ceo' | 'coo' | 'cfo' | 'cto' | 'cmo' | 'crm' | 'employee' | 'operations' | 'super_admin';

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
  { value: 'ceo', emoji: '👔', label: 'CEO' },
  { value: 'coo', emoji: '⚙️', label: 'COO' },
  { value: 'cfo', emoji: '💵', label: 'CFO' },
  { value: 'cto', emoji: '🖥️', label: 'CTO' },
  { value: 'cmo', emoji: '📣', label: 'CMO' },
  { value: 'crm', emoji: '🤝', label: 'CRM' },
  { value: 'employee', emoji: '🧑‍💼', label: 'Employee' },
  { value: 'operations', emoji: '🔧', label: 'Operations' },
  { value: 'super_admin', emoji: '🔑', label: 'Super Admin' },
];

const roleColors: Record<string, string> = {
  tenant: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  agent: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  supporter: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  landlord: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  manager: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  ceo: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  coo: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
  cfo: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  cto: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  cmo: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30',
  crm: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  employee: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
  operations: 'bg-lime-500/15 text-lime-600 dark:text-lime-400 border-lime-500/30',
  super_admin: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

const LONG_PRESS_DURATION = 600; // ms

// Swipeable Role Badge Component with Long Press
function SwipeableRoleBadge({
  role,
  roleInfo,
  isEnabled,
  isLoading,
  canRemove,
  onRemove,
}: {
  role: string;
  roleInfo: { value: AppRole; emoji: string; label: string } | undefined;
  isEnabled: boolean;
  isLoading: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-60, -30], [1, 0]);
  const deleteScale = useTransform(x, [-60, -30], [1, 0.8]);
  const badgeOpacity = useTransform(x, [-80, -60], [0.5, 1]);
  
  // Long press state
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDragging = useRef(false);
  
  const clearTimers = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    setLongPressProgress(0);
    setIsLongPressing(false);
  }, []);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!canRemove || isLoading) return;
    
    isDragging.current = false;
    setIsLongPressing(true);
    
    // Start progress animation
    const startTime = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100);
      setLongPressProgress(progress);
      
      // Haptic at 50% progress
      if (progress >= 50 && progress < 55) {
        hapticTap();
      }
    }, 16);
    
    // Trigger action after duration
    longPressTimer.current = setTimeout(() => {
      if (!isDragging.current) {
        hapticSuccess();
        onRemove();
      }
      clearTimers();
    }, LONG_PRESS_DURATION);
  }, [canRemove, isLoading, onRemove, clearTimers]);
  
  const handleTouchEnd = useCallback(() => {
    clearTimers();
  }, [clearTimers]);
  
  const handleTouchMove = useCallback(() => {
    // Cancel long press if finger moves (user is swiping)
    isDragging.current = true;
    clearTimers();
  }, [clearTimers]);
  
  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = -50;
    
    if (info.offset.x < threshold && canRemove) {
      hapticSuccess();
      animate(x, -100, { duration: 0.2 });
      setTimeout(() => {
        onRemove();
      }, 100);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 });
    }
  };

  return (
    <div className="relative overflow-visible">
      {/* Delete indicator behind the badge */}
      <motion.div 
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-2 pointer-events-none"
        style={{ opacity: deleteOpacity, scale: deleteScale }}
      >
        <div className="bg-destructive text-destructive-foreground rounded-full p-1.5">
          <Trash2 className="h-3 w-3" />
        </div>
      </motion.div>
      
      {/* Swipeable badge with long-press */}
      <motion.div
        drag={canRemove && !isLoading ? 'x' : false}
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        onDragStart={() => { isDragging.current = true; clearTimers(); }}
        style={{ x, opacity: badgeOpacity }}
        className="relative touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        <Badge 
          variant="outline"
          className={`text-xs font-semibold px-2.5 py-1.5 ${roleColors[role] || 'bg-muted'} ${!isEnabled ? 'opacity-40' : ''} flex items-center gap-1.5 select-none cursor-grab active:cursor-grabbing relative overflow-hidden`}
          style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          {/* Long press progress indicator */}
          {isLongPressing && canRemove && (
            <motion.div 
              className="absolute inset-0 bg-destructive/30 origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: longPressProgress / 100 }}
              transition={{ duration: 0.05 }}
            />
          )}
          
          <span className="relative z-10">
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>{roleInfo?.emoji}</span>
            )}
          </span>
          <span className={`relative z-10 ${!isEnabled ? 'line-through' : ''}`}>{role}</span>
          {!canRemove && (
            <span className="text-[10px] opacity-60 ml-0.5 relative z-10">•</span>
          )}
        </Badge>
      </motion.div>
    </div>
  );
}

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
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        action_type: actionType,
        user_id: currentUser?.id,
        record_id: userId,
        table_name: 'user_roles',
        metadata: { role, ...(actionType.includes('added') || actionType.includes('enabled') ? { new_values: { role } } : { old_values: { role } }) },
      });
    } catch (error) {
      console.error('Failed to log role change:', error);
    }
  };
  const fetchManagerIds = async (): Promise<string[]> => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager')
        .eq('enabled', true);
      return data ? [...new Set(data.map(r => r.user_id))] : [];
    } catch { return []; }
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
              url: '/dashboard/tenant',
              type: 'role_change'
            }
          }
        });
      } catch {}
      
      // Notify managers about role change (fire-and-forget)
      supabase.functions.invoke('send-push-notification', {
        body: { userIds: await fetchManagerIds(), payload: { title: '👤 Role Added', body: `${role} role added to ${userName}`, url: '/dashboard/manager', type: 'info' } }
      }).catch(() => {});
      
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
        .update({ enabled: false })
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
              url: '/dashboard/tenant',
              type: 'role_change'
            }
          }
        });
      } catch {}
      
      // Notify managers about role change (fire-and-forget)
      supabase.functions.invoke('send-push-notification', {
        body: { userIds: await fetchManagerIds(), payload: { title: '🔒 Role Removed', body: `${role} role removed from ${userName}`, url: '/dashboard/manager', type: 'info' } }
      }).catch(() => {});
      
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

  const handleSwipeRemove = (role: AppRole) => {
    if (!localRoles.includes(role)) return;
    
    // Prevent removing last role
    if (localRoles.length <= 1) {
      hapticError();
      toast.error('User must have at least one role');
      return;
    }
    
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
        className="flex flex-wrap items-center gap-2" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Swipe hint for mobile */}
        {localRoles.length > 1 && (
          <span className="text-[10px] text-muted-foreground/60 w-full mb-0.5 flex items-center gap-1.5">
            <span>← Swipe</span>
            <span className="opacity-50">or</span>
            <span>hold to remove</span>
          </span>
        )}
        
        {/* Swipeable Role Badges */}
        {localRoles.map((role) => {
          const roleInfo = roles.find(r => r.value === role);
          const isEnabled = roleEnabledStatus[role] ?? true;
          const isLoading = loadingRole === role;
          const canRemove = localRoles.length > 1;
          
          return (
            <SwipeableRoleBadge
              key={role}
              role={role}
              roleInfo={roleInfo}
              isEnabled={isEnabled}
              isLoading={isLoading}
              canRemove={canRemove}
              onRemove={() => handleSwipeRemove(role as AppRole)}
            />
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
                className="h-8 px-3 rounded-full bg-primary/10 border border-primary/30 flex items-center gap-1.5 hover:bg-primary/20 active:scale-95 transition-all touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Plus className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-primary">Add</span>
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-52 p-2" 
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
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted active:scale-[0.98] transition-all text-left touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    {loadingRole === role.value ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span className="text-xl">{role.emoji}</span>
                    )}
                    <span className="font-medium">{role.label}</span>
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
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <span className="text-2xl">{pendingRole?.emoji}</span>
              {confirmDialog.action === 'add' ? 'Add' : 'Remove'} {pendingRole?.label} Role
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {confirmDialog.action === 'add' ? (
                <>
                  Give <span className="font-semibold text-foreground">{userName}</span> the{' '}
                  <span className="font-semibold text-foreground">{pendingRole?.label}</span> role? 
                  They'll get access to {pendingRole?.label.toLowerCase()} features.
                </>
              ) : (
                <>
                  Remove <span className="font-semibold text-foreground">{pendingRole?.label}</span> from{' '}
                  <span className="font-semibold text-foreground">{userName}</span>? 
                  They'll lose access immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-2">
            <AlertDialogCancel 
              onClick={(e) => {
                e.stopPropagation();
                hapticTap();
              }}
              className="h-14 text-base font-semibold"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                handleConfirm();
              }}
              disabled={loadingRole !== null}
              className={`h-14 text-base font-semibold ${confirmDialog.action === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
            >
              {loadingRole ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : null}
              {confirmDialog.action === 'add' ? 'Add Role' : 'Remove Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}