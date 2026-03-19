import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Home, Banknote, CheckCircle2, Clock, MapPin, AlertTriangle, ShieldCheck, Phone, MessageCircle, Image, MapPinned, DoorOpen, Users, TrendingUp, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
        href={`https://wa.me/${intlPhone.replace('+', '')}?text=${encodeURIComponent(`Hello ${name || ''}, this is Welile Operations. We are verifying your property details.`)}`}
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

export function LandlordOpsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [verifying, setVerifying] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<{ images: string[]; title: string } | null>(null);

  // Fetch house listings with joined landlord data
  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ['exec-house-listings-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('house_listings')
        .select(`
          id, title, house_category, monthly_rent, daily_rate, number_of_rooms, address, district, village, region,
          latitude, longitude, image_urls, lc1_chairperson_name, lc1_chairperson_phone, lc1_chairperson_village,
          agent_id, landlord_id, verified, listing_bonus_paid, created_at, status,
          landlords(id, name, phone, verified, mobile_money_name, mobile_money_number, has_smartphone, number_of_houses)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      // Enrich with agent names
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

  const handleVerifyListing = async (listing: ListingWithLandlord) => {
    if (!user) return;
    setVerifying(listing.id);
    try {
      // Call edge function that verifies + credits bonus
      const { data, error } = await supabase.functions.invoke('credit-listing-bonus', {
        body: { listing_id: listing.id },
      });

      if (error) throw error;

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

  // Verification queue columns - rich detail for manager decision
  const verificationColumns: Column<ListingWithLandlord>[] = [
    {
      key: 'title', label: 'Property', render: (_, row) => (
        <div className="min-w-[140px]">
          <div className="flex items-center gap-2">
            {row.image_urls && row.image_urls.length > 0 ? (
              <button
                onClick={() => setPreviewImages({ images: row.image_urls!, title: row.title })}
                className="relative shrink-0 h-12 w-12 rounded-lg overflow-hidden border border-border hover:ring-2 ring-primary transition-all"
              >
                <img src={row.image_urls[0]} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] px-1 rounded-tl">
                  {row.image_urls.length}📷
                </span>
              </button>
            ) : (
              <div className="shrink-0 h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <Image className="h-5 w-5 text-muted-foreground" />
              </div>
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
        </div>
      ),
    },
    {
      key: 'landlord_id', label: 'Landlord', render: (_, row) => {
        const l = row.landlords;
        if (!l) return <span className="text-muted-foreground text-xs italic">No landlord linked</span>;
        return (
          <div className="min-w-[120px]">
            <p className="font-semibold text-xs">{l.name}</p>
            <PhoneLinks phone={l.phone} name={l.name} />
            {l.mobile_money_name && (
              <p className="text-[9px] text-muted-foreground mt-0.5">MoMo: {l.mobile_money_name}</p>
            )}
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
    {
      key: 'latitude', label: 'Location', render: (_, row) => {
        if (!row.latitude || !row.longitude) return <span className="text-muted-foreground text-xs">No GPS</span>;
        return (
          <a
            href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
          >
            <MapPinned className="h-3.5 w-3.5" />
            View Map
          </a>
        );
      },
    },
    {
      key: 'monthly_rent', label: 'Rent', render: (v) => (
        <div className="text-xs">
          <p className="font-semibold">{Number(v || 0).toLocaleString()}/mo</p>
        </div>
      ),
    },
    {
      key: 'agent_id', label: 'Agent', render: (_, row) => (
        <div className="min-w-[90px]">
          <p className="text-xs font-medium">{row.agent_name}</p>
          {row.agent_phone && <PhoneLinks phone={row.agent_phone} name={row.agent_name} />}
        </div>
      ),
    },
    {
      key: 'created_at', label: 'Listed', render: (v) => (
        <span className="text-[10px] text-muted-foreground">{format(new Date(v as string), 'MMM d, h:mm a')}</span>
      ),
    },
    {
      key: 'id', label: 'Action', render: (v, row) => (
        <Button
          size="sm"
          variant="default"
          className="h-8 text-xs gap-1.5 whitespace-nowrap"
          onClick={() => handleVerifyListing(row)}
          disabled={verifying === v}
        >
          {verifying === v ? (
            <div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          Verify & Pay 5K
        </Button>
      ),
    },
  ];

  // All listings table
  const allColumns: Column<ListingWithLandlord>[] = [
    { key: 'title', label: 'Property', render: (v, row) => (
      <div>
        <p className="font-medium text-sm">{v as string}</p>
        <p className="text-[10px] text-muted-foreground">{row.district || row.region}</p>
      </div>
    )},
    { key: 'house_category', label: 'Type', render: (v) => <Badge variant="outline" className="text-[10px]">{v as string}</Badge> },
    { key: 'monthly_rent', label: 'Rent', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'verified', label: 'Status', render: (v, row) => (
      <div className="flex flex-col gap-0.5">
        {v ? <Badge className="bg-green-500/20 text-green-700 border-0 text-[10px]">✅ Verified</Badge> : <Badge className="bg-amber-500/20 text-amber-700 border-0 text-[10px]">⏳ Pending</Badge>}
        {row.listing_bonus_paid && <Badge className="bg-blue-500/20 text-blue-700 border-0 text-[10px]">💰 Bonus Paid</Badge>}
      </div>
    )},
    { key: 'agent_name', label: 'Agent', render: (v) => <span className="text-xs">{v as string}</span> },
  ];

  return (
    <div className="space-y-6">
      {/* Priority Alert Banner */}
      {unverifiedListings.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 shrink-0">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-amber-800 dark:text-amber-300 text-lg">
              🚨 {unverifiedListings.length} House Listing{unverifiedListings.length !== 1 ? 's' : ''} Pending Verification
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              Agents listed these houses with landlord details, photos & LC1 info. Verify each to release UGX 5,000 bonus to the listing agent.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard
          title="⚠️ Pending Verification"
          value={unverifiedListings.length}
          icon={Clock}
          loading={isLoading}
          color="bg-amber-500/20 text-amber-600"
          subtitle={unverifiedListings.length > 0 ? 'Action required!' : 'All clear ✅'}
        />
        <KPICard title="Verified Listings" value={verifiedListings.length} icon={CheckCircle2} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Total Listings" value={rows.length} icon={Home} loading={isLoading} />
        <KPICard title="With Photos" value={withImages.length} icon={Image} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="GPS Captured" value={withGPS.length} icon={MapPin} loading={isLoading} color="bg-purple-500/10 text-purple-600" />
        <KPICard title="Bonuses Due" value={`${fmt(unverifiedListings.length * 5000)}`} icon={Banknote} loading={isLoading} color="bg-orange-500/10 text-orange-600" subtitle="UGX to agents on verify" />
      </div>

      {/* PRIORITY: Verification Queue */}
      {unverifiedListings.length > 0 && (
        <ExecutiveDataTable
          data={unverifiedListings}
          columns={verificationColumns}
          loading={isLoading}
          title={`🔥 Verification Queue (${unverifiedListings.length})`}
          limit={50}
          filters={[
            {
              key: 'house_category',
              label: 'Type',
              options: [...new Set(unverifiedListings.map(l => l.house_category).filter(Boolean))].map(v => ({ value: v, label: v })),
            },
            {
              key: 'district',
              label: 'District',
              options: [...new Set(unverifiedListings.map(l => l.district).filter(Boolean))].map(v => ({ value: v!, label: v! })),
            },
          ]}
        />
      )}

      {/* All Listings Table */}
      <ExecutiveDataTable
        data={rows}
        columns={allColumns}
        loading={isLoading}
        title="All House Listings"
        filters={[
          {
            key: 'verified',
            label: 'Status',
            options: [
              { value: 'true', label: 'Verified' },
              { value: 'false', label: 'Unverified' },
            ],
          },
          {
            key: 'house_category',
            label: 'Type',
            options: [...new Set(rows.map(l => l.house_category).filter(Boolean))].map(v => ({ value: v, label: v })),
          },
        ]}
      />

      {/* Image Preview Dialog */}
      {previewImages && (
        <ImagePreviewDialog
          images={previewImages.images}
          title={previewImages.title}
          open={!!previewImages}
          onClose={() => setPreviewImages(null)}
        />
      )}
    </div>
  );
}
