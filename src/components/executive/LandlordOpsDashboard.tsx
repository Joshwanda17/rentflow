import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import {
  Home, Banknote, CheckCircle2, Clock, MapPin, AlertTriangle, ShieldCheck,
  Phone, MessageCircle, Image, MapPinned, DoorOpen, TrendingDown, Users,
  Building2, UserCheck, Smartphone, Handshake, GitBranch,
} from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RentAdjustmentDialog } from './RentAdjustmentDialog';
import { VacancyAnalytics } from './VacancyAnalytics';
import { TenantMatchingQueue } from './landlord-ops/TenantMatchingQueue';
import { DealPipeline } from './landlord-ops/DealPipeline';

interface ListingWithLandlord {
  id: string;
  title: string;
  house_category: string;
  monthly_rent: number;
  daily_rate: number;
  number_of_rooms: number;
  address: string;
  district: string | null;
  village: string | null;
  region: string;
  latitude: number | null;
  longitude: number | null;
  image_urls: string[] | null;
  lc1_chairperson_name: string | null;
  lc1_chairperson_phone: string | null;
  lc1_chairperson_village: string | null;
  agent_id: string;
  landlord_id: string | null;
  tenant_id: string | null;
  verified: boolean | null;
  listing_bonus_paid: boolean | null;
  created_at: string;
  status: string;
  landlords?: {
    id: string;
    name: string;
    phone: string;
    verified: boolean | null;
    mobile_money_name: string | null;
    mobile_money_number: string | null;
    has_smartphone: boolean | null;
    number_of_houses: number | null;
  } | null;
  agent_name?: string;
  agent_phone?: string;
}

function PhoneLinks({ phone, name }: { phone: string; name?: string }) {
  const cleanPhone = phone.replace(/\s/g, '');
  const intlPhone = cleanPhone.startsWith('0') ? `+256${cleanPhone.slice(1)}` : cleanPhone.startsWith('+') ? cleanPhone : `+256${cleanPhone}`;
  return (
    <div className="flex items-center gap-1.5">
      <a href={`tel:${intlPhone}`} className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium">
        <Phone className="h-3 w-3" />
        {phone}
      </a>
      <a
        href={`https://wa.me/${intlPhone.replace('+', '')}?text=${encodeURIComponent(`Hello ${name || ''}, this is Welile Operations.`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-500/20 text-green-600 hover:bg-green-500/30 transition-colors"
        title="WhatsApp"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function ImagePreviewDialog({ images, open, onClose, title }: { images: string[]; open: boolean; onClose: () => void; title: string }) {
  const [current, setCurrent] = useState(0);
  if (!images.length) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-2">
        <DialogHeader className="px-2 pt-2">
          <DialogTitle className="text-sm">{title} ({current + 1}/{images.length})</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <img src={images[current]} alt={title} className="w-full rounded-lg max-h-[60vh] object-cover" />
          {images.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.map((_, i) => (
                <button key={i} onClick={() => setCurrent(i)} className={`h-2 w-2 rounded-full transition-colors ${i === current ? 'bg-primary' : 'bg-white/60'}`} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper: group listings by agent
function groupByAgent(listings: ListingWithLandlord[]) {
  const map = new Map<string, { name: string; phone: string | null; listings: ListingWithLandlord[] }>();
  for (const l of listings) {
    const existing = map.get(l.agent_id);
    if (existing) {
      existing.listings.push(l);
    } else {
      map.set(l.agent_id, { name: l.agent_name || 'Unknown Agent', phone: l.agent_phone || null, listings: [l] });
    }
  }
  return [...map.entries()].sort((a, b) => b[1].listings.length - a[1].listings.length);
}

export function LandlordOpsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [verifying, setVerifying] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<{ images: string[]; title: string } | null>(null);
  const [adjustListing, setAdjustListing] = useState<ListingWithLandlord | null>(null);

  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ['exec-house-listings-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('house_listings')
        .select(`
          id, title, house_category, monthly_rent, daily_rate, number_of_rooms, address, district, village, region,
          latitude, longitude, image_urls, lc1_chairperson_name, lc1_chairperson_phone, lc1_chairperson_village,
          agent_id, landlord_id, tenant_id, verified, listing_bonus_paid, created_at, status,
          landlords(id, name, phone, verified, mobile_money_name, mobile_money_number, has_smartphone, number_of_houses)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      const agentIds = [...new Set((data || []).map(d => d.agent_id).filter(Boolean))];
      let agentMap = new Map<string, { full_name: string | null; phone: string | null }>();
      if (agentIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', agentIds);
        if (profiles) agentMap = new Map(profiles.map(p => [p.id, p]));
      }

      return (data || []).map(d => ({
        ...d,
        agent_name: agentMap.get(d.agent_id)?.full_name || 'Unknown Agent',
        agent_phone: agentMap.get(d.agent_id)?.phone || null,
      })) as ListingWithLandlord[];
    },
    staleTime: 60000,
  });

  const rows = listings || [];
  const unverifiedListings = rows.filter(l => !l.verified);
  const verifiedListings = rows.filter(l => l.verified);
  const withImages = rows.filter(l => l.image_urls && l.image_urls.length > 0);
  const withGPS = rows.filter(l => l.latitude && l.longitude);
  const emptyHouses = rows.filter(l => l.status === 'available' && !l.tenant_id);
  const occupiedHouses = rows.filter(l => l.tenant_id);

  // Landlord stats
  const uniqueLandlords = new Map<string, ListingWithLandlord['landlords']>();
  rows.forEach(r => { if (r.landlord_id && r.landlords) uniqueLandlords.set(r.landlord_id, r.landlords); });
  const verifiedLandlords = [...uniqueLandlords.values()].filter(l => l?.verified);
  const smartphoneLandlords = [...uniqueLandlords.values()].filter(l => l?.has_smartphone);

  const handleVerifyListing = async (listing: ListingWithLandlord) => {
    if (!user) return;
    setVerifying(listing.id);
    try {
      const { data, error } = await supabase.functions.invoke('credit-listing-bonus', {
        body: { listing_id: listing.id },
      });
      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Verification failed');
        throw new Error(msg);
      }
      if (data?.already_paid) {
        toast({ title: '✅ Already Verified', description: 'This listing was already verified and bonus paid.' });
      } else {
        toast({
          title: '✅ Listing Verified & Bonus Paid!',
          description: `${listing.title} verified. UGX 5,000 credited to agent ${listing.agent_name}.`,
        });
      }
      refetch();
    } catch (err: any) {
      toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
    } finally {
      setVerifying(null);
    }
  };

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  // Shared property cell renderer
  const propertyCell = (row: ListingWithLandlord) => (
    <div className="flex items-center gap-2 min-w-[140px]">
      {row.image_urls?.[0] ? (
        <button onClick={() => setPreviewImages({ images: row.image_urls!, title: row.title })} className="shrink-0 h-10 w-10 rounded-lg overflow-hidden border border-border hover:ring-2 ring-primary">
          <img src={row.image_urls[0]} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Home className="h-4 w-4 text-muted-foreground" /></div>
      )}
      <div>
        <p className="font-semibold text-sm leading-tight">{row.title}</p>
        <p className="text-[10px] text-muted-foreground">{row.address}</p>
        <div className="flex gap-1 mt-0.5">
          <Badge variant="outline" className="text-[9px] h-4 px-1">{row.house_category}</Badge>
          <Badge variant="outline" className="text-[9px] h-4 px-1">{row.number_of_rooms} rooms</Badge>
        </div>
      </div>
    </div>
  );

  const landlordCell = (row: ListingWithLandlord) => {
    const l = row.landlords;
    if (!l) return <span className="text-muted-foreground text-xs italic">Unlinked</span>;
    return (
      <div>
        <p className="text-xs font-medium">{l.name}</p>
        <PhoneLinks phone={l.phone} name={l.name} />
        {l.mobile_money_name && <p className="text-[9px] text-muted-foreground mt-0.5">MoMo: {l.mobile_money_name}</p>}
      </div>
    );
  };

  const agentCell = (row: ListingWithLandlord) => (
    <div>
      <p className="text-xs font-medium">{row.agent_name}</p>
      {row.agent_phone && <PhoneLinks phone={row.agent_phone} name={row.agent_name} />}
    </div>
  );

  const locationCell = (row: ListingWithLandlord) => {
    if (!row.latitude || !row.longitude) return <span className="text-muted-foreground text-xs">No GPS</span>;
    return (
      <a href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
        <MapPinned className="h-3.5 w-3.5" /> View
      </a>
    );
  };

  // Empty houses columns
  const emptyColumns: Column<ListingWithLandlord>[] = [
    { key: 'title', label: 'Property', render: (_, row) => propertyCell(row) },
    { key: 'monthly_rent', label: 'Rent/mo', render: (v) => <span className="font-semibold text-sm">UGX {Number(v || 0).toLocaleString()}</span> },
    { key: 'landlord_id', label: 'Landlord', render: (_, row) => landlordCell(row) },
    { key: 'agent_id', label: 'Listed By', render: (_, row) => agentCell(row) },
    { key: 'latitude', label: 'Location', render: (_, row) => locationCell(row) },
    {
      key: 'created_at', label: 'Days Empty', render: (v) => {
        const days = differenceInDays(new Date(), new Date(v as string));
        return <Badge variant={days > 30 ? 'destructive' : days > 14 ? 'secondary' : 'outline'} className="text-[10px]">{days}d</Badge>;
      },
    },
    {
      key: 'id', label: 'Action', render: (_, row) => (
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => setAdjustListing(row)}>
          <TrendingDown className="h-3 w-3" /> Reduce Rent
        </Button>
      ),
    },
  ];

  // Occupied houses columns
  const occupiedColumns: Column<ListingWithLandlord>[] = [
    { key: 'title', label: 'Property', render: (_, row) => propertyCell(row) },
    { key: 'monthly_rent', label: 'Rent/mo', render: (v) => <span className="font-semibold text-sm">UGX {Number(v || 0).toLocaleString()}</span> },
    { key: 'landlord_id', label: 'Landlord', render: (_, row) => landlordCell(row) },
    { key: 'agent_id', label: 'Agent', render: (_, row) => agentCell(row) },
    { key: 'verified', label: 'Status', render: (v, row) => (
      <div className="flex flex-col gap-0.5">
        {v ? <Badge className="bg-green-500/20 text-green-700 border-0 text-[10px]">✅ Verified</Badge> : <Badge className="bg-amber-500/20 text-amber-700 border-0 text-[10px]">⏳ Pending</Badge>}
        {row.listing_bonus_paid && <Badge className="bg-blue-500/20 text-blue-700 border-0 text-[10px]">💰 Bonus Paid</Badge>}
      </div>
    )},
    { key: 'latitude', label: 'Location', render: (_, row) => locationCell(row) },
  ];

  // Verification queue columns
  const verificationColumns: Column<ListingWithLandlord>[] = [
    { key: 'title', label: 'Property', render: (_, row) => propertyCell(row) },
    {
      key: 'landlord_id', label: 'Landlord', render: (_, row) => {
        const l = row.landlords;
        if (!l) return <span className="text-muted-foreground text-xs italic">No landlord linked</span>;
        return (
          <div className="min-w-[120px]">
            <p className="font-semibold text-xs">{l.name}</p>
            <PhoneLinks phone={l.phone} name={l.name} />
            {l.mobile_money_name && <p className="text-[9px] text-muted-foreground mt-0.5">MoMo: {l.mobile_money_name}</p>}
            <div className="flex gap-1 mt-0.5">
              {l.has_smartphone ? <span className="text-[9px]">📱</span> : <span className="text-[9px]">📵</span>}
              {l.number_of_houses && <span className="text-[9px] text-muted-foreground">{l.number_of_houses} houses</span>}
            </div>
          </div>
        );
      },
    },
    {
      key: 'lc1_chairperson_name', label: 'LC1 Chair', render: (_, row) => {
        if (!row.lc1_chairperson_name) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="min-w-[100px]">
            <p className="text-xs font-medium">{row.lc1_chairperson_name}</p>
            {row.lc1_chairperson_phone && <PhoneLinks phone={row.lc1_chairperson_phone} name={row.lc1_chairperson_name} />}
            {row.lc1_chairperson_village && <p className="text-[9px] text-muted-foreground">{row.lc1_chairperson_village}</p>}
          </div>
        );
      },
    },
    { key: 'monthly_rent', label: 'Rent', render: (v) => <span className="font-semibold text-xs">{Number(v || 0).toLocaleString()}/mo</span> },
    { key: 'agent_id', label: 'Agent', render: (_, row) => agentCell(row) },
    { key: 'latitude', label: 'Location', render: (_, row) => locationCell(row) },
    {
      key: 'id', label: 'Action', render: (v, row) => (
        <Button size="sm" variant="default" className="h-8 text-xs gap-1.5 whitespace-nowrap" onClick={() => handleVerifyListing(row)} disabled={verifying === v}>
          {verifying === v ? <div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Verify & Pay 5K
        </Button>
      ),
    },
  ];

  // Agent performance summary for overview
  const agentSummary = groupByAgent(rows);

  const totalMonthlyRevenue = occupiedHouses.reduce((s, h) => s + h.monthly_rent, 0);
  const lostMonthlyRevenue = emptyHouses.reduce((s, h) => s + h.monthly_rent, 0);

  return (
    <div className="space-y-6">
      {/* Overview KPIs - Always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KPICard title="Total Properties" value={rows.length} icon={Home} loading={isLoading} />
        <KPICard title="Occupied" value={occupiedHouses.length} icon={UserCheck} loading={isLoading} color="bg-green-500/10 text-green-600" subtitle={`UGX ${fmt(totalMonthlyRevenue)}/mo revenue`} />
        <KPICard title="Empty Houses" value={emptyHouses.length} icon={DoorOpen} loading={isLoading} color="bg-red-500/10 text-red-600" subtitle={`UGX ${fmt(lostMonthlyRevenue)}/mo lost`} />
        <KPICard title="Vacancy Rate" value={`${rows.length ? Math.round((emptyHouses.length / rows.length) * 100) : 0}%`} icon={TrendingDown} loading={isLoading} color={emptyHouses.length / (rows.length || 1) > 0.3 ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600'} />
        <KPICard title="Verified" value={verifiedListings.length} icon={CheckCircle2} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Pending Verification" value={unverifiedListings.length} icon={Clock} loading={isLoading} color="bg-amber-500/10 text-amber-600" subtitle={unverifiedListings.length > 0 ? 'Action required!' : 'All clear ✅'} />
        <KPICard title="Landlords" value={uniqueLandlords.size} icon={Building2} loading={isLoading} color="bg-sky-500/10 text-sky-600" subtitle={`${verifiedLandlords.length} verified`} />
        <KPICard title="Listing Agents" value={agentSummary.length} icon={Users} loading={isLoading} color="bg-indigo-500/10 text-indigo-600" />
      </div>

      {/* Pending verification alert */}
      {unverifiedListings.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-amber-800 dark:text-amber-300">
              🚨 {unverifiedListings.length} Listing{unverifiedListings.length !== 1 ? 's' : ''} Pending Verification — UGX {fmt(unverifiedListings.length * 5000)} agent bonuses pending
            </p>
          </div>
        </div>
      )}

      {/* Tabbed Management Sections */}
      <Tabs defaultValue="matching" className="w-full">
        <TabsList className="grid w-full grid-cols-7 h-auto">
          <TabsTrigger value="matching" className="text-xs py-2 gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Handshake className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Match</span>
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs py-2 gap-1 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-700">
            <GitBranch className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pipeline</span>
          </TabsTrigger>
          <TabsTrigger value="empty" className="text-xs py-2 gap-1 data-[state=active]:bg-red-500/10 data-[state=active]:text-red-700">
            <DoorOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Empty</span>
            <Badge variant="destructive" className="text-[9px] h-4 px-1 ml-0.5">{emptyHouses.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="occupied" className="text-xs py-2 gap-1 data-[state=active]:bg-green-500/10 data-[state=active]:text-green-700">
            <UserCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Occupied</span>
            <Badge className="bg-green-500/20 text-green-700 border-0 text-[9px] h-4 px-1 ml-0.5">{occupiedHouses.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="verification" className="text-xs py-2 gap-1 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Verify</span>
            {unverifiedListings.length > 0 && <Badge className="bg-amber-500/20 text-amber-700 border-0 text-[9px] h-4 px-1 ml-0.5 animate-pulse">{unverifiedListings.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="agents" className="text-xs py-2 gap-1 data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Agents</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs py-2 gap-1 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-700">
            <Banknote className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* ──────── MATCHING TAB ──────── */}
        <TabsContent value="matching" className="space-y-4 mt-4">
          <TenantMatchingQueue onViewingCreated={() => refetch()} />
        </TabsContent>

        {/* ──────── PIPELINE TAB ──────── */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          <DealPipeline />
        </TabsContent>

        {/* ──────── EMPTY HOUSES TAB ──────── */}
        <TabsContent value="empty" className="space-y-4 mt-4">
          {emptyHouses.length > 0 ? (
            <>
              <div className="rounded-2xl border-2 border-red-400/40 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-red-500/20 shrink-0"><DoorOpen className="h-5 w-5 text-red-600" /></div>
                <div className="flex-1">
                  <p className="font-bold text-red-800 dark:text-red-300">🏚️ {emptyHouses.length} Empty — UGX {lostMonthlyRevenue.toLocaleString()}/mo potential revenue lost</p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">Reduce rent on long-vacant houses to attract tenants faster.</p>
                </div>
              </div>

              {/* Grouped by agent */}
              {groupByAgent(emptyHouses).map(([agentId, agent]) => (
                <div key={agentId} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">{agent.name}</span>
                    <Badge variant="outline" className="text-[10px]">{agent.listings.length} empty</Badge>
                    {agent.phone && <PhoneLinks phone={agent.phone} name={agent.name} />}
                  </div>
                  <ExecutiveDataTable
                    data={agent.listings}
                    columns={emptyColumns}
                    loading={isLoading}
                    title=""
                    limit={50}
                  />
                </div>
              ))}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-semibold text-lg">No empty houses! 🎉</p>
              <p className="text-sm">All listed properties are occupied.</p>
            </div>
          )}
        </TabsContent>

        {/* ──────── OCCUPIED HOUSES TAB ──────── */}
        <TabsContent value="occupied" className="space-y-4 mt-4">
          <div className="rounded-2xl border border-green-400/40 bg-green-50 dark:bg-green-950/20 p-3 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-green-500/20 shrink-0"><UserCheck className="h-5 w-5 text-green-600" /></div>
            <div className="flex-1">
              <p className="font-bold text-green-800 dark:text-green-300">✅ {occupiedHouses.length} Occupied — UGX {totalMonthlyRevenue.toLocaleString()}/mo total revenue</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">Properties with active tenants generating revenue.</p>
            </div>
          </div>

          {groupByAgent(occupiedHouses).map(([agentId, agent]) => (
            <div key={agentId} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{agent.name}</span>
                <Badge className="bg-green-500/20 text-green-700 border-0 text-[10px]">{agent.listings.length} occupied</Badge>
                {agent.phone && <PhoneLinks phone={agent.phone} name={agent.name} />}
              </div>
              <ExecutiveDataTable
                data={agent.listings}
                columns={occupiedColumns}
                loading={isLoading}
                title=""
                limit={50}
              />
            </div>
          ))}
        </TabsContent>

        {/* ──────── VERIFICATION TAB ──────── */}
        <TabsContent value="verification" className="space-y-4 mt-4">
          {unverifiedListings.length > 0 ? (
            <ExecutiveDataTable
              data={unverifiedListings}
              columns={verificationColumns}
              loading={isLoading}
              title={`🔥 Verification Queue (${unverifiedListings.length})`}
              limit={50}
              filters={[
                { key: 'house_category', label: 'Type', options: [...new Set(unverifiedListings.map(l => l.house_category).filter(Boolean))].map(v => ({ value: v, label: v })) },
                { key: 'district', label: 'District', options: [...new Set(unverifiedListings.map(l => l.district).filter(Boolean))].map(v => ({ value: v!, label: v! })) },
              ]}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-semibold text-lg">All listings verified! ✅</p>
            </div>
          )}
        </TabsContent>

        {/* ──────── AGENTS TAB ──────── */}
        <TabsContent value="agents" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Agent listing performance — ranked by total properties listed.</p>
          <div className="grid gap-3">
            {agentSummary.map(([agentId, agent], idx) => {
              const empty = agent.listings.filter(l => l.status === 'available' && !l.tenant_id);
              const occupied = agent.listings.filter(l => l.tenant_id);
              const verified = agent.listings.filter(l => l.verified);
              const occupancyRate = agent.listings.length ? Math.round((occupied.length / agent.listings.length) * 100) : 0;
              return (
                <div key={agentId} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${idx < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{agent.name}</p>
                      {agent.phone && <PhoneLinks phone={agent.phone} name={agent.name} />}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-[10px]">{agent.listings.length} listed</Badge>
                    <Badge className="bg-green-500/20 text-green-700 border-0 text-[10px]">{occupied.length} occupied</Badge>
                    <Badge className="bg-red-500/20 text-red-700 border-0 text-[10px]">{empty.length} empty</Badge>
                    <Badge className="bg-blue-500/20 text-blue-700 border-0 text-[10px]">{verified.length} verified</Badge>
                    <Badge className={`border-0 text-[10px] ${occupancyRate >= 70 ? 'bg-green-500/20 text-green-700' : occupancyRate >= 40 ? 'bg-amber-500/20 text-amber-700' : 'bg-red-500/20 text-red-700'}`}>
                      {occupancyRate}% occupancy
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ──────── ANALYTICS TAB ──────── */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KPICard title="With Photos" value={withImages.length} icon={Image} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
            <KPICard title="GPS Captured" value={withGPS.length} icon={MapPin} loading={isLoading} color="bg-purple-500/10 text-purple-600" />
            <KPICard title="Smartphone Landlords" value={smartphoneLandlords.length} icon={Smartphone} loading={isLoading} color="bg-teal-500/10 text-teal-600" subtitle={`of ${uniqueLandlords.size}`} />
            <KPICard title="Bonuses Pending" value={`${fmt(unverifiedListings.length * 5000)}`} icon={Banknote} loading={isLoading} color="bg-orange-500/10 text-orange-600" subtitle="UGX to agents" />
          </div>
          <VacancyAnalytics listings={rows as any} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {previewImages && (
        <ImagePreviewDialog images={previewImages.images} title={previewImages.title} open={!!previewImages} onClose={() => setPreviewImages(null)} />
      )}
      {adjustListing && (
        <RentAdjustmentDialog open={!!adjustListing} onOpenChange={(open) => !open && setAdjustListing(null)} listing={adjustListing} onSuccess={() => refetch()} />
      )}
    </div>
  );
}
