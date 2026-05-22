import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { CTOEmailsOverview } from './CTOEmailsOverview';
import { MessageSquare, Mail, Search, Users, AlertTriangle, ShieldCheck } from 'lucide-react';
import { KPICard } from './KPICard';
import { format } from 'date-fns';

type Partner = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  last_active_at: string | null;
  portfolios?: number;
};

const isInvalidEmail = (email: string | null | undefined) => {
  if (!email) return true;
  const e = email.trim().toLowerCase();
  if (!e) return true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return true;
  // Fallback / system-generated emails are not real inboxes
  if (e.includes('@noapp.welile.user')) return true;
  return false;
};

const isValidPhone = (phone: string | null | undefined) => {
  if (!phone) return false;
  const p = phone.trim();
  if (!p || p === '-') return false;
  // require at least 7 digits anywhere in the string
  const digits = p.replace(/\D/g, '');
  return digits.length >= 7;
};

export function CTOCommunicationOverview() {
  const [search, setSearch] = useState('');

  const { data: partners, isLoading } = useQuery({
    queryKey: ['cto-communication-partners'],
    queryFn: async () => {
      // A "partner" = a user who owns one or more investor portfolios.
      // Paginate to bypass the 1000-row default.
      const portfolioOwners = new Set<string>();
      const portfolioCount: Record<string, number> = {};
      const pageSize = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('investor_portfolios')
          .select('investor_id')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const r of data as any[]) {
          if (!r.investor_id) continue;
          portfolioOwners.add(r.investor_id);
          portfolioCount[r.investor_id] = (portfolioCount[r.investor_id] || 0) + 1;
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const ids = Array.from(portfolioOwners);
      if (ids.length === 0) return [] as Partner[];

      // Batch fetch profiles (chunks of 500 to be safe)
      const chunkSize = 500;
      const all: Partner[] = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone, email, created_at, last_active_at')
          .in('id', slice);
        if (error) throw error;
        for (const p of (data || []) as Partner[]) {
          all.push({ ...p, portfolios: portfolioCount[p.id] || 0 } as Partner);
        }
      }
      return all;
    },
    staleTime: 5 * 60_000,
  });

  const { smsOnly, emailReachable } = useMemo(() => {
    const list = partners || [];
    return {
      // SMS tab: every partner reachable by phone (regardless of email).
      // Email tab handles the inbox-reachable subset separately.
      smsOnly: list.filter((p) => isValidPhone(p.phone)),
      // Email tab: partners with a real, deliverable email
      emailReachable: list.filter((p) => !isInvalidEmail(p.email)),
    };
  }, [partners]);

  const filtered = (rows: Partner[]) => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (p) =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q),
    );
  };

  const baseColumns: Column<Partner>[] = [
    { key: 'full_name', label: 'Partner', render: (v) => (v as string) || '—' },
    { key: 'phone', label: 'Phone', render: (v) => (v as string) || '—' },
    {
      key: 'email',
      label: 'Email',
      render: (v) => {
        const e = (v as string) || '';
        if (!e) return <span className="text-muted-foreground italic">no email</span>;
        if (isInvalidEmail(e))
          return (
            <span className="text-amber-600 text-xs font-mono" title="Fallback / invalid email">
              {e}
            </span>
          );
        return <span className="text-xs font-mono">{e}</span>;
      },
    },
    {
      key: 'portfolios',
      label: 'Portfolios',
      render: (v) => <span className="font-medium">{Number(v ?? 0).toLocaleString()}</span>,
    },
    {
      key: 'last_active_at',
      label: 'Last Active',
      render: (v) => (v ? format(new Date(v as string), 'dd MMM yyyy') : '—'),
    },
    {
      key: 'created_at',
      label: 'Joined',
      render: (v) => (v ? format(new Date(v as string), 'dd MMM yyyy') : '—'),
    },
  ];

  const total = (partners || []).length;
  const smsCount = smsOnly.length;
  const emailCount = emailReachable.length;
  const noContact = (partners || []).filter((p) => isInvalidEmail(p.email) && !isValidPhone(p.phone)).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Communication
        </h2>
        <p className="text-xs text-muted-foreground">
          Route messages to the right channel. SMS for partners without a valid email, Email for those reachable by inbox — prevents redundant sends.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard
          title="Total Partners"
          value={total.toLocaleString()}
          icon={Users}
          loading={isLoading}
        />
        <KPICard
          title="SMS Only"
          value={smsCount.toLocaleString()}
          icon={MessageSquare}
          color="bg-amber-500/10 text-amber-600"
          subtitle="Reachable by phone"
          loading={isLoading}
        />
        <KPICard
          title="Email Reachable"
          value={emailCount.toLocaleString()}
          icon={Mail}
          color="bg-green-500/10 text-green-600"
          subtitle="Valid inbox on file"
          loading={isLoading}
        />
        <KPICard
          title="No Contact"
          value={noContact.toLocaleString()}
          icon={AlertTriangle}
          color={noContact > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}
          subtitle="No phone, no valid email"
          loading={isLoading}
        />
      </div>

      <Tabs defaultValue="sms" className="w-full">
        <TabsList variant="underline" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="sms" variant="underline" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {smsCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="email" variant="underline" className="gap-2">
            <Mail className="h-4 w-4" />
            Email
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {emailCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sms" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, phone, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Partners with a phone number on file — reachable via SMS.
            </span>
          </div>
          <ExecutiveDataTable
            data={filtered(smsOnly)}
            columns={baseColumns}
            loading={isLoading}
            title={`Partners reachable by SMS (${smsCount.toLocaleString()})`}
          />
        </TabsContent>

        <TabsContent value="email" className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, phone, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              Safe to email — valid inbox addresses only.
            </span>
          </div>
          <ExecutiveDataTable
            data={filtered(emailReachable)}
            columns={baseColumns}
            loading={isLoading}
            title={`Partners with a valid email (${emailCount.toLocaleString()})`}
          />

          <div className="pt-2 border-t border-border">
            <CTOEmailsOverview />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
