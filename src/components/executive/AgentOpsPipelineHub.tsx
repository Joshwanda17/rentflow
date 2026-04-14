import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, FileText, Home, Phone, MapPin } from 'lucide-react';
import { RentPipelineQueue } from './RentPipelineQueue';
import { SubAgentVerificationQueue } from './SubAgentVerificationQueue';
import { PromissoryNotesQueue } from './PromissoryNotesQueue';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function LandlordsPipeline() {
  const { data: landlords = [], isLoading } = useQuery({
    queryKey: ['pipeline-landlords'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rent_requests')
        .select('id, status, created_at, landlord_name, landlord_phone, property_address, profiles!rent_requests_user_id_fkey(full_name)')
        .not('status', 'in', '("funded","rejected","cancelled")')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      // Group by landlord phone
      const grouped = new Map<string, { name: string; phone: string; address: string; requests: typeof data }>();
      for (const r of data || []) {
        const key = r.landlord_phone || r.landlord_name || r.id;
        if (!grouped.has(key)) {
          grouped.set(key, { name: r.landlord_name || 'Unknown', phone: r.landlord_phone || '', address: r.property_address || '', requests: [] });
        }
        grouped.get(key)!.requests.push(r);
      }
      return Array.from(grouped.values());
    },
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground text-sm">Loading landlords...</div>;
  if (landlords.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">No landlords in pipeline</div>;

  return (
    <div className="space-y-2">
      {landlords.map((ll, i) => (
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
              <Badge variant="primary" size="sm">{ll.requests.length} request{ll.requests.length !== 1 ? 's' : ''}</Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {ll.requests.slice(0, 3).map(r => (
                <Badge key={r.id} variant="outline" size="sm">{r.status}</Badge>
              ))}
              {ll.requests.length > 3 && <Badge variant="muted" size="sm">+{ll.requests.length - 3}</Badge>}
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
        supabase.from('rent_requests').select('landlord_phone', { count: 'exact', head: true }).not('status', 'in', '("funded","rejected","cancelled")'),
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

      <TabsContent value="tenants"><RentPipelineQueue /></TabsContent>
      <TabsContent value="sub-agents"><SubAgentVerificationQueue /></TabsContent>
      <TabsContent value="notes"><PromissoryNotesQueue /></TabsContent>
      <TabsContent value="landlords"><LandlordsPipeline /></TabsContent>
    </Tabs>
  );
}
