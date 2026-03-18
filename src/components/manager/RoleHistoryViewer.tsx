import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { History, Plus, Minus, ToggleLeft, ToggleRight, User } from "lucide-react";

interface RoleHistoryEntry {
  id: string;
  action_type: string;
  old_values: { role?: string; enabled?: boolean } | null;
  new_values: { role?: string; enabled?: boolean } | null;
  performed_by: string;
  reason: string | null;
  created_at: string;
}

interface RoleHistoryViewerProps {
  userId: string;
  userName?: string;
}

const roleColors: Record<string, string> = {
  tenant: 'bg-primary/20 text-primary border-primary/30',
  agent: 'bg-warning/20 text-warning border-warning/30',
  landlord: 'bg-chart-5/20 text-chart-5 border-chart-5/30',
  supporter: 'bg-success/20 text-success border-success/30',
  manager: 'bg-destructive/20 text-destructive border-destructive/30',
};

const roleEmojis: Record<string, string> = {
  tenant: '🏠',
  agent: '💼',
  landlord: '🏢',
  supporter: '💰',
  manager: '👑',
};

export function RoleHistoryViewer({ userId, userName }: RoleHistoryViewerProps) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["role-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, user_id, action_type, metadata, created_at')
        .eq('record_id', userId)
        .in('action_type', ['role_added', 'role_removed', 'role_enabled', 'role_disabled'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map((log: any) => ({
        id: log.id,
        action_type: log.action_type,
        old_values: (log.metadata as any)?.old_values || null,
        new_values: (log.metadata as any)?.new_values || null,
        performed_by: log.user_id || '',
        reason: (log.metadata as any)?.reason || null,
        created_at: log.created_at,
      })) as RoleHistoryEntry[];
    },
  });

  const { data: managers } = useQuery({
    queryKey: ["managers-for-role-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name");
      if (error) throw error;
      return data;
    },
  });

  const getManagerName = (managerId: string) => {
    const manager = managers?.find((m) => m.id === managerId);
    return manager?.full_name || "System";
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "role_added":
        return <Plus className="h-3.5 w-3.5 text-success" />;
      case "role_removed":
        return <Minus className="h-3.5 w-3.5 text-destructive" />;
      case "role_enabled":
        return <ToggleRight className="h-3.5 w-3.5 text-success" />;
      case "role_disabled":
        return <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <History className="h-3.5 w-3.5" />;
    }
  };

  const getActionLabel = (entry: RoleHistoryEntry) => {
    const role = entry.new_values?.role || entry.old_values?.role || "unknown";
    switch (entry.action_type) {
      case "role_added":
        return `Added ${role}`;
      case "role_removed":
        return `Removed ${role}`;
      case "role_enabled":
        return `Enabled ${role}`;
      case "role_disabled":
        return `Disabled ${role}`;
      default:
        return entry.action_type;
    }
  };

  const getRole = (entry: RoleHistoryEntry) => {
    return entry.new_values?.role || entry.old_values?.role || "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No role history found</p>
        <p className="text-xs mt-1">Role changes will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <History className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-medium text-sm">Role History</h4>
        {userName && (
          <span className="text-xs text-muted-foreground">for {userName}</span>
        )}
      </div>
      
      <ScrollArea className="h-[250px]">
        <div className="space-y-2 pr-3">
          {history.map((entry) => {
            const role = getRole(entry);
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-card border border-border/50 hover:border-border transition-colors"
              >
                <div className="mt-0.5 p-1.5 rounded-full bg-muted/50">
                  {getActionIcon(entry.action_type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {getActionLabel(entry)}
                    </span>
                    {role && (
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] px-1.5 py-0 ${roleColors[role] || ''}`}
                      >
                        {roleEmojis[role]} {role}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{getManagerName(entry.performed_by)}</span>
                    <span>•</span>
                    <span>{format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                  </div>
                  
                  {entry.reason && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      "{entry.reason}"
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
