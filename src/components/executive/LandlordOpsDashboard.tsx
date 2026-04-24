import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RentPipelineQueue } from './RentPipelineQueue';
import { AdvanceRequestsQueue } from '@/components/ops/AdvanceRequestsQueue';
import { BusinessAdvanceQueue } from '@/components/ops/BusinessAdvanceQueue';
import { RentHistoryVerificationQueue } from '@/components/ops/RentHistoryVerificationQueue';
import { LandlordOpsPayoutReview } from '@/components/cfo/LandlordOpsPayoutReview';
import { KPICard } from './KPICard';
import {
  Home, Banknote, CheckCircle2, MapPin, AlertTriangle, ShieldCheck,
  Phone, MessageCircle, Image, MapPinned, DoorOpen, TrendingDown, Users,
  Building2, UserCheck, Smartphone, Handshake, GitBranch, Link2,
  ArrowLeft, ChevronRight, Search, X, Globe, UserX, UserPlus,
} from 'lucide-react';
import { ChainHealthTab } from './landlord-ops/ChainHealthTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RentAdjustmentDialog } from './RentAdjustmentDialog';
import { VacancyAnalytics } from './VacancyAnalytics';
import { TenantMatchingQueue } from './landlord-ops/TenantMatchingQueue';
import { DealPipeline } from './landlord-ops/DealPipeline';
import { ListingBonusApprovalQueue } from './ListingBonusApprovalQueue';
import { VerificationTimelinePanel } from './landlord-ops/VerificationTimelinePanel';
import { EmptyHouseActionDialog } from './landlord-ops/EmptyHouseActionDialog';
import { Trash2, XCircle, Pencil } from 'lucide-react';
import { EditLandlordDialog } from './landlord-ops/EditLandlordDialog';
import { EditLC1Dialog } from './landlord-ops/EditLC1Dialog';
import { AssignPersonDialog } from './landlord-ops/AssignPersonDialog';
import { LandlordsPaidView } from './landlord-ops/LandlordsPaidView';
import { LandlordsWithTenantsView } from './landlord-ops/LandlordsWithTenantsView';


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
    bank_name: string | null;
    account_number: string | null;
    monthly_rent: number | null;
    caretaker_name: string | null;
    caretaker_phone: string | null;
    tin: string | null;
    electricity_meter_number: string | null;
    water_meter_number: string | null;
    village: string | null;
    district: string | null;
    region: string | null;
  } | null;
  agent_name?: string;
  agent_phone?: string;
  tenant_name?: string;
  tenant_phone?: string;
}

interface TenantWithoutLandlord {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  rent_amount: number;
  request_city: string | null;
  house_category: string | null;
  status: string;
  created_at: string;
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
        className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors min-h-[28px]"
        title="WhatsApp"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function ListPropertyCTA({ phone, name, role }: { phone: string; name?: string; role: 'tenant' | 'agent' }) {
  const cleanPhone = phone.replace(/\s/g, '');
  const intlPhone = cleanPhone.startsWith('0') ? `+256${cleanPhone.slice(1)}` : cleanPhone.startsWith('+') ? cleanPhone : `+256${cleanPhone}`;
  const waNumber = intlPhone.replace('+', '');
  const message = role === 'tenant'
    ? `Hello ${name || ''}, this is Welile Landlord Operations. We noticed your property isn't listed yet. Please list your landlord's property on Welile and earn UGX 5,000 listing bonus! 🏠💰 Ask your agent for help or contact us.`
    : `Hello ${name || ''}, this is Welile Landlord Operations. You have tenants without landlord property listings. Please help them list their landlord's properties on Welile — each listing earns UGX 5,000 bonus! 🏠💰`;

  return (
    <div className="flex items-center gap-1.5">
      <a href={`tel:${intlPhone}`} className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors min-h-[32px]" title="Call">
        <Phone className="h-3.5 w-3.5" />
      </a>
      <a
        href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 transition-colors text-xs font-medium min-h-[32px]"
        title="WhatsApp: List property & earn UGX 5,000"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        List & Earn 5K
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

type View = 'home' | 'landlords' | 'locations' | 'lc1' | 'empty' | 'occupied' | 'verify' | 'pipeline' | 'chain' | 'matching' | 'agents' | 'analytics' | 'cities' | 'no-landlord' | 'advance-requests' | 'landlords-paid' | 'landlords-tenants';

// ─── Navigation Items ───
const navItems: { id: View; label: string; icon: typeof Building2; color: string; description: string; priority?: boolean }[] = [
  { id: 'landlords', label: 'All Landlords', icon: Building2, color: 'bg-sky-500/10 text-sky-600 border-sky-500/30', description: 'Directory with contacts & properties', priority: true },
  { id: 'landlords-tenants', label: 'Landlords & Tenants', icon: Users, color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30', description: 'All landlords with their tenants & paid/pending status', priority: true },
  { id: 'landlords-paid', label: 'Landlords Paid', icon: Banknote, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', description: 'Disbursements from tenant rent', priority: true },
  { id: 'locations', label: 'Locations', icon: MapPin, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', description: 'Regions, districts & house counts', priority: true },
  { id: 'lc1', label: 'LC1 Chairpersons', icon: ShieldCheck, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', description: 'LC1 contacts per village', priority: true },
  { id: 'cities', label: 'Cities We Operate In', icon: Globe, color: 'bg-teal-500/10 text-teal-600 border-teal-500/30', description: 'All cities with tenants & properties', priority: true },
  { id: 'no-landlord', label: 'No Landlord Listed', icon: UserX, color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', description: 'Tenants without landlord — contact to list & earn 5K', priority: true },
  { id: 'empty', label: 'Empty Houses', icon: DoorOpen, color: 'bg-red-500/10 text-red-600 border-red-500/30', description: 'Vacant properties losing revenue' },
  { id: 'occupied', label: 'Occupied Houses', icon: UserCheck, color: 'bg-green-500/10 text-green-600 border-green-500/30', description: 'Properties with active tenants' },
  { id: 'verify', label: 'Verification Queue', icon: ShieldCheck, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', description: 'Listings pending verification' },
  { id: 'pipeline', label: 'Deal Pipeline', icon: GitBranch, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', description: 'Rent approvals & deal flow' },
  { id: 'chain', label: 'Chain Health', icon: Link2, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', description: 'Property chain completeness' },
  { id: 'matching', label: 'Tenant Matching', icon: Handshake, color: 'bg-primary/10 text-primary border-primary/30', description: 'Match tenants to empty houses' },
  { id: 'agents', label: 'Listing Agents', icon: Users, color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30', description: 'Agent performance rankings' },
  { id: 'analytics', label: 'Analytics', icon: Banknote, color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', description: 'Photos, GPS & vacancy stats' },
  { id: 'advance-requests', label: 'Agent Advances', icon: Banknote, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', description: 'Review advance requests' },
];

export function LandlordOpsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<View>('home');
  const [search, setSearch] = useState('');
  const [landlordPage, setLandlordPage] = useState(1);
  const [landlordCategory, setLandlordCategory] = useState('all');
  const [verifying, setVerifying] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<{ images: string[]; title: string } | null>(null);
  const [adjustListing, setAdjustListing] = useState<ListingWithLandlord | null>(null);
  const [actionDialog, setActionDialog] = useState<{ listing: ListingWithLandlord; type: 'delete' | 'delist' | 'reject' } | null>(null);
  const [editLandlord, setEditLandlord] = useState<{ id: string; name: string; phone: string; [k: string]: any } | null>(null);
  const [editLC1, setEditLC1] = useState<{ id: string; name: string; phone: string | null; village: string | null; listingIds: string[] } | null>(null);
  const [deleteLandlord, setDeleteLandlord] = useState<{ id: string; name: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [assignPerson, setAssignPerson] = useState<{ listingId: string; title: string; type: 'landlord' | 'agent' } | null>(null);

  const handleAssignPerson = (listingId: string, title: string, type: 'landlord' | 'agent') => {
    setAssignPerson({ listingId, title, type });
  };

  // ─── House Listings Query ───
  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ['exec-house-listings-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('house_listings')
        .select(`
          id, title, house_category, monthly_rent, daily_rate, number_of_rooms, address, district, village, region,
          latitude, longitude, image_urls, lc1_chairperson_name, lc1_chairperson_phone, lc1_chairperson_village,
          agent_id, landlord_id, tenant_id, verified, listing_bonus_paid, created_at, status,
          landlords(id, name, phone, verified, mobile_money_name, mobile_money_number, has_smartphone, number_of_houses, bank_name, account_number, monthly_rent, caretaker_name, caretaker_phone, tin, electricity_meter_number, water_meter_number, village, district, region)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      const agentIds = [...new Set((data || []).map(d => d.agent_id).filter(Boolean))];
      const tenantIds = [...new Set((data || []).map(d => d.tenant_id).filter(Boolean))] as string[];
      let agentMap = new Map<string, { full_name: string | null; phone: string | null }>();
      let tenantMap = new Map<string, { full_name: string | null; phone: string | null }>();

      const profileFetches: (() => Promise<void>)[] = [];
      if (agentIds.length) {
        profileFetches.push(async () => {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', agentIds);
          if (profiles) agentMap = new Map(profiles.map(p => [p.id, p]));
        });
      }
      if (tenantIds.length) {
        profileFetches.push(async () => {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds);
          if (profiles) tenantMap = new Map(profiles.map(p => [p.id, p]));
        });
      }
      await Promise.all(profileFetches.map(fn => fn()));

      return (data || []).map(d => ({
        ...d,
        agent_name: agentMap.get(d.agent_id)?.full_name || null,
        agent_phone: agentMap.get(d.agent_id)?.phone || null,
        tenant_name: d.tenant_id ? (tenantMap.get(d.tenant_id)?.full_name || null) : null,
        tenant_phone: d.tenant_id ? (tenantMap.get(d.tenant_id)?.phone || null) : null,
      })) as ListingWithLandlord[];
    },
    staleTime: 60000,
  });

  // ─── All Landlords Direct Query ───
  const { data: allLandlords, refetch: refetchLandlords } = useQuery({
    queryKey: ['landlord-ops-all-landlords'],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('landlords')
          .select('id, name, phone, verified, has_smartphone, mobile_money_name, mobile_money_number, number_of_houses, bank_name, account_number, monthly_rent, caretaker_name, caretaker_phone, tin, electricity_meter_number, water_meter_number, village, district, region, property_address, tenant_id, registered_by, managed_by_agent_id, house_category, number_of_rooms, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) {
          console.error('Landlords query error:', error);
          hasMore = false;
          break;
        }
        if (data && data.length > 0) {
          allData.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      // Collect all landlord IDs to fetch tenants
      const landlordIds = allData.map(l => l.id);

      // Fetch tenant mappings from house_listings
      const landlordTenantsRaw: { landlord_id: string; tenant_id: string }[] = [];
      for (let i = 0; i < landlordIds.length; i += 50) {
        const { data: hlData } = await supabase
          .from('house_listings')
          .select('landlord_id, tenant_id')
          .in('landlord_id', landlordIds.slice(i, i + 50))
          .not('tenant_id', 'is', null);
        if (hlData) landlordTenantsRaw.push(...(hlData as any[]));
      }

      // Also fetch tenant-landlord links from rent_requests (primary linkage)
      for (let i = 0; i < landlordIds.length; i += 50) {
        const { data: rrData } = await supabase
          .from('rent_requests')
          .select('landlord_id, tenant_id')
          .in('landlord_id', landlordIds.slice(i, i + 50))
          .not('tenant_id', 'is', null);
        if (rrData) landlordTenantsRaw.push(...(rrData as any[]));
      }

      // Build landlord -> tenant_ids map
      const landlordTenantIdsMap = new Map<string, Set<string>>();
      landlordTenantsRaw.forEach(hl => {
        if (!hl.tenant_id) return;
        if (!landlordTenantIdsMap.has(hl.landlord_id)) landlordTenantIdsMap.set(hl.landlord_id, new Set());
        landlordTenantIdsMap.get(hl.landlord_id)!.add(hl.tenant_id);
      });

      // Collect all profile IDs to batch-fetch
      const profileIds = new Set<string>();
      allData.forEach(l => {
        if (l.tenant_id) profileIds.add(l.tenant_id);
        if (l.registered_by) profileIds.add(l.registered_by);
        if (l.managed_by_agent_id) profileIds.add(l.managed_by_agent_id);
      });
      // Add tenant IDs from house_listings
      landlordTenantsRaw.forEach(hl => { if (hl.tenant_id) profileIds.add(hl.tenant_id); });

      const idArr = [...profileIds];
      const profileMap = new Map<string, { full_name: string | null; phone: string | null }>();
      // Batch fetch in chunks of 50
      for (let i = 0; i < idArr.length; i += 50) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', idArr.slice(i, i + 50));
        if (profiles) profiles.forEach(p => profileMap.set(p.id, p));
      }

      return allData.map(l => {
        // Get all tenants from house_listings for this landlord
        const tenantIdSet = landlordTenantIdsMap.get(l.id);
        const tenants: { name: string; phone: string | null }[] = [];
        if (tenantIdSet) {
          tenantIdSet.forEach(tid => {
            const p = profileMap.get(tid);
            tenants.push({ name: p?.full_name || 'Unknown', phone: p?.phone || null });
          });
        }
        // Fallback: if no house_listings tenants but landlord has tenant_id
        if (tenants.length === 0 && l.tenant_id) {
          const p = profileMap.get(l.tenant_id);
          if (p) tenants.push({ name: p.full_name || 'Unknown', phone: p.phone || null });
        }

        return {
          ...l,
          tenants,
          tenant_name: l.tenant_id ? (profileMap.get(l.tenant_id)?.full_name || null) : null,
          tenant_phone_profile: l.tenant_id ? (profileMap.get(l.tenant_id)?.phone || null) : null,
          agent_name: (l.managed_by_agent_id ? profileMap.get(l.managed_by_agent_id)?.full_name : null) || (l.registered_by ? profileMap.get(l.registered_by)?.full_name : null) || null,
          agent_phone: (l.managed_by_agent_id ? profileMap.get(l.managed_by_agent_id)?.phone : null) || (l.registered_by ? profileMap.get(l.registered_by)?.phone : null) || null,
        };
      });
    },
    staleTime: 60000,
  });

  // ─── Rent Requests without Landlord Query ───
  const { data: noLandlordTenants } = useQuery({
    queryKey: ['landlord-ops-no-landlord'],
    queryFn: async () => {
      // Get rent requests that have NO house_listing with a landlord linked
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('id, tenant_id, agent_id, rent_amount, request_city, house_category, status, created_at')
        .in('status', ['pending', 'approved', 'funded', 'repaying'])
        .order('created_at', { ascending: false })
        .limit(500);

      if (!requests?.length) return [];

      // Get all house listings with landlord for these tenants
      const tenantIds = [...new Set(requests.map(r => r.tenant_id))];
      const { data: listingsWithLandlord } = await supabase
        .from('house_listings')
        .select('tenant_id, landlord_id')
        .in('tenant_id', tenantIds)
        .not('landlord_id', 'is', null);

      const tenantsWithLandlord = new Set((listingsWithLandlord || []).map(l => l.tenant_id));

      // Filter to only those without landlord
      const withoutLandlord = requests.filter(r => !tenantsWithLandlord.has(r.tenant_id));
      if (!withoutLandlord.length) return [];

      // Fetch profiles for tenants and agents
      const allTenantIds = [...new Set(withoutLandlord.map(r => r.tenant_id))];
      const allAgentIds = [...new Set(withoutLandlord.map(r => r.agent_id).filter(Boolean))] as string[];
      const allIds = [...new Set([...allTenantIds, ...allAgentIds])];

      const { data: profiles } = allIds.length
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', allIds)
        : { data: [] };

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      return withoutLandlord.map(r => ({
        id: r.id,
        tenant_id: r.tenant_id,
        tenant_name: profileMap.get(r.tenant_id)?.full_name || 'Unknown Tenant',
        tenant_phone: profileMap.get(r.tenant_id)?.phone || null,
        agent_id: r.agent_id,
        agent_name: r.agent_id ? (profileMap.get(r.agent_id)?.full_name || null) : null,
        agent_phone: r.agent_id ? (profileMap.get(r.agent_id)?.phone || null) : null,
        rent_amount: r.rent_amount,
        request_city: r.request_city,
        house_category: r.house_category,
        status: r.status,
        created_at: r.created_at,
      })) as TenantWithoutLandlord[];
    },
    staleTime: 60000,
  });

  const rows = listings || [];
  const landlordsList = allLandlords || [];
  const noLandlordList = noLandlordTenants || [];
  const unverifiedListings = rows.filter(l => !l.verified);
  const verifiedListings = rows.filter(l => l.verified);
  const withImages = rows.filter(l => l.image_urls && l.image_urls.length > 0);
  const withGPS = rows.filter(l => l.latitude && l.longitude);
  const emptyHouses = rows.filter(l => l.status === 'available' && !l.tenant_id);
  const occupiedHouses = rows.filter(l => l.tenant_id);

  // Landlord-level occupied/empty derived from tenants array (includes rent_requests linkage)
  const occupiedLandlords = landlordsList.filter(l => l.tenants && l.tenants.length > 0);
  const emptyLandlords = landlordsList.filter(l => !l.tenants || l.tenants.length === 0);

  // House count per landlord from house_listings
  const landlordHouseCounts = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      if (r.landlord_id) map.set(r.landlord_id, (map.get(r.landlord_id) || 0) + 1);
    });
    return map;
  }, [rows]);

  // Location grouping
  const locationGroups = useMemo(() => {
    const map = new Map<string, { region: string; district: string | null; count: number; occupied: number; empty: number }>();
    rows.forEach(r => {
      const key = `${r.region}|${r.district || ''}`;
      const existing = map.get(key);
      const isOccupied = !!r.tenant_id;
      if (existing) {
        existing.count++;
        if (isOccupied) existing.occupied++; else existing.empty++;
      } else {
        map.set(key, { region: r.region, district: r.district, count: 1, occupied: isOccupied ? 1 : 0, empty: isOccupied ? 0 : 1 });
      }
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  // ─── Cities grouping (from listings + rent requests) ───
  const cityGroups = useMemo(() => {
    const map = new Map<string, { city: string; listingCount: number; tenantCount: number }>();
    // From house listings
    rows.forEach(r => {
      const city = r.region?.trim();
      if (!city) return;
      const existing = map.get(city.toLowerCase());
      if (existing) {
        existing.listingCount++;
      } else {
        map.set(city.toLowerCase(), { city, listingCount: 1, tenantCount: 0 });
      }
    });
    // From rent requests (request_city)
    noLandlordList.forEach(r => {
      const city = r.request_city?.trim();
      if (!city) return;
      const key = city.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.tenantCount++;
      } else {
        map.set(key, { city, listingCount: 0, tenantCount: 1 });
      }
    });
    return [...map.values()].sort((a, b) => (b.listingCount + b.tenantCount) - (a.listingCount + a.tenantCount));
  }, [rows, noLandlordList]);

  // LC1 grouping from house_listings (kept for backward compat)
  const lc1GroupsFromListings = useMemo(() => {
    const map = new Map<string, { name: string; phone: string | null; village: string | null; houseCount: number; listingIds: string[] }>();
    rows.forEach(r => {
      if (!r.lc1_chairperson_name) return;
      const key = `${r.lc1_chairperson_name}|${r.lc1_chairperson_phone || ''}`;
      const existing = map.get(key);
      if (existing) {
        existing.houseCount++;
        existing.listingIds.push(r.id);
      } else {
        map.set(key, { name: r.lc1_chairperson_name, phone: r.lc1_chairperson_phone, village: r.lc1_chairperson_village, houseCount: 1, listingIds: [r.id] });
      }
    });
    return [...map.values()].sort((a, b) => b.houseCount - a.houseCount);
  }, [rows]);

  // ─── Full LC1 Chairpersons Query (from lc1_chairpersons table) ───
  const { data: fullLC1Data, refetch: refetchLC1 } = useQuery({
    queryKey: ['landlord-ops-full-lc1'],
    queryFn: async () => {
      // 1. Fetch all LC1 chairpersons
      const allLC1: { id: string; name: string; phone: string; village: string; created_at: string }[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase.from('lc1_chairpersons').select('id, name, phone, village, created_at')
          .order('name').range(offset, offset + 999);
        if (data && data.length > 0) { allLC1.push(...data); offset += 1000; hasMore = data.length === 1000; }
        else hasMore = false;
      }

      // 2. Get landlord links via rent_requests.lc1_id
      const lc1Ids = allLC1.map(l => l.id);
      const landlordIdsByLC1 = new Map<string, Set<string>>();
      for (let i = 0; i < lc1Ids.length; i += 50) {
        const { data: rr } = await supabase.from('rent_requests')
          .select('lc1_id, landlord_id')
          .in('lc1_id', lc1Ids.slice(i, i + 50))
          .not('landlord_id', 'is', null);
        if (rr) rr.forEach(r => {
          if (!r.landlord_id) return;
          if (!landlordIdsByLC1.has(r.lc1_id)) landlordIdsByLC1.set(r.lc1_id, new Set());
          landlordIdsByLC1.get(r.lc1_id)!.add(r.landlord_id);
        });
      }

      // 3. Also link via house_listings phone match
      const lc1PhoneMap = new Map(allLC1.map(l => [l.phone, l.id]));
      const listingPhones = [...new Set(rows.filter(r => r.lc1_chairperson_phone).map(r => r.lc1_chairperson_phone!))];
      rows.forEach(r => {
        if (!r.lc1_chairperson_phone || !r.landlord_id) return;
        const lc1Id = lc1PhoneMap.get(r.lc1_chairperson_phone);
        if (lc1Id) {
          if (!landlordIdsByLC1.has(lc1Id)) landlordIdsByLC1.set(lc1Id, new Set());
          landlordIdsByLC1.get(lc1Id)!.add(r.landlord_id);
        }
      });

      // 4. Fetch all unique landlord details
      const allLandlordIds = [...new Set([...landlordIdsByLC1.values()].flatMap(s => [...s]))];
      const landlordMap = new Map<string, { id: string; name: string; phone: string; property_address: string; verified: boolean | null; village: string | null }>();
      for (let i = 0; i < allLandlordIds.length; i += 50) {
        const { data: ll } = await supabase.from('landlords')
          .select('id, name, phone, property_address, verified, village')
          .in('id', allLandlordIds.slice(i, i + 50));
        if (ll) ll.forEach(l => landlordMap.set(l.id, l));
      }

      // 5. Build final data
      return allLC1.map(lc1 => {
        const landlordIds = landlordIdsByLC1.get(lc1.id);
        const landlords = landlordIds
          ? [...landlordIds].map(lid => landlordMap.get(lid)).filter(Boolean) as { id: string; name: string; phone: string; property_address: string; verified: boolean | null; village: string | null }[]
          : [];
        // Also get listingIds from house_listings for edit dialog
        const listingIds = rows.filter(r => r.lc1_chairperson_phone === lc1.phone).map(r => r.id);
        return { ...lc1, landlords, listingIds };
      });
    },
    staleTime: 60000,
    enabled: view === 'lc1' || view === 'home',
  });

  // ─── Paid Landlords Count (for nav badge) ───
  const { data: paidLandlordsCount } = useQuery({
    queryKey: ['landlord-ops-paid-landlords-count'],
    queryFn: async () => {
      const { data } = await supabase
        .from('disbursement_records')
        .select('landlord_id')
        .not('landlord_id', 'is', null);
      const set = new Set<string>();
      (data || []).forEach((r: any) => { if (r.landlord_id) set.add(r.landlord_id); });
      return set.size;
    },
    staleTime: 60_000,
  });

  const lc1Groups = fullLC1Data || [];

  const verifiedLandlords = landlordsList.filter(l => l.verified);
  const smartphoneLandlords = landlordsList.filter(l => l.has_smartphone);

  const handleVerifyListing = async (listing: ListingWithLandlord) => {
    if (!user) return;
    setVerifying(listing.id);
    try {
      const { data, error } = await supabase.functions.invoke('credit-listing-bonus', {
        body: { listing_id: listing.id },
      });
      console.log('[handleVerifyListing] Response:', { data, error });
      if (error) {
        const { extractFromErrorObject } = await import('@/lib/extractEdgeFunctionError');
        const msg = await extractFromErrorObject(error, 'Verification failed');
        console.error('[handleVerifyListing] Edge function error:', msg, error);
        throw new Error(msg);
      }
      if (data?.error) {
        console.error('[handleVerifyListing] Data error:', data.error);
        throw new Error(data.error);
      }
      if (data?.already_paid) {
        toast({ title: '✅ Already Verified', description: 'This listing was already verified and bonus paid.' });
      } else {
        toast({
          title: '✅ Verified → UGX 5,000 Credited',
          description: `${listing.title} verified. UGX 5,000 instantly credited to the agent's commission wallet.`,
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

  // Agent grouping
  const agentSummary = useMemo(() => {
    const map = new Map<string, { name: string; phone: string | null; listings: ListingWithLandlord[] }>();
    for (const l of rows) {
      const existing = map.get(l.agent_id);
      if (existing) {
        existing.listings.push(l);
      } else {
        map.set(l.agent_id, { name: l.agent_name || 'No agent profile', phone: l.agent_phone || null, listings: [l] });
      }
    }
    return [...map.entries()].sort((a, b) => b[1].listings.length - a[1].listings.length);
  }, [rows]);

  const totalMonthlyRevenue = occupiedLandlords.reduce((s, l) => s + (l.monthly_rent || 0), 0);
  const lostMonthlyRevenue = emptyLandlords.reduce((s, l) => s + (l.monthly_rent || 0), 0);

  // ─── Back Button ───
  const BackButton = () => (
    <button
      onClick={() => { setView('home'); setSearch(''); }}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 min-h-[44px] touch-manipulation"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Overview
    </button>
  );

  const refetchAll = () => { refetch(); refetchLandlords(); refetchLC1(); };

  // ─── LANDLORDS VIEW ───
  if (view === 'landlords') {
    type LandlordCategory = 'all' | 'verified' | 'pending' | 'has_tenants' | 'no_tenants';
    const LANDLORD_CATEGORIES: { value: LandlordCategory; label: string; color: string }[] = [
      { value: 'all', label: 'All', color: 'bg-muted text-foreground' },
      { value: 'verified', label: 'Verified', color: 'bg-emerald-100 text-emerald-700' },
      { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-700' },
      { value: 'has_tenants', label: 'Has Tenants', color: 'bg-blue-100 text-blue-700' },
      { value: 'no_tenants', label: 'No Tenants', color: 'bg-orange-100 text-orange-700' },
    ];

    const perPage = 20;
    const categoryFilter = (landlordCategory || 'all') as LandlordCategory;

    let filtered = landlordsList;

    // Category filter
    if (categoryFilter === 'verified') filtered = filtered.filter(l => l.verified);
    else if (categoryFilter === 'pending') filtered = filtered.filter(l => !l.verified);
    else if (categoryFilter === 'has_tenants') filtered = filtered.filter(l => l.tenants && l.tenants.length > 0);
    else if (categoryFilter === 'no_tenants') filtered = filtered.filter(l => !l.tenants || l.tenants.length === 0);

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l =>
        l.name?.toLowerCase().includes(q) || l.phone?.includes(q) ||
        l.tenant_name?.toLowerCase().includes(q) || l.agent_name?.toLowerCase().includes(q)
      );
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const safePage = Math.min(landlordPage, totalPages);
    const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

    const categoryCounts = {
      all: landlordsList.length,
      verified: landlordsList.filter(l => l.verified).length,
      pending: landlordsList.filter(l => !l.verified).length,
      has_tenants: landlordsList.filter(l => l.tenants && l.tenants.length > 0).length,
      no_tenants: landlordsList.filter(l => !l.tenants || l.tenants.length === 0).length,
    };

    return (
      <>
      <div className="space-y-3">
        <BackButton />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><Building2 className="h-5 w-5 text-sky-600" /> All Landlords</h2>
          <span className="text-xs text-muted-foreground">{filtered.length} landlords</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, tenant, agent…" value={search} onChange={e => { setSearch(e.target.value); setLandlordPage(1); }} className="pl-9 h-9" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>

        {/* Category filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {LANDLORD_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => { setLandlordCategory(cat.value); setLandlordPage(1); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                categoryFilter === cat.value
                  ? `${cat.color} border-current shadow-sm`
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {cat.label}
              <span className="ml-1 opacity-70">({categoryCounts[cat.value]})</span>
            </button>
          ))}
        </div>

        {/* Landlord list table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Name</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Phone</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Tenants</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden lg:table-cell">Agent</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No landlords found</td></tr>
              ) : (
                paginated.map(landlord => {
                  const tenantCount = landlord.tenants?.length || 0;
                  return (
                    <tr key={landlord.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-foreground">{landlord.name}</span>
                        <span className="sm:hidden block text-[11px] text-muted-foreground">{landlord.phone || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{landlord.phone || '—'}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {landlord.verified ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-0">Verified</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-0">Pending</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{tenantCount > 0 ? tenantCount : '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[120px] hidden lg:table-cell">{landlord.agent_name || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEditLandlord({ ...landlord })}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {filtered.length > perPage && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Showing {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLandlordPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLandlordPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
      <LandlordDialogs
        editLandlord={editLandlord} setEditLandlord={setEditLandlord}
        editLC1={editLC1} setEditLC1={setEditLC1}
        assignPerson={assignPerson} setAssignPerson={setAssignPerson}
        deleteLandlord={deleteLandlord} setDeleteLandlord={setDeleteLandlord}
        deleteReason={deleteReason} setDeleteReason={setDeleteReason}
        deleting={deleting} setDeleting={setDeleting}
        previewImages={previewImages} setPreviewImages={setPreviewImages}
        adjustListing={adjustListing} setAdjustListing={setAdjustListing}
        actionDialog={actionDialog} setActionDialog={setActionDialog}
        user={user} refetchAll={refetchAll}
      />
      </>
    );
  }

  // ─── LOCATIONS VIEW ───
  if (view === 'locations') {
    const filtered = search
      ? locationGroups.filter(g => g.region.toLowerCase().includes(search.toLowerCase()) || g.district?.toLowerCase().includes(search.toLowerCase()))
      : locationGroups;
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><MapPin className="h-5 w-5 text-purple-600" /> Locations ({locationGroups.length})</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search region or district…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        <div className="space-y-2">
          {filtered.map((loc, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{loc.region}</p>
                  {loc.district && <p className="text-xs text-muted-foreground truncate">{loc.district}</p>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <Badge variant="outline" className="text-[10px] font-bold">{loc.count} houses</Badge>
                <div className="flex gap-1">
                  <Badge className="bg-green-500/20 text-green-700 border-0 text-[9px]">{loc.occupied} occupied</Badge>
                  {loc.empty > 0 && <Badge className="bg-red-500/20 text-red-700 border-0 text-[9px]">{loc.empty} empty</Badge>}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No locations found</p>}
        </div>
      </div>
    );
  }

  // ─── LC1 VIEW ───
  if (view === 'lc1') {
    const filtered = search
      ? lc1Groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || g.village?.toLowerCase().includes(search.toLowerCase()) || g.phone?.includes(search))
      : lc1Groups;
    return (
      <>
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /> LC1 Chairpersons ({lc1Groups.length})</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, village, or phone…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        <div className="space-y-2">
          {filtered.map((lc1) => (
            <div key={lc1.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-sm">{lc1.name}</p>
                  {lc1.village && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{lc1.village}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditLC1({ id: lc1.id, name: lc1.name, phone: lc1.phone, village: lc1.village, listingIds: lc1.listingIds })}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors min-h-[32px]"
                    title="Edit LC1"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <Badge variant="outline" className="text-[10px]">{lc1.landlords.length} {lc1.landlords.length === 1 ? 'landlord' : 'landlords'}</Badge>
                </div>
              </div>
              {lc1.phone && <PhoneLinks phone={lc1.phone} name={lc1.name} />}
              {/* Landlords under this LC1 */}
              {lc1.landlords.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-primary/20 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Landlords</p>
                  {lc1.landlords.map(ll => (
                    <div key={ll.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{ll.name}</p>
                        {ll.property_address && <p className="text-[10px] text-muted-foreground truncate">{ll.property_address}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ll.verified && <Badge className="bg-emerald-500/20 text-emerald-700 border-0 text-[9px] h-4 px-1">Verified</Badge>}
                        <PhoneLinks phone={ll.phone} name={ll.name} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No LC1 chairpersons found</p>}
          {lc1Groups.length === 0 && !search && <p className="text-center text-muted-foreground py-8">No LC1 data recorded yet</p>}
        </div>
      </div>
      <LandlordDialogs
        editLandlord={editLandlord} setEditLandlord={setEditLandlord}
        editLC1={editLC1} setEditLC1={setEditLC1}
        assignPerson={assignPerson} setAssignPerson={setAssignPerson}
        deleteLandlord={deleteLandlord} setDeleteLandlord={setDeleteLandlord}
        deleteReason={deleteReason} setDeleteReason={setDeleteReason}
        deleting={deleting} setDeleting={setDeleting}
        previewImages={previewImages} setPreviewImages={setPreviewImages}
        adjustListing={adjustListing} setAdjustListing={setAdjustListing}
        actionDialog={actionDialog} setActionDialog={setActionDialog}
        user={user} refetchAll={refetchAll}
      />
      </>
    );
  }

  // ─── CITIES VIEW ───
  if (view === 'cities') {
    const filtered = search
      ? cityGroups.filter(g => g.city.toLowerCase().includes(search.toLowerCase()))
      : cityGroups;
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><Globe className="h-5 w-5 text-teal-600" /> Cities We Operate In ({cityGroups.length})</h2>
        <div className="rounded-xl border-2 border-teal-500/30 bg-teal-500/5 p-3 flex items-center gap-3">
          <Globe className="h-5 w-5 text-teal-600 shrink-0" />
          <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">
            🌍 Welile is active in <span className="font-extrabold">{cityGroups.length}</span> {cityGroups.length === 1 ? 'city' : 'cities'}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search city…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        <div className="space-y-2">
          {filtered.map((city, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-teal-600" />
                </div>
                <p className="font-bold text-sm truncate">{city.city}</p>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                {city.listingCount > 0 && (
                  <Badge className="bg-green-500/20 text-green-700 border-0 text-[10px]">
                    <Home className="h-2.5 w-2.5 mr-0.5" />{city.listingCount} {city.listingCount === 1 ? 'house' : 'houses'}
                  </Badge>
                )}
                {city.tenantCount > 0 && (
                  <Badge className="bg-blue-500/20 text-blue-700 border-0 text-[10px]">
                    <Users className="h-2.5 w-2.5 mr-0.5" />{city.tenantCount} {city.tenantCount === 1 ? 'tenant' : 'tenants'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No cities found</p>}
        </div>
      </div>
    );
  }

  // ─── NO LANDLORD VIEW ───
  if (view === 'no-landlord') {
    const filtered = search
      ? noLandlordList.filter(t =>
          t.tenant_name.toLowerCase().includes(search.toLowerCase()) ||
          t.tenant_phone?.includes(search) ||
          t.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
          t.request_city?.toLowerCase().includes(search.toLowerCase())
        )
      : noLandlordList;
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><UserX className="h-5 w-5 text-orange-600" /> No Landlord Listed ({noLandlordList.length})</h2>
        {noLandlordList.length > 0 && (
          <div className="rounded-xl border-2 border-orange-400/40 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-1">
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
              📢 {noLandlordList.length} tenants have no landlord property listed
            </p>
            <p className="text-[11px] text-orange-700 dark:text-orange-400">
              Contact them or their agents to list the property and earn UGX 5,000 bonus!
            </p>
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tenant, agent, or city…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        <div className="space-y-2">
          {filtered.map(t => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              {/* Tenant info */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{t.tenant_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-[10px]">UGX {t.rent_amount.toLocaleString()}</Badge>
                    {t.request_city && (
                      <Badge className="bg-teal-500/20 text-teal-700 border-0 text-[10px]">
                        <MapPin className="h-2.5 w-2.5 mr-0.5" />{t.request_city}
                      </Badge>
                    )}
                    {t.house_category && (
                      <Badge variant="outline" className="text-[10px]">{t.house_category}</Badge>
                    )}
                    <Badge className={`border-0 text-[10px] ${
                      t.status === 'repaying' ? 'bg-green-500/20 text-green-700' :
                      t.status === 'approved' || t.status === 'funded' ? 'bg-blue-500/20 text-blue-700' :
                      'bg-amber-500/20 text-amber-700'
                    }`}>{t.status}</Badge>
                  </div>
                </div>
                <Badge className="bg-orange-500/20 text-orange-700 border-0 text-[10px] shrink-0">
                  <UserX className="h-2.5 w-2.5 mr-0.5" />No Landlord
                </Badge>
              </div>

              {/* Contact Tenant */}
              {t.tenant_phone && (
                <div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contact Tenant</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{t.tenant_name}</span>
                    <ListPropertyCTA phone={t.tenant_phone} name={t.tenant_name} role="tenant" />
                  </div>
                </div>
              )}

              {/* Contact Agent */}
              {t.agent_id && t.agent_phone && (
                <div className="rounded-lg bg-indigo-500/10 p-2.5 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contact Agent</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{t.agent_name || 'Agent'}</span>
                    <ListPropertyCTA phone={t.agent_phone} name={t.agent_name || undefined} role="agent" />
                  </div>
                </div>
              )}
              {t.agent_id && !t.agent_phone && (
                <div className="rounded-lg bg-red-500/10 p-2.5">
                  <p className="text-[10px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                    <UserX className="h-3 w-3" /> Agent profile missing — no contact info
                  </p>
                </div>
              )}
              {!t.agent_id && (
                <div className="rounded-lg bg-red-500/10 p-2.5">
                  <p className="text-[10px] font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                    <UserX className="h-3 w-3" /> No agent assigned
                  </p>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
              <p className="font-semibold">All tenants have landlords listed! 🎉</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── EMPTY HOUSES VIEW ───
  if (view === 'empty') {
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><DoorOpen className="h-5 w-5 text-destructive" /> Empty Houses ({emptyLandlords.length})</h2>
        {emptyLandlords.length > 0 && (
          <div className="rounded-xl border-2 border-destructive/30 p-3 flex items-start gap-3">
            <DoorOpen className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-destructive">{emptyLandlords.length} empty — UGX {fmt(lostMonthlyRevenue)}/mo lost revenue</p>
          </div>
        )}
        <div className="space-y-2">
          {emptyLandlords.map(landlord => {
            const houseCount = landlordHouseCounts.get(landlord.id) || landlord.number_of_houses || 0;
            return (
              <div key={landlord.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{landlord.name}</p>
                    {landlord.phone && <p className="text-xs text-muted-foreground">{landlord.phone}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{houseCount} {houseCount === 1 ? 'house' : 'houses'}</Badge>
                </div>
                <div className="rounded-lg bg-orange-500/10 px-2.5 py-1.5">
                  <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1">
                    <UserX className="h-3 w-3" /> No tenants linked
                  </p>
                </div>
                {landlord.property_address && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{landlord.property_address}</p>}
              </div>
            );
          })}
          {emptyLandlords.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
              <p className="font-semibold">No empty houses! 🎉</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── OCCUPIED HOUSES VIEW ───
  if (view === 'occupied') {
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><UserCheck className="h-5 w-5 text-green-600" /> Occupied Houses ({occupiedLandlords.length})</h2>
        <div className="space-y-2">
          {occupiedLandlords.map(landlord => {
            const houseCount = landlordHouseCounts.get(landlord.id) || landlord.number_of_houses || 0;
            return (
              <div key={landlord.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{landlord.name}</p>
                    {landlord.phone && <p className="text-xs text-muted-foreground">{landlord.phone}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{houseCount} {houseCount === 1 ? 'house' : 'houses'}</Badge>
                </div>
                {landlord.tenants && landlord.tenants.length > 0 && (
                  <div className="space-y-1">
                    {landlord.tenants.map((t: { name: string; phone: string | null }, idx: number) => (
                      <div key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-green-500/10 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">👤 Tenant</p>
                          <p className="text-xs font-medium truncate">{t.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {landlord.property_address && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{landlord.property_address}</p>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── VERIFICATION VIEW ───
  if (view === 'verify') {
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /> Verification Queue ({unverifiedListings.length})</h2>
        <ListingBonusApprovalQueue filter="all" />
        <VerificationTimelinePanel />
        <div className="space-y-2">
          {unverifiedListings.map(house => (
            <div key={house.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <HouseCardInner house={house} onImages={setPreviewImages} onAssign={handleAssignPerson} />
              {/* LC1 Info */}
              {house.lc1_chairperson_name && (
                <div className="rounded-lg bg-amber-500/10 p-2 space-y-0.5">
                  <p className="text-[10px] font-semibold text-amber-700">LC1 Chairperson</p>
                  <p className="text-xs font-medium">{house.lc1_chairperson_name}</p>
                  {house.lc1_chairperson_phone && <PhoneLinks phone={house.lc1_chairperson_phone} name={house.lc1_chairperson_name} />}
                  {house.lc1_chairperson_village && <p className="text-[10px] text-muted-foreground">{house.lc1_chairperson_village}</p>}
                </div>
              )}
              <Button size="sm" className="w-full h-11 gap-2 font-bold" onClick={() => handleVerifyListing(house)} disabled={verifying === house.id}>
                {verifying === house.id ? <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify → Auto-Pay UGX 5K
              </Button>
            </div>
          ))}
          {unverifiedListings.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
              <p className="font-semibold">All listings verified! ✅</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── PIPELINE VIEW ───
  if (view === 'pipeline') {
    return (
      <div className="space-y-4">
        <BackButton />
        <RentPipelineQueue stage="agent_verified" />
        <DealPipeline />
      </div>
    );
  }

  // ─── CHAIN VIEW ───
  if (view === 'chain') {
    return (
      <div className="space-y-4">
        <BackButton />
        <ChainHealthTab />
      </div>
    );
  }

  // ─── MATCHING VIEW ───
  if (view === 'matching') {
    return (
      <div className="space-y-4">
        <BackButton />
        <TenantMatchingQueue onViewingCreated={() => refetch()} />
      </div>
    );
  }

  // ─── AGENTS VIEW ───
  if (view === 'agents') {
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><Users className="h-5 w-5 text-indigo-600" /> Listing Agents ({agentSummary.length})</h2>
        <div className="space-y-2">
          {agentSummary.map(([agentId, agent], idx) => {
            const empty = agent.listings.filter(l => l.status === 'available' && !l.tenant_id);
            const occupied = agent.listings.filter(l => l.tenant_id);
            const verified = agent.listings.filter(l => l.verified);
            const occupancyRate = agent.listings.length ? Math.round((occupied.length / agent.listings.length) * 100) : 0;
            return (
              <div key={agentId} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${idx < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{agent.name}</p>
                    {agent.phone && <PhoneLinks phone={agent.phone} name={agent.name} />}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
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
      </div>
    );
  }

  // ─── ANALYTICS VIEW ───
  if (view === 'analytics') {
    return (
      <div className="space-y-4">
        <BackButton />
        <h2 className="text-lg font-bold">Analytics</h2>
        <div className="grid grid-cols-2 gap-2">
          <KPICard title="With Photos" value={withImages.length} icon={Image} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
          <KPICard title="GPS Captured" value={withGPS.length} icon={MapPin} loading={isLoading} color="bg-purple-500/10 text-purple-600" />
          <KPICard title="📱 Landlords" value={smartphoneLandlords.length} icon={Smartphone} loading={isLoading} color="bg-teal-500/10 text-teal-600" subtitle={`of ${landlordsList.length}`} />
          <KPICard title="Bonuses Pending" value={`${fmt(unverifiedListings.length * 5000)}`} icon={Banknote} loading={isLoading} color="bg-orange-500/10 text-orange-600" subtitle="UGX to agents" />
        </div>
        <VacancyAnalytics listings={rows as any} />
      </div>
    );
  }

  // ─── ADVANCE REQUESTS VIEW ───
  if (view === 'advance-requests') {
    return (
      <div className="space-y-6">
        <BackButton />
        <h2 className="text-lg font-bold">Agent Advance Requests</h2>
        <AdvanceRequestsQueue stage="landlord_ops" />
        <BusinessAdvanceQueue stage="landlord_ops" />
        <RentHistoryVerificationQueue dept="landlord_ops" />
      </div>
    );
  }

  // ─── LANDLORDS PAID VIEW ───
  if (view === 'landlords-paid') {
    return (
      <div className="space-y-4">
        <BackButton />
        <LandlordsPaidView />
      </div>
    );
  }

  // ─── LANDLORDS & TENANTS VIEW ───
  if (view === 'landlords-tenants') {
    return (
      <div className="space-y-4">
        <BackButton />
        <LandlordsWithTenantsView />
      </div>
    );
  }

  // ─── HOME: Mobile-first card navigation ───
  return (
    <div className="space-y-4">
      {/* Priority actions */}
      <RentPipelineQueue stage="agent_verified" />
      <LandlordOpsPayoutReview reviewRole="landlord_ops" />

      {/* KPIs - compact grid */}
      <div className="grid grid-cols-2 gap-2">
        <KPICard title="Total Properties" value={landlordsList.length} icon={Home} loading={isLoading} />
        <KPICard title="Occupied" value={occupiedLandlords.length} icon={UserCheck} loading={isLoading} color="bg-green-500/10 text-green-600" subtitle={`UGX ${fmt(totalMonthlyRevenue)}/mo`} />
        <KPICard title="Empty" value={emptyLandlords.length} icon={DoorOpen} loading={isLoading} color="bg-red-500/10 text-red-600" subtitle={`UGX ${fmt(lostMonthlyRevenue)}/mo lost`} />
        <KPICard title="Landlords" value={landlordsList.length} icon={Building2} loading={isLoading} color="bg-sky-500/10 text-sky-600" subtitle={`${verifiedLandlords.length} verified`} />
        <KPICard title="Cities" value={cityGroups.length} icon={Globe} loading={isLoading} color="bg-teal-500/10 text-teal-600" subtitle="operating in" />
        <KPICard title="No Landlord" value={noLandlordList.length} icon={UserX} loading={isLoading} color="bg-orange-500/10 text-orange-600" subtitle="need listing" />
      </div>

      {/* Verification alert */}
      {unverifiedListings.length > 0 && (
        <button
          onClick={() => setView('verify')}
          className="w-full rounded-xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center gap-3 text-left min-h-[56px] touch-manipulation active:scale-[0.98] transition-transform"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">🚨 {unverifiedListings.length} pending verification</p>
            <p className="text-[10px] text-amber-700 dark:text-amber-400">UGX {fmt(unverifiedListings.length * 5000)} agent bonuses waiting</p>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-600 shrink-0" />
        </button>
      )}

      {/* No landlord alert */}
      {noLandlordList.length > 0 && (
        <button
          onClick={() => setView('no-landlord')}
          className="w-full rounded-xl border-2 border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 p-3 flex items-center gap-3 text-left min-h-[56px] touch-manipulation active:scale-[0.98] transition-transform"
        >
          <UserX className="h-5 w-5 text-orange-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-orange-800 dark:text-orange-300 text-sm">📢 {noLandlordList.length} tenants without landlord</p>
            <p className="text-[10px] text-orange-700 dark:text-orange-400">Contact them to list property & earn UGX 5,000</p>
          </div>
          <ChevronRight className="h-4 w-4 text-orange-600 shrink-0" />
        </button>
      )}

      {/* Navigation Cards */}
      <div className="space-y-2">
        {/* Priority items first */}
        {navItems.filter(n => n.priority).map(item => (
          <NavCard key={item.id} item={item} onClick={() => setView(item.id)} badge={
            item.id === 'landlords' ? `${landlordsList.length}` :
            item.id === 'landlords-paid' ? (paidLandlordsCount !== undefined ? `${paidLandlordsCount}` : undefined) :
            item.id === 'locations' ? `${locationGroups.length}` :
            item.id === 'lc1' ? `${lc1Groups.length}` :
            item.id === 'cities' ? `${cityGroups.length}` :
            item.id === 'no-landlord' ? `${noLandlordList.length}` : undefined
          } />
        ))}

        {/* Divider */}
        <div className="flex items-center gap-2 pt-2 pb-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] text-muted-foreground font-medium">MANAGEMENT</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {navItems.filter(n => !n.priority).map(item => (
          <NavCard key={item.id} item={item} onClick={() => setView(item.id)} badge={
            item.id === 'empty' ? `${emptyLandlords.length}` :
            item.id === 'occupied' ? `${occupiedLandlords.length}` :
            item.id === 'verify' ? (unverifiedListings.length > 0 ? `${unverifiedListings.length}` : undefined) :
            item.id === 'agents' ? `${agentSummary.length}` : undefined
          } />
        ))}
      </div>

      <LandlordDialogs
        editLandlord={editLandlord} setEditLandlord={setEditLandlord}
        editLC1={editLC1} setEditLC1={setEditLC1}
        assignPerson={assignPerson} setAssignPerson={setAssignPerson}
        deleteLandlord={deleteLandlord} setDeleteLandlord={setDeleteLandlord}
        deleteReason={deleteReason} setDeleteReason={setDeleteReason}
        deleting={deleting} setDeleting={setDeleting}
        previewImages={previewImages} setPreviewImages={setPreviewImages}
        adjustListing={adjustListing} setAdjustListing={setAdjustListing}
        actionDialog={actionDialog} setActionDialog={setActionDialog}
        user={user} refetchAll={refetchAll}
      />
    </div>
  );
}

// ─── Shared Dialogs Component ───
function LandlordDialogs({ editLandlord, setEditLandlord, editLC1, setEditLC1, assignPerson, setAssignPerson, deleteLandlord, setDeleteLandlord, deleteReason, setDeleteReason, deleting, setDeleting, previewImages, setPreviewImages, adjustListing, setAdjustListing, actionDialog, setActionDialog, user, refetchAll }: any) {
  const { toast } = useToast();
  return (
    <>
      {previewImages && (
        <ImagePreviewDialog images={previewImages.images} title={previewImages.title} open={!!previewImages} onClose={() => setPreviewImages(null)} />
      )}
      {adjustListing && (
        <RentAdjustmentDialog open={!!adjustListing} onOpenChange={(open: boolean) => !open && setAdjustListing(null)} listing={adjustListing} onSuccess={refetchAll} />
      )}
      {actionDialog && (
        <EmptyHouseActionDialog
          open={!!actionDialog}
          onOpenChange={(open: boolean) => !open && setActionDialog(null)}
          listingId={actionDialog.listing.id}
          listingTitle={actionDialog.listing.title}
          actionType={actionDialog.type}
          userId={user?.id || ''}
          onComplete={refetchAll}
        />
      )}
      <EditLandlordDialog
        landlord={editLandlord}
        open={!!editLandlord}
        onClose={() => setEditLandlord(null)}
        onSaved={refetchAll}
      />
      <EditLC1Dialog
        lc1={editLC1}
        open={!!editLC1}
        onClose={() => setEditLC1(null)}
        onSaved={refetchAll}
      />
      <AssignPersonDialog
        open={!!assignPerson}
        onClose={() => setAssignPerson(null)}
        listingId={assignPerson?.listingId || ''}
        listingTitle={assignPerson?.title || ''}
        personType={assignPerson?.type || 'landlord'}
        onSaved={refetchAll}
      />
      {/* Delete Landlord Confirmation */}
      <Dialog open={!!deleteLandlord} onOpenChange={(o: boolean) => { if (!o) { setDeleteLandlord(null); setDeleteReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base text-destructive">Delete Landlord</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteLandlord?.name}</strong>? This will unlink all associated house listings. This action cannot be undone.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium">Reason (min 10 chars) *</label>
            <Input
              value={deleteReason}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeleteReason(e.target.value)}
              placeholder="Why is this landlord being deleted?"
              className="h-10"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setDeleteLandlord(null); setDeleteReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleting || (deleteReason?.trim().length || 0) < 10}
              onClick={async () => {
                if (!deleteLandlord || !user) return;
                setDeleting(true);
                try {
                  await supabase.from('house_listings').update({ landlord_id: null }).eq('landlord_id', deleteLandlord.id);
                  const { error } = await supabase.from('landlords').delete().eq('id', deleteLandlord.id);
                  if (error) throw error;
                  await supabase.from('audit_logs').insert({
                    user_id: user.id,
                    action_type: 'landlord_deleted',
                    table_name: 'landlords',
                    record_id: deleteLandlord.id,
                    metadata: { landlord_name: deleteLandlord.name, reason: deleteReason.trim(), deleted_by: 'landlord_ops' },
                  });
                  toast({ title: '✅ Deleted', description: `${deleteLandlord.name} has been deleted successfully` });
                  setDeleteLandlord(null);
                  setDeleteReason('');
                  refetchAll();
                } catch (err: any) {
                  toast({ title: 'Delete failed', description: err.message || 'Failed to delete landlord', variant: 'destructive' });
                  console.error('Delete failed:', err);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Reusable Nav Card ───
function NavCard({ item, onClick, badge }: { item: typeof navItems[number]; onClick: () => void; badge?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 rounded-xl border ${item.color} transition-all text-left min-h-[64px] touch-manipulation active:scale-[0.98]`}
    >
      <div className={`h-10 w-10 rounded-xl ${item.color.split(' ')[0]} flex items-center justify-center shrink-0`}>
        <item.icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">{item.label}</p>
        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && <Badge variant="outline" className="text-[10px] font-bold">{badge}</Badge>}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

// ─── House Card (mobile-friendly) ───
function HouseCard({ house, onImages, onAdjust, onAction, showTenant, showLandlord, onAssign }: {
  house: ListingWithLandlord;
  onImages: (v: { images: string[]; title: string }) => void;
  onAdjust?: (v: ListingWithLandlord) => void;
  onAction?: (v: { listing: ListingWithLandlord; type: 'delete' | 'delist' | 'reject' }) => void;
  showTenant?: boolean;
  showLandlord?: boolean;
  onAssign?: (listingId: string, title: string, type: 'landlord' | 'agent') => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <HouseCardInner house={house} onImages={onImages} onAssign={onAssign} />
      {/* Tenant info */}
      {showTenant && house.tenant_id && (
        <div className="rounded-lg bg-green-500/10 p-2 space-y-0.5">
          <p className="text-[10px] font-semibold text-green-700">Tenant</p>
          <p className="text-xs font-medium">{house.tenant_name || 'Unknown'}</p>
          {house.tenant_phone && <PhoneLinks phone={house.tenant_phone} name={house.tenant_name || undefined} />}
        </div>
      )}
      {/* Landlord info */}
      {showLandlord && house.landlords && (
        <div className="rounded-lg bg-sky-500/10 p-2 space-y-0.5">
          <p className="text-[10px] font-semibold text-sky-700">Landlord</p>
          <p className="text-xs font-medium">{house.landlords.name}</p>
          <PhoneLinks phone={house.landlords.phone} name={house.landlords.name} />
          <div className="flex flex-wrap gap-1 mt-1">
            {house.landlords.verified ? (
              <Badge className="bg-green-500/20 text-green-700 border-0 text-[9px]">✅ Verified</Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-700 border-0 text-[9px]">⏳ Pending</Badge>
            )}
            {house.landlords.mobile_money_name && (
              <Badge variant="outline" className="text-[9px]">MoMo: {house.landlords.mobile_money_name}</Badge>
            )}
          </div>
        </div>
      )}
      {showLandlord && !house.landlords && (
        <div className="rounded-lg bg-orange-500/10 p-2">
          <p className="text-[10px] font-semibold text-orange-700 flex items-center gap-1">
            <UserX className="h-3 w-3" /> No landlord linked
          </p>
        </div>
      )}
      {/* Empty house actions */}
      {onAdjust && onAction && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="flex-1 h-10 text-xs gap-1" onClick={() => onAdjust(house)}>
            <TrendingDown className="h-3 w-3" /> Reduce
          </Button>
          <Button size="sm" variant="outline" className="h-10 text-xs gap-1 text-orange-600" onClick={() => onAction({ listing: house, type: 'reject' })}>
            <XCircle className="h-3 w-3" /> Reject
          </Button>
          <Button size="sm" variant="outline" className="h-10 text-xs gap-1 text-amber-600" onClick={() => onAction({ listing: house, type: 'delist' })}>
            <XCircle className="h-3 w-3" /> Delist
          </Button>
          <Button size="sm" variant="outline" className="h-10 text-xs gap-1 text-destructive" onClick={() => onAction({ listing: house, type: 'delete' })}>
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── House card inner content (shared) ───
function HouseCardInner({ house, onImages, onAssign }: { house: ListingWithLandlord; onImages: (v: { images: string[]; title: string }) => void; onAssign?: (listingId: string, title: string, type: 'landlord' | 'agent') => void }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted">
          {house.image_urls?.[0] ? (
            <button onClick={() => onImages({ images: house.image_urls!, title: house.title })} className="w-full h-full">
              <img src={house.image_urls[0]} alt="" className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Home className="h-5 w-5 text-muted-foreground/40" />
            </div>
          )}
        </div>
        {/* Details */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="font-bold text-sm truncate">{house.title}</p>
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5 shrink-0" />{house.region}{house.district ? `, ${house.district}` : ''}{house.village ? ` · ${house.village}` : ''}
          </p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            <Badge variant="outline" className="text-[9px] h-4 px-1">{house.house_category}</Badge>
            <Badge variant="outline" className="text-[9px] h-4 px-1">{house.number_of_rooms} rooms</Badge>
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-bold">UGX {house.daily_rate.toLocaleString()}/day</Badge>
            {house.verified ? (
              <Badge className="bg-green-500/20 text-green-700 border-0 text-[9px] h-4 px-1">✅</Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-700 border-0 text-[9px] h-4 px-1">⏳</Badge>
            )}
          </div>
          {/* GPS link */}
          {house.latitude && house.longitude && (
            <a href={`https://www.google.com/maps?q=${house.latitude},${house.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-[10px] mt-0.5">
              <MapPinned className="h-3 w-3" /> View on Map
            </a>
          )}
        </div>
      </div>
      {/* People: Landlord, Tenant, Agent — always visible */}
      <div className="grid grid-cols-1 gap-1.5">
        {house.landlords && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sky-500/10 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 flex items-center gap-1">
                🏠 Landlord
                {house.landlords.has_smartphone != null && (
                  house.landlords.has_smartphone
                    ? <span title="Has smartphone"><Smartphone className="h-3 w-3 text-green-600" /></span>
                    : <span className="text-[9px] text-orange-500" title="No smartphone">📵</span>
                )}
              </p>
              <p className="text-xs font-medium truncate">{house.landlords.name}</p>
            </div>
            <PhoneLinks phone={house.landlords.phone} name={house.landlords.name} />
          </div>
        )}
        {!house.landlords && (
          <div className="flex items-center justify-between gap-1.5 rounded-lg bg-orange-500/10 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <UserX className="h-3 w-3 text-orange-600 shrink-0" />
              <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400">No landlord linked</p>
            </div>
            {onAssign && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1 border-orange-300 text-orange-700 hover:bg-orange-100" onClick={() => onAssign(house.id, house.title, 'landlord')}>
                <UserPlus className="h-3 w-3" />Add
              </Button>
            )}
          </div>
        )}
        {house.tenant_name && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-green-500/10 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">👤 Tenant</p>
              <p className="text-xs font-medium truncate">{house.tenant_name}</p>
            </div>
            {house.tenant_phone && <PhoneLinks phone={house.tenant_phone} name={house.tenant_name} />}
          </div>
        )}
        {house.agent_name && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-indigo-500/10 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">🕵️ Agent</p>
              <p className="text-xs font-medium truncate">{house.agent_name}</p>
            </div>
            {house.agent_phone && <PhoneLinks phone={house.agent_phone} name={house.agent_name} />}
          </div>
        )}
        {!house.agent_name && (
          <div className="flex items-center justify-between gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <UserX className="h-3 w-3 text-red-600 shrink-0" />
              <p className="text-[10px] font-semibold text-red-700 dark:text-red-400">No agent linked</p>
            </div>
            {onAssign && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1 border-red-300 text-red-700 hover:bg-red-100" onClick={() => onAssign(house.id, house.title, 'agent')}>
                <UserPlus className="h-3 w-3" />Assign
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
