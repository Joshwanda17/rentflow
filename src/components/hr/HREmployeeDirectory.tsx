import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, User } from 'lucide-react';

export default function HREmployeeDirectory() {
  const [search, setSearch] = useState('');

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_profiles')
        .select('*, profiles:user_id(full_name, email, phone)')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const filtered = employees.filter((emp: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = emp.profiles?.full_name?.toLowerCase() || '';
    const email = emp.profiles?.email?.toLowerCase() || '';
    const eid = emp.employee_id?.toLowerCase() || '';
    return name.includes(q) || email.includes(q) || eid.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Employee Directory</h2>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((emp: any) => (
            <Card key={emp.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {emp.profiles?.full_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {emp.profiles?.email} • {emp.employee_id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-[10px]">{emp.department || 'General'}</Badge>
                    <span className="text-[10px] text-muted-foreground">{emp.position || 'Staff'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No employees found</p>
          )}
        </div>
      )}
    </div>
  );
}
