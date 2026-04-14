import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Users, UserCheck, FileText, Home, Phone, MapPin, Search } from 'lucide-react';
import { RentPipelineQueue } from './RentPipelineQueue';
import { SubAgentVerificationQueue } from './SubAgentVerificationQueue';
import { PromissoryNotesQueue } from './PromissoryNotesQueue';

function LandlordsPipeline() {
  const [search, setSearch] = useState('');
  const { data: landlords = [], isLoading } = useQuery({
    queryKey: ['pipeline-landlords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, status, created_at, landlord_id, landlords!inner(id, full_name, phone, address)')
        .not('status', 'in', '("funded","rejected","cancelled")')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const grouped = new Map<string, { name: string; phone: string; address: string; statuses: string[] }>();
      for (const r of data || []) {
        const ll = r.landlords as any;
        const key = r.landlord_id;
        if (!grouped.has(key)) {
          grouped.set(key, { name: ll?.full_name || 'Unknown', phone: ll?.phone || '', address: ll?.address || '', statuses: [] });
        }
        grouped.get(key)!.statuses.push(r.status || 'pending');
      }
      return Array.from(grouped.values());
    },
  });

  const q = search.toLowerCase().trim();
  const filtered = landlords.filter(ll =>
    !q || ll.name.toLowerCase().includes(q) || ll.phone.includes(q) || ll.address.toLowerCase().includes(q)
  );

  if (isLoading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading landlords...</div>;
  if (landlords.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">No landlords in pipeline</div>;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, or address..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No matching landlords</p>}
      {filtered.map((ll, i) => (
        <Card key={i} className="border">
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{ll.name}</span>
                </div>
                {ll.phone && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">{ll.phone}</span>
                  </div>
                )}
                {ll.address && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{ll.address}</span>
                  </div>
                )}
              </div>
              <Badge variant="primary" size="sm">{ll.statuses.length} request{ll.statuses.length !== 1 ? 's' : ''}</Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {ll.statuses.slice(0, 3).map((s, j) => (
                <Badge key={j} variant="outline" size="sm">{s}</Badge>
              ))}
              {ll.statuses.length > 3 && <Badge variant="muted" size="sm">+{ll.statuses.length - 3}</Badge>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AgentOpsPipelineHub() {
  const { data: counts } = useQuery({
    queryKey: ['pipeline-counts'],
    queryFn: async () => {
      const [tenants, subAgents, notes, landlords] = await Promise.all([
        supabase.from('rent_requests').select('id', { count: 'exact', head: true }).not('status', 'in', '("funded","rejected","cancelled")'),
        supabase.from('agent_subagents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('promissory_notes').select('id', { count: 'exact', head: true }).in('status', ['pending', 'activated']),
        supabase.from('rent_requests').select('id', { count: 'exact', head: true }).not('status', 'in', '("funded","rejected","cancelled")'),
      ]);
      return {
        tenants: tenants.count || 0,
        subAgents: subAgents.count || 0,
        notes: notes.count || 0,
        landlords: landlords.count || 0,
      };
    },
  });

  const tabs = [
    { value: 'tenants', label: 'Tenants', icon: Users, count: counts?.tenants },
    { value: 'sub-agents', label: 'Sub-Agents', icon: UserCheck, count: counts?.subAgents },
    { value: 'notes', label: 'Promissory Notes', icon: FileText, count: counts?.notes },
    { value: 'landlords', label: 'Landlords', icon: Home, count: counts?.landlords },
  ];

  return (
    <Tabs defaultValue="tenants" className="space-y-4">
      <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
        <TabsList variant="pills" className="w-max">
          {tabs.map(t => (
            <TabsTrigger key={t.value} value={t.value} variant="pills" className="gap-1.5">
              <t.icon className="h-3.5 w-3.5" />
              <span className="text-xs">{t.label}</span>
              {t.count != null && t.count > 0 && (
                <Badge variant="primary" size="sm" className="ml-0.5 min-w-[18px] justify-center">{t.count}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="tenants"><RentPipelineQueue stage="pending" /></TabsContent>
      <TabsContent value="sub-agents"><SubAgentVerificationQueue /></TabsContent>
      <TabsContent value="notes"><PromissoryNotesQueue /></TabsContent>
      <TabsContent value="landlords"><LandlordsPipeline /></TabsContent>
    </Tabs>
  );
}
