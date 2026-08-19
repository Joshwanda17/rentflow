import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { departmentKeysForDashboard } from './departmentScope';

interface DeptNotification {
  id: string;
  department_key: string;
  department_name: string;
  cycle_title: string;
  deadline: string | null;
  title: string;
  message: string;
  link: string;
  created_at: string;
  is_read: boolean;
}

/**
 * Department-level budget notice bell. A single notice exists per budget cycle
 * per department; every user with dashboard access to that department sees it,
 * and read state is tracked per user.
 *
 * Pass `dashboard` (executive-hub tab slug, role slug, or dashboard permission
 * key) to scope the bell to that dashboard's own department(s). Scoping is
 * enforced server-side by `get_budget_department_notifications`.
 */
export function BudgetDepartmentNotificationBell({
  className,
  dashboard,
  departmentKeys,
}: {
  className?: string;
  dashboard?: string;
  departmentKeys?: string[];
}) {
  const [items, setItems] = useState<DeptNotification[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const scopedKeys = departmentKeys ?? departmentKeysForDashboard(dashboard);
  const scopeArg = scopedKeys && scopedKeys.length > 0 ? scopedKeys : null;
  const scopeSignature = scopeArg ? scopeArg.join(',') : '';

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_budget_department_notifications', {
      _department_keys: scopeSignature ? scopeSignature.split(',') : null,
    });
    if (error) {
      console.error('Failed to load department budget notices:', error);
      return;
    }
    setItems((data as DeptNotification[]) ?? []);
  }, [scopeSignature]);

  useEffect(() => { load(); }, [load]);

  const unread = items.filter(i => !i.is_read).length;

  const openItem = async (n: DeptNotification) => {
    setOpen(false);
    if (!n.is_read) {
      const { error } = await supabase.rpc('mark_budget_department_notification_read', {
        _notification_id: n.id,
      });
      if (error) console.error('Failed to mark notice read:', error);
      else setItems(prev => prev.map(i => (i.id === n.id ? { ...i, is_read: true } : i)));
    }
    const target = n.link && n.link !== '/budgets' ? n.link : `/budgets?department_key=${encodeURIComponent(n.department_key)}`;
    navigate(target);
  };

  const markAll = async () => {
    const pending = items.filter(i => !i.is_read);
    if (pending.length === 0) return;
    await Promise.all(
      pending.map(i =>
        supabase.rpc('mark_budget_department_notification_read', { _notification_id: i.id }),
      ),
    );
    setItems(prev => prev.map(i => ({ ...i, is_read: true })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Department budget notifications"
          className={cn('relative shrink-0', className)}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 rounded-2xl">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h3 className="text-sm font-bold">Department budgets</h3>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={markAll}>
              <Check className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto px-2 pb-2 space-y-1">
          {items.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">No budget notices for your departments.</p>
          )}
          {items.map(n => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-xl transition-colors',
                n.is_read ? 'opacity-60 hover:bg-accent/30' : 'bg-accent/40 hover:bg-accent/60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold leading-tight">{n.department_name}</p>
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
              </div>
              <p className="text-[11px] font-medium mt-0.5">{n.cycle_title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-3">{n.message}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })} · Open Department Budgets
              </p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
