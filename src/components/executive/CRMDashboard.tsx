import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { MessageSquare, Clock, ThumbsUp, Users, AlertCircle, MailOpen } from 'lucide-react';
import { format } from 'date-fns';

export function CRMDashboard() {
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['exec-crm-notifications'],
    queryFn: async () => {
      const { data } = await supabase.from('notifications').select('id, title, message, type, is_read, created_at, user_id')
        .order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
    staleTime: 600000,
  });

  const rows = notifications || [];
  const unread = rows.filter(n => !n.is_read).length;
  const uniqueUsers = new Set(rows.map(n => n.user_id)).size;
  const supportType = rows.filter(n => n.type === 'support' || n.type === 'inquiry').length;

  const columns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (v) => v ? format(new Date(v as string), 'dd MMM HH:mm') : '—' },
    { key: 'title', label: 'Subject' },
    { key: 'type', label: 'Type', render: (v) => (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">{String(v)}</span>
    )},
    { key: 'is_read', label: 'Status', render: (v) => v ? '✅ Read' : '🔴 Unread' },
    { key: 'message', label: 'Preview', className: 'max-w-[180px] truncate' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard title="Total Inquiries" value={rows.length} icon={MessageSquare} loading={isLoading} />
        <KPICard title="Unread" value={unread} icon={MailOpen} loading={isLoading} color="bg-destructive/10 text-destructive" />
        <KPICard title="Unique Users" value={uniqueUsers} icon={Users} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Support Tickets" value={supportType} icon={AlertCircle} color="bg-amber-500/10 text-amber-600" />
        <KPICard title="Warning Alerts" value={rows.filter(n => n.type === 'warning').length} icon={Clock} color="bg-amber-500/10 text-amber-600" />
        <KPICard title="Read Rate" value={rows.length > 0 ? `${Math.round(rows.filter(n => n.is_read).length / rows.length * 100)}%` : '0%'} icon={ThumbsUp} color="bg-purple-500/10 text-purple-600" />
      </div>

      <ExecutiveDataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title="Customer Inquiries"
        filters={[
          {
            key: 'type',
            label: 'Type',
            options: [
              { value: 'support', label: 'Support' },
              { value: 'inquiry', label: 'Inquiry' },
              { value: 'alert', label: 'Alert' },
              { value: 'info', label: 'Info' },
            ],
          },
          {
            key: 'is_read',
            label: 'Status',
            options: [
              { value: 'true', label: 'Read' },
              { value: 'false', label: 'Unread' },
            ],
          },
        ]}
      />
    </div>
  );
}
