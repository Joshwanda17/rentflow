import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, User, Phone, Mail, ChevronRight, Filter } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';

const INTERNAL_ROLES = ['manager', 'super_admin', 'employee', 'operations', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm', 'hr'] as const;

const roleColors: Record<string, string> = {
  manager: 'bg-primary/15 text-primary border-primary/20',
  super_admin: 'bg-destructive/15 text-destructive border-destructive/20',
  ceo: 'bg-warning/15 text-warning border-warning/20',
  coo: 'bg-success/15 text-success border-success/20',
  cfo: 'bg-accent/40 text-accent-foreground border-accent/30',
  cto: 'bg-primary/15 text-primary border-primary/20',
  cmo: 'bg-warning/15 text-warning border-warning/20',
  crm: 'bg-muted text-muted-foreground border-border',
  hr: 'bg-primary/10 text-primary border-primary/15',
  employee: 'bg-muted text-muted-foreground border-border',
  operations: 'bg-success/15 text-success border-success/20',
};

interface EmployeeRecord {
  user_id: string;
  roles: string[];
  enabled: boolean;
  profile: { full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null; verified: boolean } | null;
  staffProfile: { employee_id: string | null; department: string | null; position: string | null } | null;
}

export default function HREmployeeDirectory() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees-full'],
    queryFn: async () => {
      // Get all user_roles with internal roles
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('user_id, role, enabled')
        .in('role', INTERNAL_ROLES as unknown as string[]);

      if (!roleData || roleData.length === 0) return [];

      // Group by user_id
      const userMap = new Map<string, { roles: string[]; enabled: boolean }>();
      roleData.forEach((r: any) => {
        const existing = userMap.get(r.user_id);
        if (existing) {
          existing.roles.push(r.role);
          if (!r.enabled) existing.enabled = false;
        } else {
          userMap.set(r.user_id, { roles: [r.role], enabled: r.enabled });
        }
      });

      const userIds = Array.from(userMap.keys());

      // Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, verified')
        .in('id', userIds);

      // Fetch staff profiles
      const { data: staffProfiles } = await supabase
        .from('staff_profiles')
        .select('user_id, employee_id, department, position')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const staffMap = new Map((staffProfiles || []).map((s: any) => [s.user_id, s]));

      const result: EmployeeRecord[] = userIds.map((uid) => {
        const info = userMap.get(uid)!;
        const profile = profileMap.get(uid) || null;
        const staffProfile = staffMap.get(uid) || null;
        return {
          user_id: uid,
          roles: info.roles,
          enabled: info.enabled,
          profile,
          staffProfile,
        };
      });

      // Sort: enabled first, then alphabetically
      result.sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '');
      });

      return result;
    },
  });

  const filtered = employees.filter((emp) => {
    if (roleFilter !== 'all' && !emp.roles.includes(roleFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const name = emp.profile?.full_name?.toLowerCase() || '';
    const email = emp.profile?.email?.toLowerCase() || '';
    const phone = emp.profile?.phone || '';
    const eid = emp.staffProfile?.employee_id?.toLowerCase() || '';
    return name.includes(q) || email.includes(q) || phone.includes(q) || eid.includes(q);
  });

  const activeCount = filtered.filter(e => e.enabled).length;
  const disabledCount = filtered.filter(e => !e.enabled).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">Employee Directory</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {activeCount} active{disabledCount > 0 ? `, ${disabledCount} disabled` : ''} staff members
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[120px] h-9">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {INTERNAL_ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((emp) => (
            <Card key={emp.user_id} className={cn(
              "border-border/40 transition-all hover:border-border/70",
              !emp.enabled && "opacity-50"
            )}>
              <CardContent className="p-3.5">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    avatarUrl={emp.profile?.avatar_url}
                    fullName={emp.profile?.full_name}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {emp.profile?.full_name || 'Unknown User'}
                      </p>
                      {!emp.enabled && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-destructive/30 text-destructive">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {emp.profile?.email && (
                        <span className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                          <Mail className="h-2.5 w-2.5" />{emp.profile.email}
                        </span>
                      )}
                    </div>
                    {emp.profile?.phone && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <Phone className="h-2.5 w-2.5" />{emp.profile.phone}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {emp.roles.map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className={cn("text-[9px] h-4 px-1.5 capitalize", roleColors[role] || '')}
                        >
                          {role.replace('_', ' ')}
                        </Badge>
                      ))}
                      {emp.staffProfile?.department && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                          {emp.staffProfile.department}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-10">
              <User className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No employees found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
