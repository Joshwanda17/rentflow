import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, subDays, startOfDay } from "date-fns";
import { 
  ArrowLeft, ClipboardList, Search, ChevronLeft, ChevronRight, 
  Filter, Calendar, Users, Shield, Wallet, Home,
  Plus, Minus, ToggleLeft, ToggleRight, Check, X, RefreshCw,
  TrendingUp, Activity, Radio
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface AuditLog {
  id: string;
  action_type: string;
  table_name: string;
  record_id: string;
  performed_by: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 25;

export default function AuditLog() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<string>("7days");
  const [isLive, setIsLive] = useState(true);
  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set());
  const [performerFilter, setPerformerFilter] = useState<string>("all");

  // Check if user is manager
  const { data: isManager } = useQuery({
    queryKey: ["is-manager", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "manager")
        .single();
      return !!data;
    },
    enabled: !!user?.id,
  });

  // Calculate date filter
  const dateFilter = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "today":
        return startOfDay(now);
      case "7days":
        return subDays(now, 7);
      case "30days":
        return subDays(now, 30);
      case "90days":
        return subDays(now, 90);
      default:
        return subDays(now, 7);
    }
  }, [dateRange]);

  // Fetch audit logs
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs-page", page, actionFilter, tableFilter, dateFilter, performerFilter],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .gte("created_at", dateFilter.toISOString())
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (actionFilter !== "all") {
        query = query.eq("action_type", actionFilter);
      }
      if (tableFilter !== "all") {
        query = query.eq("table_name", tableFilter);
      }
      if (performerFilter !== "all") {
        query = query.eq("performed_by", performerFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: isManager === true,
  });

  // Real-time subscription for new audit logs
  useEffect(() => {
    if (!isManager || !isLive) return;

    const channel = supabase
      .channel('audit-logs-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs'
        },
        (payload) => {
          const newLog = payload.new as AuditLog;
          
          // Add to new entries for highlight effect
          setNewEntryIds(prev => new Set([...prev, newLog.id]));
          
          // Clear highlight after 5 seconds
          setTimeout(() => {
            setNewEntryIds(prev => {
              const next = new Set(prev);
              next.delete(newLog.id);
              return next;
            });
          }, 5000);
          
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["audit-logs-page"] });
          queryClient.invalidateQueries({ queryKey: ["audit-stats"] });
          
          // Show toast notification
          toast.info("New activity logged", {
            description: `${newLog.action_type} on ${newLog.table_name}`,
            duration: 3000
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isManager, isLive, queryClient]);

  // Fetch managers for name lookup
  const { data: profiles } = useQuery({
    queryKey: ["profiles-for-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name");
      if (error) throw error;
      return data;
    },
    enabled: isManager === true,
  });

  // Fetch unique performers from audit logs
  const { data: performers } = useQuery({
    queryKey: ["audit-performers", dateFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("performed_by")
        .gte("created_at", dateFilter.toISOString());
      
      if (error) throw error;
      
      // Get unique performer IDs
      const uniqueIds = [...new Set(data?.map(d => d.performed_by) || [])];
      return uniqueIds;
    },
    enabled: isManager === true,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["audit-stats", dateFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("action_type, table_name")
        .gte("created_at", dateFilter.toISOString());
      
      if (error) throw error;
      
      const actionCounts: Record<string, number> = {};
      const tableCounts: Record<string, number> = {};
      
      data?.forEach(log => {
        actionCounts[log.action_type] = (actionCounts[log.action_type] || 0) + 1;
        tableCounts[log.table_name] = (tableCounts[log.table_name] || 0) + 1;
      });
      
      return { 
        total: data?.length || 0, 
        actionCounts, 
        tableCounts 
      };
    },
    enabled: isManager === true,
  });

  const getProfileName = (userId: string) => {
    const profile = profiles?.find((p) => p.id === userId);
    return profile?.full_name || "System";
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "role_added":
        return <Plus className="h-4 w-4 text-success" />;
      case "role_removed":
        return <Minus className="h-4 w-4 text-destructive" />;
      case "role_enabled":
        return <ToggleRight className="h-4 w-4 text-success" />;
      case "role_disabled":
        return <ToggleLeft className="h-4 w-4 text-muted-foreground" />;
      case "approve":
        return <Check className="h-4 w-4 text-success" />;
      case "reject":
        return <X className="h-4 w-4 text-destructive" />;
      case "update":
        return <RefreshCw className="h-4 w-4 text-primary" />;
      case "create":
        return <Plus className="h-4 w-4 text-primary" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      role_added: { className: "bg-success/20 text-success border-success/30", label: "Role Added" },
      role_removed: { className: "bg-destructive/20 text-destructive border-destructive/30", label: "Role Removed" },
      role_enabled: { className: "bg-success/20 text-success border-success/30", label: "Enabled" },
      role_disabled: { className: "bg-muted text-muted-foreground", label: "Disabled" },
      approve: { className: "bg-success/20 text-success border-success/30", label: "Approved" },
      reject: { className: "bg-destructive/20 text-destructive border-destructive/30", label: "Rejected" },
      update: { className: "bg-primary/20 text-primary border-primary/30", label: "Updated" },
      create: { className: "bg-primary/20 text-primary border-primary/30", label: "Created" },
    };
    
    const variant = variants[action] || { className: "bg-muted", label: action };
    return (
      <Badge variant="outline" className={`text-xs ${variant.className}`}>
        {variant.label}
      </Badge>
    );
  };

  const getTableIcon = (table: string) => {
    switch (table) {
      case "user_roles":
        return <Shield className="h-4 w-4" />;
      case "deposit_requests":
      case "wallets":
        return <Wallet className="h-4 w-4" />;
      case "rent_requests":
        return <Home className="h-4 w-4" />;
      case "profiles":
        return <Users className="h-4 w-4" />;
      default:
        return <ClipboardList className="h-4 w-4" />;
    }
  };

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    if (!searchTerm) return logs;
    
    const term = searchTerm.toLowerCase();
    return logs.filter((log) => {
      const performerName = getProfileName(log.performed_by).toLowerCase();
      const userName = (log.metadata?.user_name as string)?.toLowerCase() || "";
      return (
        log.action_type.toLowerCase().includes(term) ||
        log.table_name.toLowerCase().includes(term) ||
        performerName.includes(term) ||
        userName.includes(term) ||
        log.reason?.toLowerCase().includes(term)
      );
    });
  }, [logs, searchTerm, profiles]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (isManager === false) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Audit Log
            </h1>
            <p className="text-xs text-muted-foreground">Track all system changes</p>
          </div>
          
          {/* Live indicator toggle */}
          <Button 
            variant={isLive ? "default" : "outline"} 
            size="sm" 
            onClick={() => setIsLive(!isLive)}
            className={`gap-1.5 ${isLive ? 'bg-success hover:bg-success/90' : ''}`}
          >
            <Radio className={`h-3.5 w-3.5 ${isLive ? 'animate-pulse' : ''}`} />
            {isLive ? 'Live' : 'Paused'}
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{stats?.total || 0}</p>
                    <p className="text-xs text-muted-foreground">Total Actions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-gradient-to-br from-success/10 to-success/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-2xl font-bold">
                      {(stats?.actionCounts?.role_added || 0) + (stats?.actionCounts?.approve || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Positive Actions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by user, action, or table..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            
            {/* Filter Row */}
            <div className="flex flex-wrap gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[130px] h-9">
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7days">Last 7 days</SelectItem>
                  <SelectItem value="30days">Last 30 days</SelectItem>
                  <SelectItem value="90days">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[130px] h-9">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="role_added">Role Added</SelectItem>
                  <SelectItem value="role_removed">Role Removed</SelectItem>
                  <SelectItem value="role_enabled">Role Enabled</SelectItem>
                  <SelectItem value="role_disabled">Role Disabled</SelectItem>
                  <SelectItem value="approve">Approved</SelectItem>
                  <SelectItem value="reject">Rejected</SelectItem>
                  <SelectItem value="update">Updated</SelectItem>
                  <SelectItem value="create">Created</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Table" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tables</SelectItem>
                  <SelectItem value="user_roles">User Roles</SelectItem>
                  <SelectItem value="deposit_requests">Deposits</SelectItem>
                  <SelectItem value="rent_requests">Rent Requests</SelectItem>
                  <SelectItem value="loan_applications">Loans</SelectItem>
                  <SelectItem value="investment_accounts">Investments</SelectItem>
                  <SelectItem value="profiles">Profiles</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={performerFilter} onValueChange={setPerformerFilter}>
                <SelectTrigger className="w-[150px] h-9">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Performed by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Managers</SelectItem>
                  {performers?.map(performerId => {
                    const profile = profiles?.find(p => p.id === performerId);
                    return (
                      <SelectItem key={performerId} value={performerId}>
                        {profile?.full_name || "Unknown"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Activity Timeline</span>
              <span className="text-xs font-normal text-muted-foreground">
                {filteredLogs.length} entries
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No audit logs found</p>
                <p className="text-xs mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="divide-y">
                  {filteredLogs.map((log, index) => {
                    const isNew = newEntryIds.has(log.id);
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ 
                          opacity: 1, 
                          x: 0,
                          backgroundColor: isNew ? 'hsl(var(--success) / 0.15)' : 'transparent'
                        }}
                        transition={{ delay: index * 0.02 }}
                        className={`p-4 hover:bg-muted/30 transition-colors relative ${
                          isNew ? 'ring-1 ring-success/50' : ''
                        }`}
                      >
                        {isNew && (
                          <Badge className="absolute top-2 right-2 bg-success text-success-foreground text-[9px] px-1.5 py-0 animate-pulse">
                            NEW
                          </Badge>
                        )}
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-2 rounded-full bg-muted/50">
                          {getActionIcon(log.action_type)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getActionBadge(log.action_type)}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {getTableIcon(log.table_name)}
                              <span className="capitalize">
                                {log.table_name.replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>
                          
                          <div className="mt-1.5 text-sm">
                            {log.metadata?.user_name && (
                              <span className="font-medium">
                                {log.metadata.user_name as string}
                              </span>
                            )}
                            {log.new_values?.role && (
                              <span className="ml-1">
                                → <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {log.new_values.role as string}
                                </Badge>
                              </span>
                            )}
                            {log.old_values?.role && !log.new_values?.role && (
                              <span className="ml-1">
                                ← <Badge variant="outline" className="text-[10px] px-1.5 py-0 line-through opacity-60">
                                  {log.old_values.role as string}
                                </Badge>
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            <span>by {getProfileName(log.performed_by)}</span>
                            <span>•</span>
                            <span>{format(new Date(log.created_at), "MMM d, h:mm a")}</span>
                            {log.metadata?.bulk_action && (
                              <>
                                <span>•</span>
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                  Bulk ({log.metadata.total_users as number})
                                </Badge>
                              </>
                            )}
                          </div>
                          
                          {log.reason && (
                            <p className="text-xs text-muted-foreground mt-1.5 italic bg-muted/30 p-2 rounded">
                              "{log.reason}"
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(logs?.length || 0) < PAGE_SIZE}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
