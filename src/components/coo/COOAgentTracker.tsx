import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CollapsibleAgentSection } from '@/components/agent/CollapsibleAgentSection';
import { KPICard } from '@/components/executive/KPICard';
import { CashoutAgentActivity } from '@/components/cfo/CashoutAgentActivity';
import { formatUGX } from '@/lib/rentCalculations';
import { format, subDays, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  CalendarIcon, Users, Banknote, MapPin, AlertTriangle,
  Trophy, Activity, ClipboardList, TrendingUp, UserPlus,
  Eye, ShieldAlert, Loader2, BarChart3, Clock
} from 'lucide-react';

export function COOAgentTracker() {
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    daily: true, kpi: true, payment: false, defaulter: false,
    field: false, scorecard: false, redflags: false, cashout: false,
  });

  const toggleSection = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayStart = startOfDay(selectedDate).toISOString();
  const dayEnd = endOfDay(selectedDate).toISOString();
  const weekAgo = subDays(selectedDate, 7).toISOString();

  // --- Fetch agents (role = agent) ---
  const { data: agents = [] } = useQuery({
    queryKey: ['coo-agents-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role')
        .eq('role', 'agent');
      return data || [];
    },
  });

  // --- Rent requests (expected rent) ---
  const { data: rentRequests = [], isLoading: loadingRent } = useQuery({
    queryKey: ['coo-tracker-rent', selectedAgent],
    queryFn: async () => {
      let q = supabase
        .from('rent_requests')
        .select('id, user_id, monthly_rent, status, assigned_agent_id, created_at')
        .in('status', ['approved', 'active', 'disbursed', 'repaying']);
      if (selectedAgent !== 'all') q = q.eq('assigned_agent_id', selectedAgent);
      const { data } = await q;
      return data || [];
    },
  });

  // --- Collections today ---
  const { data: collections = [], isLoading: loadingCollections } = useQuery({
    queryKey: ['coo-tracker-collections', selectedAgent, dateStr],
    queryFn: async () => {
      let q = supabase
        .from('agent_collections')
        .select('id, agent_id, amount, tenant_id, created_at, payment_method')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);
      if (selectedAgent !== 'all') q = q.eq('agent_id', selectedAgent);
      const { data } = await q;
      return data || [];
    },
  });

  // --- Auto charges today ---
  const { data: autoCharges = [] } = useQuery({
    queryKey: ['coo-tracker-charges', selectedAgent, dateStr],
    queryFn: async () => {
      let q = supabase
        .from('subscription_charge_logs')
        .select('id, user_id, amount_charged, status, created_at')
        .eq('status', 'success')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);
      const { data } = await q;
      return data || [];
    },
  });

  // --- Visits today ---
  const { data: visits = [] } = useQuery({
    queryKey: ['coo-tracker-visits', selectedAgent, dateStr],
    queryFn: async () => {
      let q = supabase
        .from('agent_visits')
        .select('id, agent_id, tenant_id, location_name, latitude, longitude, checked_in_at')
        .gte('checked_in_at', dayStart)
        .lte('checked_in_at', dayEnd);
      if (selectedAgent !== 'all') q = q.eq('agent_id', selectedAgent);
      const { data } = await q;
      return data || [];
    },
  });

  // --- Landlords registered (lc1_chairpersons) ---
  const { data: newLandlords = [] } = useQuery({
    queryKey: ['coo-tracker-landlords', selectedAgent, dateStr],
    queryFn: async () => {
      let q = supabase
        .from('lc1_chairpersons')
        .select('id, registered_by, created_at')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);
      if (selectedAgent !== 'all') q = q.eq('registered_by', selectedAgent);
      const { data } = await q;
      return data || [];
    },
  });

  // --- New tenants registered today ---
  const { data: newTenants = [] } = useQuery({
    queryKey: ['coo-tracker-new-tenants', selectedAgent, dateStr],
    queryFn: async () => {
      let q = supabase
        .from('rent_requests')
        .select('id, assigned_agent_id, created_at')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);
      if (selectedAgent !== 'all') q = q.eq('assigned_agent_id', selectedAgent);
      const { data } = await q;
      return data || [];
    },
  });

  // --- Week collections for scorecard ---
  const { data: weekCollections = [] } = useQuery({
    queryKey: ['coo-tracker-week-collections', selectedAgent],
    queryFn: async () => {
      let q = supabase
        .from('agent_collections')
        .select('id, agent_id, amount, created_at')
        .gte('created_at', weekAgo);
      if (selectedAgent !== 'all') q = q.eq('agent_id', selectedAgent);
      const { data } = await q;
      return data || [];
    },
  });

  // --- Week visits for scorecard ---
  const { data: weekVisits = [] } = useQuery({
    queryKey: ['coo-tracker-week-visits', selectedAgent],
    queryFn: async () => {
      let q = supabase
        .from('agent_visits')
        .select('id, agent_id')
        .gte('checked_in_at', weekAgo);
      if (selectedAgent !== 'all') q = q.eq('agent_id', selectedAgent);
      const { data } = await q;
      return data || [];
    },
  });

  // --- Computed metrics ---
  const totalExpected = useMemo(() =>
    rentRequests.reduce((s, r) => s + (r.monthly_rent || 0), 0), [rentRequests]);

  const totalCollectedToday = useMemo(() =>
    collections.reduce((s, c) => s + (c.amount || 0), 0), [collections]);

  const totalAutoCharged = useMemo(() =>
    autoCharges.reduce((s, c) => s + (c.amount_charged || 0), 0), [autoCharges]);

  const totalCollectedAll = totalCollectedToday + totalAutoCharged;
  const totalArrears = Math.max(0, totalExpected - totalCollectedAll);
  const collectionRate = totalExpected > 0 ? Math.round((totalCollectedAll / totalExpected) * 100) : 0;

  // Defaulters: tenants with active rent but no collection today
  const defaulters = useMemo(() => {
    const collectedTenantIds = new Set(collections.map(c => c.tenant_id));
    const chargedUserIds = new Set(autoCharges.map(c => c.user_id));
    return rentRequests.filter(r =>
      !collectedTenantIds.has(r.user_id) && !chargedUserIds.has(r.user_id)
    );
  }, [rentRequests, collections, autoCharges]);

  // Weekly scorecard
  const weeklyScore = useMemo(() => {
    const weekCollTotal = weekCollections.reduce((s, c) => s + (c.amount || 0), 0);
    const collScore = totalExpected > 0 ? Math.min(100, (weekCollTotal / totalExpected) * 100) : 0;
    const visitScore = Math.min(100, (weekVisits.length / Math.max(1, rentRequests.length)) * 100);
    const tenantScore = Math.min(100, rentRequests.length * 5); // 20 tenants = 100%
    const landlordScore = Math.min(100, newLandlords.length * 25); // 4 landlords = 100%
    const weighted = collScore * 0.4 + tenantScore * 0.2 + visitScore * 0.2 + landlordScore * 0.2;
    return { collScore, tenantScore, visitScore, landlordScore, weighted: Math.round(weighted) };
  }, [weekCollections, weekVisits, rentRequests, newLandlords, totalExpected]);

  // Red flags
  const redFlags = useMemo(() => {
    const flags: { type: string; message: string; severity: 'high' | 'medium' }[] = [];
    if (collectionRate < 50 && totalExpected > 0) {
      flags.push({ type: 'Low Collections', message: `Only ${collectionRate}% of expected rent collected`, severity: 'high' });
    }
    const defaultRate = rentRequests.length > 0 ? (defaulters.length / rentRequests.length) * 100 : 0;
    if (defaultRate > 30) {
      flags.push({ type: 'High Defaults', message: `${Math.round(defaultRate)}% tenants with no payment today`, severity: 'high' });
    }
    if (visits.length === 0 && rentRequests.length > 0) {
      flags.push({ type: 'No Field Activity', message: 'No GPS check-ins recorded today', severity: 'medium' });
    }
    return flags;
  }, [collectionRate, totalExpected, defaulters, rentRequests, visits]);

  const isLoading = loadingRent || loadingCollections;
  const agentName = selectedAgent === 'all' ? 'All Agents' : agents.find(a => a.id === selectedAgent)?.full_name || 'Agent';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Select Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.full_name || a.phone}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn('w-full sm:w-[200px] justify-start text-left font-normal')}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground self-center" />}
      </div>

      {/* 1. Daily Report Card */}
      <CollapsibleAgentSection
        icon={ClipboardList}
        label="Daily Report"
        totalCount={newTenants.length + collections.length + visits.length}
        iconColor="text-blue-600"
        isOpen={openSections.daily}
        onToggle={() => toggleSection('daily')}
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3">
          <StatBox icon={UserPlus} label="New Tenants" value={newTenants.length} color="text-blue-600 bg-blue-500/10" />
          <StatBox icon={Banknote} label="Collected" value={formatUGX(totalCollectedToday)} color="text-emerald-600 bg-emerald-500/10" />
          <StatBox icon={AlertTriangle} label="Defaulters" value={defaulters.length} color="text-red-600 bg-red-500/10" />
          <StatBox icon={MapPin} label="Follow-ups" value={visits.length} color="text-purple-600 bg-purple-500/10" />
          <StatBox icon={Users} label="Landlords" value={newLandlords.length} color="text-amber-600 bg-amber-500/10" />
        </div>
      </CollapsibleAgentSection>

      {/* 2. Key Numbers */}
      <CollapsibleAgentSection
        icon={TrendingUp}
        label="Key Numbers"
        iconColor="text-emerald-600"
        isOpen={openSections.kpi}
        onToggle={() => toggleSection('kpi')}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-3">
          <KPICard title="Expected Rent" value={formatUGX(totalExpected)} icon={Banknote} color="bg-blue-500/10 text-blue-600" />
          <KPICard title="Total Collected" value={formatUGX(totalCollectedAll)} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-600" />
          <KPICard title="Total Arrears" value={formatUGX(totalArrears)} icon={AlertTriangle} color="bg-red-500/10 text-red-600" />
          <KPICard title="Collection Rate" value={`${collectionRate}%`} icon={BarChart3} color="bg-primary/10 text-primary" />
        </div>
      </CollapsibleAgentSection>

      {/* 3. Payment Tracking */}
      <CollapsibleAgentSection
        icon={Banknote}
        label="Payment Tracking"
        iconColor="text-amber-600"
        isOpen={openSections.payment}
        onToggle={() => toggleSection('payment')}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Collected vs Expected</span>
            <span className="font-semibold">{collectionRate}%</span>
          </div>
          <Progress value={collectionRate} className="h-3" />
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-xl bg-emerald-500/10 p-2">
              <p className="font-bold text-emerald-600">{formatUGX(totalCollectedToday)}</p>
              <p className="text-muted-foreground">Manual</p>
            </div>
            <div className="rounded-xl bg-blue-500/10 p-2">
              <p className="font-bold text-blue-600">{formatUGX(totalAutoCharged)}</p>
              <p className="text-muted-foreground">Auto-charged</p>
            </div>
            <div className="rounded-xl bg-red-500/10 p-2">
              <p className="font-bold text-red-600">{formatUGX(totalArrears)}</p>
              <p className="text-muted-foreground">Arrears</p>
            </div>
          </div>
        </div>
      </CollapsibleAgentSection>

      {/* 4. Defaulter Control */}
      <CollapsibleAgentSection
        icon={ShieldAlert}
        label="Defaulter Control"
        pendingCount={defaulters.length}
        pendingLabel="unpaid"
        iconColor="text-red-600"
        isOpen={openSections.defaulter}
        onToggle={() => toggleSection('defaulter')}
      >
        <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
          {defaulters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No defaulters today 🎉</p>
          ) : (
            defaulters.slice(0, 20).map(d => (
              <div key={d.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <div>
                  <p className="font-medium truncate max-w-[180px]">Tenant #{d.user_id?.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">Rent: {formatUGX(d.monthly_rent || 0)}</p>
                </div>
                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-xs">
                  Unpaid
                </Badge>
              </div>
            ))
          )}
          {defaulters.length > 20 && (
            <p className="text-xs text-muted-foreground text-center">+{defaulters.length - 20} more</p>
          )}
        </div>
      </CollapsibleAgentSection>

      {/* 5. Field Accountability */}
      <CollapsibleAgentSection
        icon={MapPin}
        label="Field Accountability"
        totalCount={visits.length}
        iconColor="text-purple-600"
        isOpen={openSections.field}
        onToggle={() => toggleSection('field')}
      >
        <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No field check-ins today</p>
          ) : (
            visits.map(v => (
              <div key={v.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-purple-500 shrink-0" />
                  <div>
                    <p className="font-medium truncate max-w-[160px]">{v.location_name || 'GPS Check-in'}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(v.checked_in_at), 'h:mm a')}</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                  Verified
                </Badge>
              </div>
            ))
          )}
        </div>
      </CollapsibleAgentSection>

      {/* 6. Weekly Scorecard */}
      <CollapsibleAgentSection
        icon={Trophy}
        label="Weekly Scorecard"
        iconColor="text-amber-600"
        isOpen={openSections.scorecard}
        onToggle={() => toggleSection('scorecard')}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Overall Score</span>
            <Badge className={cn(
              'text-sm font-bold',
              weeklyScore.weighted >= 70 ? 'bg-emerald-500' : weeklyScore.weighted >= 40 ? 'bg-amber-500' : 'bg-red-500'
            )}>
              {weeklyScore.weighted}%
            </Badge>
          </div>
          <ScoreRow label="Collections (40%)" value={Math.round(weeklyScore.collScore)} />
          <ScoreRow label="Active Tenants (20%)" value={Math.round(weeklyScore.tenantScore)} />
          <ScoreRow label="Follow-ups (20%)" value={Math.round(weeklyScore.visitScore)} />
          <ScoreRow label="New Landlords (20%)" value={Math.round(weeklyScore.landlordScore)} />
        </div>
      </CollapsibleAgentSection>

      {/* 7. Red Flags */}
      <CollapsibleAgentSection
        icon={AlertTriangle}
        label="Red Flags"
        pendingCount={redFlags.length}
        pendingLabel="alerts"
        iconColor="text-red-600"
        isOpen={openSections.redflags}
        onToggle={() => toggleSection('redflags')}
      >
        <div className="p-3 space-y-2">
          {redFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No red flags — all clear ✅</p>
          ) : (
            redFlags.map((flag, i) => (
              <div key={i} className={cn(
                'rounded-xl border p-3 text-sm',
                flag.severity === 'high' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'
              )}>
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className={cn('h-4 w-4', flag.severity === 'high' ? 'text-red-500' : 'text-amber-500')} />
                  {flag.type}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{flag.message}</p>
              </div>
            ))
          )}
        </div>
      </CollapsibleAgentSection>

      {/* 8. Cashout Activity */}
      <CollapsibleAgentSection
        icon={Activity}
        label="Cashout Activity"
        iconColor="text-orange-600"
        isOpen={openSections.cashout}
        onToggle={() => toggleSection('cashout')}
      >
        <div className="p-1">
          <CashoutAgentActivity />
        </div>
      </CollapsibleAgentSection>
    </div>
  );
}

// --- Helper components ---
function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className={cn('rounded-xl p-3 flex flex-col items-center gap-1 text-center', color.split(' ')[1])}>
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}
