import { useState, useEffect, useMemo, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { RentPipelineQueue } from './RentPipelineQueue';
import { RejectedRequestsQueue } from './RejectedRequestsQueue';
import { BusinessAdvanceQueue } from '@/components/ops/BusinessAdvanceQueue';
import { RentHistoryVerificationQueue } from '@/components/ops/RentHistoryVerificationQueue';
import { LandlordOpsPayoutReview } from '@/components/cfo/LandlordOpsPayoutReview';
import { AgentRentCapacityPanel } from './AgentRentCapacityPanel';
import { KPICard } from './KPICard';
import { DrilldownTable, type DrilldownColumn } from './DrilldownTable';
import { EntityDetailSheet } from './EntityDetailSheet';
import {
  Home, Banknote, CheckCircle2, MapPin, AlertTriangle, ShieldCheck,
  Phone, MessageCircle, Image, MapPinned, DoorOpen, TrendingDown, Users,
  Building2, UserCheck, Smartphone, Handshake, GitBranch, Link2,
  ArrowLeft, ChevronRight, Search, X, Globe, UserX, UserPlus,
  Table2, Printer, CalendarIcon, Loader2, Upload, RotateCcw, Mail, Clock,
} from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';
import { LayoutGrid } from 'lucide-react';
import { Layers } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ChainHealthTab } from './landlord-ops/ChainHealthTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast as sonnerToast } from 'sonner';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { generateLandlordOpsReportPdf } from '@/lib/generateLandlordOpsReportPdf';
import { RentAdjustmentDialog } from './RentAdjustmentDialog';
import { VacancyAnalytics } from './VacancyAnalytics';
import { TenantMatchingQueue } from './landlord-ops/TenantMatchingQueue';
import { DealPipeline } from './landlord-ops/DealPipeline';
import { ListingBonusApprovalQueue } from './ListingBonusApprovalQueue';
import { VerificationTimelinePanel } from './landlord-ops/VerificationTimelinePanel';
import { EmptyHouseActionDialog } from './landlord-ops/EmptyHouseActionDialog';
import { AgentListingBlockControl } from './landlord-ops/AgentListingBlockControl';
import { Trash2, XCircle, Pencil } from 'lucide-react';
import { EditLandlordDialog } from './landlord-ops/EditLandlordDialog';
import { EditLC1Dialog } from './landlord-ops/EditLC1Dialog';
import { BulkImportLC1Dialog } from './landlord-ops/BulkImportLC1Dialog';
import { BulkImportLandlordsDialog } from './landlord-ops/BulkImportLandlordsDialog';
import { AssignPersonDialog } from './landlord-ops/AssignPersonDialog';
import { StorageImage } from '@/components/ui/StorageImage';
import { ChevronLeft } from 'lucide-react';
import { VerifyLc1Button } from '@/components/verification/VerifyLc1Button';
import { VerifyLandlordButton } from '@/components/verification/VerifyLandlordButton';
import { LandlordsPaidView } from './landlord-ops/LandlordsPaidView';
import { LandlordsWithTenantsView } from './landlord-ops/LandlordsWithTenantsView';
import { LandlordHousesPanel } from './landlord-ops/LandlordHousesPanel';
import { AgentVerificationRequestsPanel } from './landlord-ops/AgentVerificationRequestsPanel';
import { Lc1VerificationRequestsPanel } from './landlord-ops/Lc1VerificationRequestsPanel';
import { Lc1DuplicatesPanel } from './landlord-ops/Lc1DuplicatesPanel';
import { ResidenceVerificationPanel } from './landlord-ops/ResidenceVerificationPanel';


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
  is_hidden: boolean | null;
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
  agent_email?: string | null;
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
  const prev = () => setCurrent(c => (c - 1 + images.length) % images.length);
  const next = () => setCurrent(c => (c + 1) % images.length);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-2">
        <DialogHeader className="px-2 pt-2">
          <DialogTitle className="text-sm">{title} ({current + 1}/{images.length})</DialogTitle>
        </DialogHeader>
        <div className="relative bg-black/90 rounded-lg flex items-center justify-center" style={{ minHeight: '60vh' }}>
          <StorageImage src={images[current]} alt={title} className="w-full rounded-lg max-h-[80vh] object-contain" />
          {images.length > 1 && (
            <>
              <button onClick={prev} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={next} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-2 pb-2 pt-2">
            {images.map((url, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`shrink-0 h-16 w-16 rounded-md overflow-hidden border-2 transition-colors ${i === current ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                <StorageImage src={url} alt={`${title} ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type View = 'home' | 'landlords' | 'locations' | 'lc1' | 'residence-verify' | 'lc1-duplicates' | 'empty' | 'occupied' | 'verify' | 'pipeline' | 'chain' | 'matching' | 'agents' | 'analytics' | 'cities' | 'no-landlord' | 'advance-requests' | 'landlords-paid' | 'landlords-tenants' | 'all-requests' | 'houses-by-landlord';

// ─── Navigation Items ───
const navItems: { id: View; label: string; icon: typeof Building2; color: string; description: string; priority?: boolean }[] = [
  { id: 'landlords', label: 'All Landlords', icon: Building2, color: 'bg-sky-500/10 text-sky-600 border-sky-500/30', description: 'Directory with contacts & properties', priority: true },
  { id: 'landlords-tenants', label: 'Landlords & Tenants', icon: Users, color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30', description: 'All landlords with their tenants & paid/pending status', priority: true },
  { id: 'houses-by-landlord', label: 'Houses by Landlord', icon: Home, color: 'bg-primary/10 text-primary border-primary/30', description: 'Bind / swap / remove tenants on each house · reassign agents', priority: true },
  { id: 'landlords-paid', label: 'Landlords Paid', icon: Banknote, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', description: 'Disbursements from tenant rent', priority: true },
  { id: 'all-requests', label: 'All Requests', icon: Table2, color: 'bg-slate-500/10 text-slate-600 border-slate-500/30', description: 'Full table of every rent request (landlord lens)', priority: true },
  { id: 'locations', label: 'Locations', icon: MapPin, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', description: 'Regions, districts & house counts', priority: true },
  { id: 'lc1', label: 'LC1 Chairpersons', icon: ShieldCheck, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', description: 'LC1 contacts per village', priority: true },
  { id: 'residence-verify', label: 'GPS & LC1 Verification', icon: ShieldCheck, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30', description: 'Set landlord GPS & LC1 status (pending/verified/rejected)', priority: true },
  { id: 'lc1-duplicates', label: 'LC1 Duplicates', icon: Layers, color: 'bg-rose-500/10 text-rose-600 border-rose-500/30', description: 'Review & merge duplicate LC1 phone rows' },
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
  { id: 'advance-requests', label: 'Business Advances', icon: Banknote, color: 'bg-purple-500/10 text-purple-600 border-purple-500/30', description: 'Business advances & rent history' },
];

function TenantStatusFilter({
  tenants,
  landlordName,
  onOpenTenant,
}: {
  tenants: { id: string; name: string; phone: string | null; status: string }[];
  landlordName: string;
  onOpenTenant: (type: 'tenant', data: Record<string, unknown>) => void;
}) {
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const statusCounts = tenants.reduce<Record<string, number>>((acc, t) => {
    const s = (t.status || 'listed').toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const filtered = activeStatus
    ? tenants.filter(t => (t.status || 'listed').toLowerCase() === activeStatus)
    : tenants;

  const statusColorMap: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200',
    verified: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200',
    listed: 'bg-sky-100 text-sky-700 border-sky-300 hover:bg-sky-200',
    hidden: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200',
    rejected: 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200',
    default: 'bg-muted text-muted-foreground border-border hover:bg-accent',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Tenants Summary
        </p>
        <Badge variant="outline" className="text-[10px]">{filtered.length} / {tenants.length}</Badge>
      </div>
      {Object.keys(statusCounts).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(statusCounts).map(([status, count]) => {
            const active = activeStatus === status;
            const colorClass = statusColorMap[status] || statusColorMap.default;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setActiveStatus(active ? null : status)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize transition-all ${
                  active ? 'ring-1 ring-offset-1 ' + colorClass : colorClass
                }`}
                aria-pressed={active}
                title={active ? 'Click to clear filter' : `Show only ${status} tenants`}
              >
                {status.replace(/_/g, ' ')}
                <span className={`text-[9px] font-bold px-1 py-0 rounded-full ${active ? 'bg-white/40' : 'bg-black/5'}`}>
                  {count}
                </span>
              </button>
            );
          })}
          {activeStatus && (
            <button
              type="button"
              onClick={() => setActiveStatus(null)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted transition-all"
            >
              Reset
            </button>
          )}
        </div>
      )}
      <div className="space-y-1">
        {filtered.map((tn, idx) => (
          <button
            key={tn.id || idx}
            type="button"
            onClick={() => onOpenTenant('tenant', { ...tn, landlord_name: landlordName })}
            className="flex w-full items-center justify-between gap-2 rounded-lg bg-green-500/10 px-2.5 py-1.5 text-left transition-colors hover:bg-green-500/20 active:scale-[0.99] touch-manipulation"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium truncate">{tn.name}</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize shrink-0">
                {(tn.status || 'listed').replace(/_/g, ' ')}
              </Badge>
            </span>
            <span className="text-[10px] font-semibold text-green-700 shrink-0">View</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LandlordOpsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<View>('home');
  const [search, setSearch] = useState('');
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const [landlordPage, setLandlordPage] = useState(1);
  const [landlordCategory, setLandlordCategory] = useState('all');
  const [verifying, setVerifying] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Optimistically removed from the verification queue (until refetch confirms or rollback restores).
  const [optimisticallyVerifiedIds, setOptimisticallyVerifiedIds] = useState<Set<string>>(new Set());
  const [previewImages, setPreviewImages] = useState<{ images: string[]; title: string } | null>(null);
  const [adjustListing, setAdjustListing] = useState<ListingWithLandlord | null>(null);
  const [actionDialog, setActionDialog] = useState<{ listing: ListingWithLandlord; type: 'delete' | 'delist' | 'reject' } | null>(null);
  const [editLandlord, setEditLandlord] = useState<{ id: string; name: string; phone: string; [k: string]: any } | null>(null);
  const [editLC1, setEditLC1] = useState<{ id: string; name: string; phone: string | null; village: string | null; listingIds: string[] } | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportLandlordsOpen, setBulkImportLandlordsOpen] = useState(false);
  const [deleteLandlord, setDeleteLandlord] = useState<{ id: string; name: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [assignPerson, setAssignPerson] = useState<{ listingId: string; title: string; type: 'landlord' | 'agent' } | null>(null);
  // Landlord verification moderation (frontend session state).
  const [rejectedLandlordIds, setRejectedLandlordIds] = useState<Set<string>>(new Set());
  const [expandedLandlordId, setExpandedLandlordId] = useState<string | null>(null);
  // Drilldown row → entity detail sheet (cities / no-landlord tenants / landlords)
  const [entityDetail, setEntityDetail] = useState<
    | { type: 'city'; data: any }
    | { type: 'no-landlord'; data: any }
    | { type: 'landlord'; data: any }
    | { type: 'tenant'; data: any }
    | null
  >(null);
  // Deep-link params for shareable entity detail links (?entity=…&eid=…)
  const [searchParams, setSearchParams] = useSearchParams();

  const entityId = (type: 'city' | 'no-landlord' | 'landlord' | 'tenant', data: any): string =>
    type === 'city' ? data.city : data.id;

  const openEntity = (type: 'city' | 'no-landlord' | 'landlord' | 'tenant', data: any) => {
    setEntityDetail({ type, data });
    const next = new URLSearchParams(searchParams);
    next.set('entity', type);
    next.set('eid', entityId(type, data));
    setSearchParams(next, { replace: false });
  };

  const closeEntity = () => {
    setEntityDetail(null);
    const next = new URLSearchParams(searchParams);
    next.delete('entity');
    next.delete('eid');
    setSearchParams(next, { replace: true });
  };

  // ─── Verification Queue Search & Filters ───
  const [verifySearch, setVerifySearch] = useState('');
  type VerifyFilter = 'all' | 'has_landlord' | 'no_landlord' | 'has_images' | 'has_gps' | 'has_lc1';
  const [verifyFilter, setVerifyFilter] = useState<VerifyFilter>('all');
  // Scope: pending | verified | hidden | rejected | all — thumb-friendly status chips
  type HouseStatusFilter = 'pending' | 'verified' | 'hidden' | 'rejected' | 'all';
  const [houseStatusFilter, setHouseStatusFilter] = useState<HouseStatusFilter>(() => {
    const saved = localStorage.getItem('landlordOpsHouseFilter');
    if (saved === 'pending' || saved === 'verified' || saved === 'hidden' || saved === 'rejected' || saved === 'all') return saved;
    return 'pending';
  });
  useEffect(() => {
    localStorage.setItem('landlordOpsHouseFilter', houseStatusFilter);
  }, [houseStatusFilter]);
  const [togglingHide, setTogglingHide] = useState<Record<string, boolean>>({});
  const [editingRentId, setEditingRentId] = useState<string | null>(null);
  const [editRentValue, setEditRentValue] = useState<string>('');
  const [savingRentId, setSavingRentId] = useState<string | null>(null);
  // ─── Verification Queue bulk selection ───
  const [verifySelectedIds, setVerifySelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | 'hide' | 'unhide' | 'verify' | 'reject'>(null);
  const [bulkResult, setBulkResult] = useState<null | {
    action: string;
    results: { id: string; title: string; ok: boolean; error?: string }[];
  }>(null);

  // ─── Landlord Pending Quick Filters ───
  type PendingFilter = 'all' | 'has_address' | 'has_phone' | 'has_smartphone' | 'has_bank' | 'has_momo';
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>('all');

  // ─── LC1 Verification Filter ───
  type LC1VerifyFilter = 'all' | 'verified' | 'unverified';
  const [lc1VerifyFilter, setLc1VerifyFilter] = useState<LC1VerifyFilter>('all');

  // ─── Sorting ───
  type SortOption = 'newest' | 'oldest' | 'highest_rent' | 'recently_updated';
  const [verifySort, setVerifySort] = useState<SortOption>(() => {
    const saved = localStorage.getItem('landlordOpsVerifySort');
    if (saved === 'newest' || saved === 'oldest' || saved === 'highest_rent' || saved === 'recently_updated') return saved;
    return 'newest';
  });
  const [landlordSort, setLandlordSort] = useState<SortOption>(() => {
    const saved = localStorage.getItem('landlordOpsLandlordSort');
    if (saved === 'newest' || saved === 'oldest' || saved === 'highest_rent') return saved;
    return 'newest';
  });

  // ─── Verification date-range filter ───
  const [verifyDateFrom, setVerifyDateFrom] = useState<string>('');
  const [verifyDateTo, setVerifyDateTo] = useState<string>('');
  useEffect(() => {
    localStorage.setItem('landlordOpsVerifySort', verifySort);
  }, [verifySort]);
  useEffect(() => {
    localStorage.setItem('landlordOpsLandlordSort', landlordSort);
  }, [landlordSort]);

  // ─── All Requests delete state (mirrors Tenant Ops UX) ───
  const [allReqSelectedIds, setAllReqSelectedIds] = useState<string[]>([]);
  const [allReqDeleteDialog, setAllReqDeleteDialog] = useState<{ open: boolean; requestId: string; tenantName: string }>({ open: false, requestId: '', tenantName: '' });
  const [allReqBulkDeleteOpen, setAllReqBulkDeleteOpen] = useState(false);
  const [allReqDeleting, setAllReqDeleting] = useState(false);

  const handleDeleteOneRentRequest = async () => {
    if (!allReqDeleteDialog.requestId) return;
    setAllReqDeleting(true);
    try {
      const { error } = await supabase
        .from('rent_requests')
        .delete()
        .eq('id', allReqDeleteDialog.requestId);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'delete_rent_request_landlord_ops',
        table_name: 'rent_requests',
        record_id: allReqDeleteDialog.requestId,
        metadata: {
          reason: 'Deleted from Landlord Ops All Requests view',
          tenant_name: allReqDeleteDialog.tenantName,
        },
      });
      sonnerToast.success(`Request for "${allReqDeleteDialog.tenantName}" deleted`);
      setAllReqDeleteDialog({ open: false, requestId: '', tenantName: '' });
      queryClient.invalidateQueries({ queryKey: ['exec-landlord-ops-all-requests'] });
    } catch (e: any) {
      sonnerToast.error(e?.message || 'Failed to delete rent request');
    } finally {
      setAllReqDeleting(false);
    }
  };

  const handleBulkDeleteRentRequests = async () => {
    if (allReqSelectedIds.length === 0) return;
    setAllReqDeleting(true);
    try {
      const { error } = await supabase
        .from('rent_requests')
        .delete()
        .in('id', allReqSelectedIds);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'delete_rent_request_landlord_ops',
        table_name: 'rent_requests',
        record_id: allReqSelectedIds[0],
        metadata: {
          reason: 'Bulk deleted from Landlord Ops All Requests view',
          deleted_ids: allReqSelectedIds,
          deleted_count: allReqSelectedIds.length,
        },
      });
      sonnerToast.success(`${allReqSelectedIds.length} request${allReqSelectedIds.length === 1 ? '' : 's'} deleted`);
      setAllReqSelectedIds([]);
      setAllReqBulkDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['exec-landlord-ops-all-requests'] });
    } catch (e: any) {
      sonnerToast.error(e?.message || 'Failed to bulk delete rent requests');
    } finally {
      setAllReqDeleting(false);
    }
  };

  const handleAssignPerson = (listingId: string, title: string, type: 'landlord' | 'agent') => {
    setAssignPerson({ listingId, title, type });
  };

  // ─── Print Report (Landlord Payouts) state ───
  const [reportFrom, setReportFrom] = useState<Date | undefined>(undefined);
  const [reportTo, setReportTo] = useState<Date | undefined>(undefined);
  const [printingPdf, setPrintingPdf] = useState(false);

  const handlePrintReport = async () => {
    setPrintingPdf(true);
    try {
      const fromIso = reportFrom ? reportFrom.toISOString() : null;
      const toIso = (() => {
        if (!reportTo) return null;
        const end = new Date(reportTo);
        end.setHours(23, 59, 59, 999);
        return end.toISOString();
      })();

      // 1) Pull landlord payouts from the ledger (source of truth)
      let payQ = supabase
        .from('general_ledger')
        .select('user_id, amount, transaction_date, category, direction')
        .in('category', ['landlord_payout', 'rent_disbursement'])
        .eq('direction', 'cash_out');
      if (fromIso) payQ = payQ.gte('transaction_date', fromIso);
      if (toIso) payQ = payQ.lte('transaction_date', toIso);
      const { data: payouts, error: payErr } = await payQ;
      if (payErr) throw payErr;

      if (!payouts || payouts.length === 0) {
        sonnerToast.error('No landlord payouts found for the selected period');
        return;
      }

      const landlordIds = [...new Set(payouts.map(p => p.user_id).filter(Boolean) as string[])];
      const [llRes, rrRes] = await Promise.all([
        landlordIds.length
          ? supabase.from('landlords').select('id, name, phone').in('id', landlordIds)
          : Promise.resolve({ data: [] as any[] }),
        landlordIds.length
          ? supabase.from('rent_requests')
              .select('landlord_id, rent_amount, amount_repaid, status')
              .in('landlord_id', landlordIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const llMap = new Map(((llRes as any).data || []).map((l: any) => [l.id, l]));

      // Properties + outstanding owed per landlord (active plans only)
      const propsByLandlord = new Map<string, number>();
      const outstandingByLandlord = new Map<string, number>();
      for (const r of (((rrRes as any).data) || []) as any[]) {
        propsByLandlord.set(r.landlord_id, (propsByLandlord.get(r.landlord_id) || 0) + 1);
        if (['funded', 'disbursed', 'repaying'].includes(r.status)) {
          const out = Number(r.rent_amount || 0) - Number(r.amount_repaid || 0);
          outstandingByLandlord.set(r.landlord_id, (outstandingByLandlord.get(r.landlord_id) || 0) + Math.max(0, out));
        }
      }

      const byLandlord = new Map<string, { name: string; phone: string; paid: number; lastDate: string | null; }>();
      for (const p of payouts) {
        const id = p.user_id as string | null;
        if (!id) continue;
        const ll = llMap.get(id) as any;
        const row = byLandlord.get(id) || {
          name: (ll?.name) || '—',
          phone: (ll?.phone) || '—',
          paid: 0,
          lastDate: null as string | null,
        };
        row.paid += Number(p.amount || 0);
        if (p.transaction_date && (!row.lastDate || new Date(p.transaction_date) > new Date(row.lastDate))) {
          row.lastDate = p.transaction_date as string;
        }
        byLandlord.set(id, row);
      }

      const rows = Array.from(byLandlord.entries())
        .map(([id, l]) => ({
          landlord_name: l.name,
          landlord_phone: l.phone,
          properties: propsByLandlord.get(id) || 0,
          amount_paid_out: l.paid,
          outstanding_to_landlord: outstandingByLandlord.get(id) || 0,
          last_payout_date: l.lastDate,
        }))
        .sort((a, b) => b.amount_paid_out - a.amount_paid_out);

      const blob = generateLandlordOpsReportPdf(rows, { from: reportFrom, to: reportTo });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = reportFrom || reportTo
        ? `${reportFrom ? format(reportFrom, 'yyyy-MM-dd') : 'start'}-to-${reportTo ? format(reportTo, 'yyyy-MM-dd') : 'today'}`
        : format(new Date(), 'yyyy-MM-dd');
      a.download = `welile-landlord-payouts-${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      sonnerToast.success('Landlord Payouts Report downloaded');
    } catch (err: any) {
      sonnerToast.error(err?.message || 'Failed to generate report');
    } finally {
      setPrintingPdf(false);
    }
  };

  // ─── All Requests (landlord lens) data ───
  const { data: allRequestsRows, isLoading: allRequestsLoading } = useQuery({
    queryKey: ['exec-landlord-ops-all-requests'],
    queryFn: async () => {
      const { data } = await supabase.from('rent_requests')
        .select('id, status, rent_amount, amount_repaid, created_at, tenant_id, landlord_id, agent_id')
        .order('created_at', { ascending: false }).limit(200);
      const items = data || [];
      const tenantIds = [...new Set(items.map(r => r.tenant_id).filter(Boolean))];
      const landlordIds = [...new Set(items.map(r => r.landlord_id).filter(Boolean))];
      const agentIds = [...new Set(items.map(r => r.agent_id).filter(Boolean))];
      const [tenantsRes, landlordsRes, agentsRes] = await Promise.all([
        tenantIds.length ? supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds.slice(0, 100)) : { data: [] },
        landlordIds.length ? supabase.from('landlords').select('id, name, phone').in('id', landlordIds.slice(0, 100)) : { data: [] },
        agentIds.length ? supabase.from('profiles').select('id, full_name').in('id', agentIds.slice(0, 100)) : { data: [] },
      ]);
      const tMap = new Map(((tenantsRes as any).data || []).map((p: any) => [p.id, p]));
      const lMap = new Map(((landlordsRes as any).data || []).map((l: any) => [l.id, l]));
      const aMap = new Map(((agentsRes as any).data || []).map((a: any) => [a.id, a]));
      return items.map(r => ({
        ...r,
        tenant_name: (tMap.get(r.tenant_id) as any)?.full_name || '—',
        tenant_phone: (tMap.get(r.tenant_id) as any)?.phone || '—',
        landlord_name: (lMap.get(r.landlord_id) as any)?.name || '—',
        landlord_phone: (lMap.get(r.landlord_id) as any)?.phone || '—',
        agent_name: r.agent_id ? ((aMap.get(r.agent_id) as any)?.full_name || '—') : 'Unassigned',
      }));
    },
    enabled: view === 'all-requests' || view === 'home',
    staleTime: 600000,
  });

  const allRequestsColumns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
    { key: 'tenant_name', label: 'Tenant' },
    { key: 'tenant_phone', label: 'Phone' },
    { key: 'status', label: 'Status', render: (v) => {
      const colors: Record<string, string> = {
        pending: 'bg-amber-100 text-amber-700',
        tenant_ops_approved: 'bg-blue-100 text-blue-700',
        agent_verified: 'bg-purple-100 text-purple-700',
        landlord_ops_approved: 'bg-indigo-100 text-indigo-700',
        coo_approved: 'bg-emerald-100 text-emerald-700',
        funded: 'bg-green-100 text-green-700',
        disbursed: 'bg-teal-100 text-teal-700',
        repaying: 'bg-purple-100 text-purple-700',
        fully_repaid: 'bg-emerald-100 text-emerald-700',
        defaulted: 'bg-destructive/10 text-destructive',
      };
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[String(v)] || 'bg-muted'}`}>{String(v).replace(/_/g, ' ')}</span>;
    }},
    { key: 'rent_amount', label: 'Amount', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'amount_repaid', label: 'Repaid', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'agent_name', label: 'Current Agent', render: (v) => (
      <span className={`text-xs ${v === 'Unassigned' ? 'text-muted-foreground italic' : 'font-medium'}`}>{String(v ?? '—')}</span>
    )},
    { key: 'landlord_name', label: 'Landlord' },
    { key: 'landlord_phone', label: 'L. Phone' },
    { key: 'id', label: 'Action', render: (_v, row) => (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          setAllReqDeleteDialog({ open: true, requestId: String(row.id), tenantName: row.tenant_name || 'Unknown' });
        }}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Delete
      </Button>
    )},
  ];

  // ─── House Listings Query ───
  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ['exec-house-listings-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('house_listings')
        .select(`
          id, title, house_category, monthly_rent, daily_rate, number_of_rooms, address, district, village, region,
          latitude, longitude, image_urls, lc1_chairperson_name, lc1_chairperson_phone, lc1_chairperson_village,
          agent_id, landlord_id, tenant_id, verified, listing_bonus_paid, created_at, status, is_hidden,
          landlords(id, name, phone, verified, mobile_money_name, mobile_money_number, has_smartphone, number_of_houses, bank_name, account_number, monthly_rent, caretaker_name, caretaker_phone, tin, electricity_meter_number, water_meter_number, village, district, region)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      const agentIds = [...new Set((data || []).map(d => d.agent_id).filter(Boolean))];
      const tenantIds = [...new Set((data || []).map(d => d.tenant_id).filter(Boolean))] as string[];
      let agentMap = new Map<string, { full_name: string | null; phone: string | null; email: string | null }>();
      let tenantMap = new Map<string, { full_name: string | null; phone: string | null }>();

      const profileFetches: (() => Promise<void>)[] = [];
      if (agentIds.length) {
        profileFetches.push(async () => {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone, email').in('id', agentIds);
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
        agent_email: agentMap.get(d.agent_id)?.email || null,
        tenant_name: d.tenant_id ? (tenantMap.get(d.tenant_id)?.full_name || null) : null,
        tenant_phone: d.tenant_id ? (tenantMap.get(d.tenant_id)?.phone || null) : null,
      })) as ListingWithLandlord[];
    },
    staleTime: 60000,
  });

  // ─── Global Verification Search (across ALL agents/listings, not just the 500 most recent) ───
  const debouncedVerifySearch = useDebouncedValue(verifySearch.trim(), 300);
  const { data: globalSearchListings, isFetching: isGlobalSearching } = useQuery({
    queryKey: ['exec-house-listings-global-search', debouncedVerifySearch],
    enabled: debouncedVerifySearch.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const q = debouncedVerifySearch;
      const like = `%${q}%`;

      // 1) Find matching agents/landlords by name/phone
      const [agentProfiles, landlordMatches] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone, email')
          .or(`full_name.ilike.${like},phone.ilike.${like}`).limit(200),
        supabase.from('landlords').select('id').or(`name.ilike.${like},phone.ilike.${like}`).limit(200),
      ]);
      const agentIds = (agentProfiles.data || []).map(p => p.id);
      const landlordIds = (landlordMatches.data || []).map(l => l.id);

      // 2) Fetch listings that match by agent id, landlord id, or listing text fields
      const orParts: string[] = [
        `title.ilike.${like}`, `district.ilike.${like}`, `village.ilike.${like}`,
        `region.ilike.${like}`, `address.ilike.${like}`,
        `lc1_chairperson_name.ilike.${like}`, `lc1_chairperson_phone.ilike.${like}`,
      ];
      if (agentIds.length) orParts.push(`agent_id.in.(${agentIds.join(',')})`);
      if (landlordIds.length) orParts.push(`landlord_id.in.(${landlordIds.join(',')})`);

      const { data } = await supabase.from('house_listings')
        .select(`
          id, title, house_category, monthly_rent, daily_rate, number_of_rooms, address, district, village, region,
          latitude, longitude, image_urls, lc1_chairperson_name, lc1_chairperson_phone, lc1_chairperson_village,
          agent_id, landlord_id, tenant_id, verified, listing_bonus_paid, created_at, status, is_hidden,
          landlords(id, name, phone, verified, mobile_money_name, mobile_money_number, has_smartphone, number_of_houses, bank_name, account_number, monthly_rent, caretaker_name, caretaker_phone, tin, electricity_meter_number, water_meter_number, village, district, region)
        `)
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(500);

      const agentMap = new Map((agentProfiles.data || []).map(p => [p.id, p]));
      // Fetch any agent profiles we didn't already resolve
      const missingAgentIds = [...new Set((data || []).map(d => d.agent_id).filter(id => id && !agentMap.has(id)))] as string[];
      if (missingAgentIds.length) {
        const { data: more } = await supabase.from('profiles').select('id, full_name, phone, email').in('id', missingAgentIds);
        (more || []).forEach(p => agentMap.set(p.id, p));
      }
      const tenantIds = [...new Set((data || []).map(d => d.tenant_id).filter(Boolean))] as string[];
      let tenantMap = new Map<string, any>();
      if (tenantIds.length) {
        const { data: tps } = await supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds);
        tenantMap = new Map((tps || []).map(p => [p.id, p]));
      }

      return (data || []).map(d => ({
        ...d,
        agent_name: d.agent_id ? (agentMap.get(d.agent_id)?.full_name || null) : null,
        agent_phone: d.agent_id ? (agentMap.get(d.agent_id)?.phone || null) : null,
        agent_email: d.agent_id ? (agentMap.get(d.agent_id)?.email || null) : null,
        tenant_name: d.tenant_id ? (tenantMap.get(d.tenant_id)?.full_name || null) : null,
        tenant_phone: d.tenant_id ? (tenantMap.get(d.tenant_id)?.phone || null) : null,
      })) as ListingWithLandlord[];
    },
  });

  // ─── Global Date-Range Fetch (across ALL listings, not just latest 500) ───
  const { data: globalDateRangeListings, isFetching: isDateRangeFetching } = useQuery({
    queryKey: ['exec-house-listings-date-range', verifyDateFrom, verifyDateTo],
    enabled: !!(verifyDateFrom || verifyDateTo),
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase.from('house_listings')
        .select(`
          id, title, house_category, monthly_rent, daily_rate, number_of_rooms, address, district, village, region,
          latitude, longitude, image_urls, lc1_chairperson_name, lc1_chairperson_phone, lc1_chairperson_village,
          agent_id, landlord_id, tenant_id, verified, listing_bonus_paid, created_at, status, is_hidden,
          landlords(id, name, phone, verified, mobile_money_name, mobile_money_number, has_smartphone, number_of_houses, bank_name, account_number, monthly_rent, caretaker_name, caretaker_phone, tin, electricity_meter_number, water_meter_number, village, district, region)
        `)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (verifyDateFrom) query = query.gte('created_at', new Date(verifyDateFrom).toISOString());
      if (verifyDateTo) {
        const to = new Date(verifyDateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
        query = query.lte('created_at', new Date(to).toISOString());
      }
      const { data } = await query;
      const agentIds = [...new Set((data || []).map(d => d.agent_id).filter(Boolean))] as string[];
      const agentMap = new Map<string, any>();
      if (agentIds.length) {
        for (let i = 0; i < agentIds.length; i += 200) {
          const { data: aps } = await supabase.from('profiles').select('id, full_name, phone, email').in('id', agentIds.slice(i, i + 200));
          (aps || []).forEach(p => agentMap.set(p.id, p));
        }
      }
      const tenantIds = [...new Set((data || []).map(d => d.tenant_id).filter(Boolean))] as string[];
      const tenantMap = new Map<string, any>();
      if (tenantIds.length) {
        for (let i = 0; i < tenantIds.length; i += 200) {
          const { data: tps } = await supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds.slice(i, i + 200));
          (tps || []).forEach(p => tenantMap.set(p.id, p));
        }
      }
      return (data || []).map(d => ({
        ...d,
        agent_name: d.agent_id ? (agentMap.get(d.agent_id)?.full_name || null) : null,
        agent_phone: d.agent_id ? (agentMap.get(d.agent_id)?.phone || null) : null,
        agent_email: d.agent_id ? (agentMap.get(d.agent_id)?.email || null) : null,
        tenant_name: d.tenant_id ? (tenantMap.get(d.tenant_id)?.full_name || null) : null,
        tenant_phone: d.tenant_id ? (tenantMap.get(d.tenant_id)?.phone || null) : null,
      })) as ListingWithLandlord[];
    },
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
      const tenantStatusMap = new Map<string, string>();
      for (let i = 0; i < landlordIds.length; i += 50) {
        const { data: rrData } = await supabase
          .from('rent_requests')
          .select('landlord_id, tenant_id, status')
          .in('landlord_id', landlordIds.slice(i, i + 50))
          .not('tenant_id', 'is', null);
        if (rrData) {
          (rrData as any[]).forEach(r => {
            landlordTenantsRaw.push({ landlord_id: r.landlord_id, tenant_id: r.tenant_id });
            if (r.tenant_id && r.status) tenantStatusMap.set(r.tenant_id, r.status);
          });
        }
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
        const tenants: { id: string; name: string; phone: string | null; status: string }[] = [];
        if (tenantIdSet) {
          tenantIdSet.forEach(tid => {
            const p = profileMap.get(tid);
            tenants.push({ id: tid, name: p?.full_name || 'Unknown', phone: p?.phone || null, status: tenantStatusMap.get(tid) || 'listed' });
          });
        }
        // Fallback: if no house_listings tenants but landlord has tenant_id
        if (tenants.length === 0 && l.tenant_id) {
          const p = profileMap.get(l.tenant_id);
          if (p) tenants.push({ id: l.tenant_id, name: p.full_name || 'Unknown', phone: p.phone || null, status: tenantStatusMap.get(l.tenant_id) || 'listed' });
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
  const unverifiedListings = rows.filter(l =>
    !l.verified
    && l.status !== 'rejected'
    && l.status !== 'delisted'
    && !optimisticallyVerifiedIds.has(l.id)
  );
  const verifiedListings = rows.filter(l => l.verified && l.status !== 'rejected' && l.status !== 'delisted');
  const hiddenListings = rows.filter(l => l.is_hidden && l.status !== 'rejected' && l.status !== 'delisted');
  const rejectedListings = rows.filter(l => l.status === 'rejected');
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

  // Restore an entity detail sheet from a shared deep link (?entity=…&eid=…).
  const entityParam = searchParams.get('entity') as 'city' | 'no-landlord' | 'landlord' | 'tenant' | null;
  const eidParam = searchParams.get('eid');
  useEffect(() => {
    if (!entityParam || !eidParam) return;
    if (entityDetail) return; // already open
    if (entityParam === 'city') {
      const c = cityGroups.find(g => g.city === eidParam);
      if (c) { setView('cities'); setEntityDetail({ type: 'city', data: c }); }
    } else if (entityParam === 'no-landlord') {
      const t = noLandlordList.find(r => r.id === eidParam);
      if (t) { setView('no-landlord'); setEntityDetail({ type: 'no-landlord', data: t }); }
    } else if (entityParam === 'landlord') {
      const l = landlordsList.find(x => x.id === eidParam);
      if (l) {
        setView(l.tenants && l.tenants.length > 0 ? 'occupied' : 'empty');
        setEntityDetail({ type: 'landlord', data: l });
      }
    } else if (entityParam === 'tenant') {
      for (const l of landlordsList) {
        const tn = (l.tenants || []).find((t: any) => t.id === eidParam);
        if (tn) { setEntityDetail({ type: 'tenant', data: { ...tn, landlord_name: l.name } }); break; }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityParam, eidParam, cityGroups, noLandlordList, landlordsList]);

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
      const allLC1: { id: string; name: string; phone: string; village: string; created_at: string; verified: boolean | null; registered_by: string | null }[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase.from('lc1_chairpersons').select('id, name, phone, village, created_at, verified, registered_by')
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

      // 4b. Fetch registering agent (name + phone) so ops can call them for unverified LC1s
      const agentIds = [...new Set(allLC1.map(l => l.registered_by).filter(Boolean) as string[])];
      const agentMap = new Map<string, { full_name: string | null; phone: string | null }>();
      for (let i = 0; i < agentIds.length; i += 50) {
        const { data: ag } = await supabase.from('profiles')
          .select('id, full_name, phone')
          .in('id', agentIds.slice(i, i + 50));
        if (ag) ag.forEach((a: any) => agentMap.set(a.id, { full_name: a.full_name, phone: a.phone }));
      }

      // 5. Build final data
      return allLC1.map(lc1 => {
        const landlordIds = landlordIdsByLC1.get(lc1.id);
        const landlords = landlordIds
          ? [...landlordIds].map(lid => landlordMap.get(lid)).filter(Boolean) as { id: string; name: string; phone: string; property_address: string; verified: boolean | null; village: string | null }[]
          : [];
        // Also get listingIds from house_listings for edit dialog
        const listingIds = rows.filter(r => r.lc1_chairperson_phone === lc1.phone).map(r => r.id);
        const agent = lc1.registered_by ? agentMap.get(lc1.registered_by) : undefined;
        return { ...lc1, landlords, listingIds, agentName: agent?.full_name || null, agentPhone: agent?.phone || null };
      });
    },
    staleTime: 60000,
    enabled: view === 'lc1' || view === 'lc1-duplicates' || view === 'home',
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

  // ─── Landlords actually awaiting verification (pending verification requests) ───
  // The home card must reflect ONLY landlords with an open verification request,
  // not every auto-registered unverified landlord.
  const { data: pendingVerificationCount = 0 } = useQuery({
    queryKey: ['landlord-ops-pending-verification-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('landlords')
        .select('id', { count: 'exact', head: true })
        .or('verified.is.null,verified.eq.false');
      return count || 0;
    },
    staleTime: 30_000,
  });

  const lc1Groups = fullLC1Data || [];

  const verifiedLandlords = landlordsList.filter(l => l.verified);
  const unverifiedLandlords = landlordsList.filter(l => !l.verified && !rejectedLandlordIds.has(l.id));
  const smartphoneLandlords = landlordsList.filter(l => l.has_smartphone);

  const handleVerifyListing = async (listing: ListingWithLandlord, note?: string) => {
    console.log('[Verify] click', listing.id, listing.title);
    if (!user) return;
    // INSTANT UX: hide the card immediately, show a toast right now, run the
    // edge function in the background. If it fails, restore the card and
    // surface the error.
    setOptimisticallyVerifiedIds(prev => {
      const next = new Set(prev);
      next.add(listing.id);
      return next;
    });
    toast({
      title: '✅ Verified → UGX 5,000 Credited',
      description: `${listing.title} verified. UGX 5,000 credited to the agent's commission wallet.`,
    });
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
      // Permanently remove from the pending list by patching the cache directly,
      // then trigger a background refetch to reconcile related fields.
      queryClient.setQueryData<any[]>(['exec-house-listings-ops'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(l => l.id === listing.id ? { ...l, verified: true, listing_bonus_paid: true } : l);
      });
      setOptimisticallyVerifiedIds(prev => {
        const next = new Set(prev);
        next.delete(listing.id);
        return next;
      });
      // Persist the operator's inline note (if any) for audit/attribution.
      if (note && note.trim()) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'listing_verified',
          table_name: 'house_listings',
          record_id: listing.id,
          metadata: { reason: note.trim(), listing_title: listing.title, verified_by: 'landlord_ops' },
        });
      }
      refetch();
    } catch (err: any) {
      // Roll back optimistic removal so the operator can retry.
      setOptimisticallyVerifiedIds(prev => {
        const next = new Set(prev);
        next.delete(listing.id);
        return next;
      });
      toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
    }
  };

  // Inline reject for a pending house listing (notes required, min 10 chars).
  const handleRejectListing = async (listing: ListingWithLandlord, note: string) => {
    if (!user) return;
    const reason = note.trim();
    if (reason.length < 10) {
      toast({ title: 'Add a note', description: 'Please give at least 10 characters explaining the rejection.', variant: 'destructive' });
      return;
    }
    // Optimistically hide the card from the pending queue.
    setOptimisticallyVerifiedIds(prev => new Set(prev).add(listing.id));
    try {
      const { data, error } = await supabase.rpc('reject_house_listing', {
        p_listing_id: listing.id,
        p_reason: reason,
      });
      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in (data as any)) {
        throw new Error((data as any).error);
      }
      queryClient.setQueryData<any[]>(['exec-house-listings-ops'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(l => l.id === listing.id ? { ...l, status: 'rejected' } : l);
      });
      toast({ title: 'Listing rejected', description: `${listing.title} has been rejected.` });
      // Web-push only (no SMS) — the RPC already wrote the in-app notification.
      await invokeEdgeFunction('notify-listing-rejected', {
        body: { listing_id: listing.id, reason },
        silent: true,
      });
      refetch();
    } catch (err: any) {
      setOptimisticallyVerifiedIds(prev => { const next = new Set(prev); next.delete(listing.id); return next; });
      toast({ title: 'Reject failed', description: err?.message || 'Could not reject listing', variant: 'destructive' });
    }
  };

  // Update monthly rent on a house listing with audit logging and cache update.
  const handleUpdateMonthlyRent = async (listing: ListingWithLandlord, newRent: number) => {
    if (!user) return;
    if (!newRent || newRent <= 0 || isNaN(newRent)) {
      toast({ title: 'Invalid amount', description: 'Monthly rent must be a positive number.', variant: 'destructive' });
      return;
    }
    setSavingRentId(listing.id);
    try {
      const { error } = await supabase
        .from('house_listings')
        .update({ monthly_rent: newRent })
        .eq('id', listing.id);
      if (error) throw error;

      queryClient.setQueryData<any[]>(['exec-house-listings-ops'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(l => l.id === listing.id ? { ...l, monthly_rent: newRent } : l);
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'listing_rent_updated',
        table_name: 'house_listings',
        record_id: listing.id,
        metadata: { old_rent: listing.monthly_rent, new_rent: newRent, listing_title: listing.title, reason: 'Landlord ops updated monthly rent' },
      });

      toast({ title: 'Rent updated', description: `Monthly rent changed to UGX ${newRent.toLocaleString()}` });
      setEditingRentId(null);
      setEditRentValue('');
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message || 'Could not update rent', variant: 'destructive' });
    } finally {
      setSavingRentId(null);
    }
  };

  // Hide / unhide a house from the tenant-facing dashboard & marketplace.
  // Uses the `is_hidden` flag that all tenant/public listing queries respect.
  const handleToggleHidden = async (listing: ListingWithLandlord) => {
    if (!user) return;
    const nextHidden = !listing.is_hidden;
    const action = nextHidden ? 'hide' : 'unhide';
    const reason = window.prompt(
      `Reason to ${action} "${listing.title}" (min 10 characters) — visible only to landlord ops & audit logs:`,
      nextHidden ? 'Hidden from tenant browse' : 'Restored to tenant browse'
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast({ title: 'Reason too short', description: 'Please enter at least 10 characters.', variant: 'destructive' });
      return;
    }
    setTogglingHide(s => ({ ...s, [listing.id]: true }));
    try {
      const { error } = await supabase
        .from('house_listings')
        .update({ is_hidden: nextHidden })
        .eq('id', listing.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: nextHidden ? 'listing_hidden' : 'listing_unhidden',
        table_name: 'house_listings',
        record_id: listing.id,
        metadata: { reason: trimmed, listing_title: listing.title, hidden_by: 'landlord_ops' },
      });
      queryClient.setQueryData<any[]>(['exec-house-listings-ops'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(l => l.id === listing.id ? { ...l, is_hidden: nextHidden } : l);
      });
      toast({
        title: nextHidden ? 'House hidden' : 'House visible',
        description: nextHidden
          ? `${listing.title} is hidden from the tenant dashboard.`
          : `${listing.title} is back on the tenant dashboard.`,
      });
      refetch();
    } catch (err: any) {
      toast({ title: `Failed to ${action} house`, description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setTogglingHide(s => ({ ...s, [listing.id]: false }));
    }
  };

  // ─── Verification Queue bulk actions ───
  const toggleVerifySelect = (id: string) => {
    setVerifySelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearVerifySelection = () => setVerifySelectedIds(new Set());

  // Hide or unhide every selected house from the tenant dashboard.
  const handleBulkHide = async (selected: ListingWithLandlord[], nextHidden: boolean) => {
    if (!user || selected.length === 0) return;
    const action = nextHidden ? 'hide' : 'unhide';
    const reason = window.prompt(
      `Reason to ${action} ${selected.length} house${selected.length === 1 ? '' : 's'} (min 10 characters) — visible only to landlord ops & audit logs:`,
      nextHidden ? 'Hidden from tenant browse' : 'Restored to tenant browse'
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast({ title: 'Reason too short', description: 'Please enter at least 10 characters.', variant: 'destructive' });
      return;
    }
    setBulkBusy(nextHidden ? 'hide' : 'unhide');
    const results: { id: string; title: string; ok: boolean; error?: string }[] = [];
    for (const h of selected) {
      try {
        const { error } = await supabase.from('house_listings').update({ is_hidden: nextHidden }).eq('id', h.id);
        if (error) throw error;
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action_type: nextHidden ? 'listing_hidden' : 'listing_unhidden',
          table_name: 'house_listings',
          record_id: h.id,
          metadata: { reason: trimmed, listing_title: h.title, hidden_by: 'landlord_ops', bulk: true },
        });
        queryClient.setQueryData<any[]>(['exec-house-listings-ops'], (old) =>
          Array.isArray(old) ? old.map(l => l.id === h.id ? { ...l, is_hidden: nextHidden } : l) : old);
        results.push({ id: h.id, title: h.title, ok: true });
      } catch (err: any) {
        results.push({ id: h.id, title: h.title, ok: false, error: err?.message || 'Unknown error' });
      }
    }
    const ok = results.filter(r => r.ok).length;
    const failed = results.length - ok;
    setBulkBusy(null);
    clearVerifySelection();
    setBulkResult({ action: nextHidden ? 'Hide houses' : 'Unhide houses', results });
    toast({
      title: failed === 0 ? `${ok} house${ok === 1 ? '' : 's'} ${nextHidden ? 'hidden' : 'shown'}` : `${ok} done, ${failed} failed`,
      description: nextHidden ? 'Selected houses are off the tenant dashboard.' : 'Selected houses are back on the tenant dashboard.',
      variant: failed === 0 ? undefined : 'destructive',
    });
    refetch();
  };

  // Verify (credit bonus where unpaid) every selected unverified house.
  const handleBulkVerify = async (selected: ListingWithLandlord[]) => {
    if (!user || selected.length === 0) return;
    const targets = selected.filter(h => !h.verified);
    if (targets.length === 0) {
      toast({ title: 'Nothing to verify', description: 'All selected houses are already verified.' });
      return;
    }
    if (!window.confirm(`Verify ${targets.length} house${targets.length === 1 ? '' : 's'}? Each unpaid listing credits the agent UGX 5,000.`)) return;
    setBulkBusy('verify');
    const results: { id: string; title: string; ok: boolean; error?: string }[] = [];
    for (const h of targets) {
      try {
        const { data, error } = await supabase.functions.invoke('credit-listing-bonus', { body: { listing_id: h.id } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        queryClient.setQueryData<any[]>(['exec-house-listings-ops'], (old) =>
          Array.isArray(old) ? old.map(l => l.id === h.id ? { ...l, verified: true, listing_bonus_paid: true } : l) : old);
        results.push({ id: h.id, title: h.title, ok: true });
      } catch (err: any) {
        results.push({ id: h.id, title: h.title, ok: false, error: err?.message || 'Unknown error' });
      }
    }
    const ok = results.filter(r => r.ok).length;
    const failed = results.length - ok;
    setBulkBusy(null);
    clearVerifySelection();
    setBulkResult({ action: 'Verify houses', results });
    toast({
      title: failed === 0 ? `${ok} house${ok === 1 ? '' : 's'} verified` : `${ok} verified, ${failed} failed`,
      description: failed === 0 ? 'Agents credited for newly verified listings.' : 'Some listings could not be verified.',
      variant: failed === 0 ? undefined : 'destructive',
    });
    refetch();
  };

  // Reject every selected house (single shared reason, min 10 chars).
  const handleBulkReject = async (selected: ListingWithLandlord[]) => {
    if (!user || selected.length === 0) return;
    const reason = window.prompt(`Reason to reject ${selected.length} house${selected.length === 1 ? '' : 's'} (min 10 characters):`, '');
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast({ title: 'Reason too short', description: 'Please enter at least 10 characters.', variant: 'destructive' });
      return;
    }
    setBulkBusy('reject');
    const results: { id: string; title: string; ok: boolean; error?: string }[] = [];
    for (const h of selected) {
      try {
        const { data, error } = await supabase.rpc('reject_house_listing', { p_listing_id: h.id, p_reason: trimmed });
        if (error) throw error;
        if (data && typeof data === 'object' && 'error' in (data as any)) throw new Error((data as any).error);
        queryClient.setQueryData<any[]>(['exec-house-listings-ops'], (old) =>
          Array.isArray(old) ? old.map(l => l.id === h.id ? { ...l, status: 'rejected' } : l) : old);
        results.push({ id: h.id, title: h.title, ok: true });
        // Web-push only (no SMS) — best effort, never blocks the bulk loop.
        await invokeEdgeFunction('notify-listing-rejected', {
          body: { listing_id: h.id, reason: trimmed },
          silent: true,
        });
      } catch (err: any) {
        results.push({ id: h.id, title: h.title, ok: false, error: err?.message || 'Unknown error' });
      }
    }
    const ok = results.filter(r => r.ok).length;
    const failed = results.length - ok;
    setBulkBusy(null);
    clearVerifySelection();
    setBulkResult({ action: 'Reject houses', results });
    toast({
      title: failed === 0 ? `${ok} house${ok === 1 ? '' : 's'} rejected` : `${ok} rejected, ${failed} failed`,
      variant: failed === 0 ? undefined : 'destructive',
    });
    refetch();
  };

  // Approve (verify) a pending landlord with an optional inline note.
  const handleApproveLandlord = async (landlord: any, note?: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('landlords')
        .update({ verified: true, verified_at: new Date().toISOString(), verified_by: user.id })
        .eq('id', landlord.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'landlord_verified',
        table_name: 'landlords',
        record_id: landlord.id,
        metadata: { landlord_name: landlord.name, reason: (note?.trim() || 'Approved via Landlord Ops verification queue'), verified_by: 'landlord_ops' },
      });
      setExpandedLandlordId(null);
      toast({ title: '✅ Landlord verified', description: `${landlord.name} is now verified.` });
      refetchAll();
    } catch (err: any) {
      toast({ title: 'Approve failed', description: err?.message || 'Could not verify landlord', variant: 'destructive' });
    }
  };

  // Reject a pending landlord (notes required, min 10 chars). Logged + hidden for the session.
  const handleRejectLandlord = async (landlord: any, note: string) => {
    if (!user) return;
    const reason = note.trim();
    if (reason.length < 10) {
      toast({ title: 'Add a note', description: 'Please give at least 10 characters explaining the rejection.', variant: 'destructive' });
      return;
    }
    try {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'landlord_verification_rejected',
        table_name: 'landlords',
        record_id: landlord.id,
        metadata: { landlord_name: landlord.name, reason, rejected_by: 'landlord_ops' },
      });
      setRejectedLandlordIds(prev => new Set(prev).add(landlord.id));
      setExpandedLandlordId(null);
      toast({ title: 'Landlord rejected', description: `${landlord.name} was rejected and logged.` });
    } catch (err: any) {
      toast({ title: 'Reject failed', description: err?.message || 'Could not reject landlord', variant: 'destructive' });
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

  // ─── Navigate to any section (resets transient search/filter state) ───
  const goToView = (id: View) => {
    setView(id);
    setSearch('');
    setVerifySearch('');
    setVerifyFilter('all');
    setPendingFilter('all');
    setNavSheetOpen(false);
  };

  // ─── Section switcher (mobile-friendly jump menu, available in every view) ───
  const SectionSwitcher = ({ className = '' }: { className?: string }) => (
    <Sheet open={navSheetOpen} onOpenChange={setNavSheetOpen}>
      <SheetTrigger asChild>
        <button
          className={`flex items-center gap-1.5 text-sm font-semibold rounded-full border border-border bg-card px-3 min-h-[44px] touch-manipulation active:scale-[0.98] ${className}`}
        >
          <LayoutGrid className="h-4 w-4" /> Sections
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Jump to section</SheetTitle>
        </SheetHeader>
        <div className="mt-3 grid grid-cols-2 gap-2 pb-4">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => goToView(item.id)}
              className={`flex items-center gap-2 p-3 rounded-xl border border-border bg-card text-left min-h-[56px] touch-manipulation active:scale-[0.98] transition-colors hover:bg-muted/40 ${view === item.id ? 'ring-2 ring-primary border-primary/40' : ''}`}
            >
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <item.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium text-xs leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );

  // ─── Back Button (sticky nav row: back to overview + section switcher) ───
  const BackButton = () => (
    <div className="flex items-center justify-between gap-2 mb-3 sticky top-0 z-30 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60">
      <button
        onClick={() => goToView('home')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] touch-manipulation"
      >
        <ArrowLeft className="h-4 w-4" /> Overview
      </button>
      <SectionSwitcher />
    </div>
  );

  const refetchAll = () => {
    refetch();
    refetchLandlords();
    refetchLC1();
    queryClient.invalidateQueries({ queryKey: ['landlord-ops-pending-verification-count'] });
  };

  // Shared dialogs renderer — must be present in every sub-view that uses
  // setActionDialog / setPreviewImages / setAssignPerson / etc. Otherwise
  // those buttons set state but no dialog is mounted and "nothing happens"
  // until the user navigates back to a view that does mount LandlordDialogs.
  const renderDialogs = () => (
    <>
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
        user={user} refetchAll={refetchAll} queryClient={queryClient}
      />
      {renderEntityDetail()}
    </>
  );

  // Detail sheet opened when a drilldown table row is clicked.
  const renderEntityDetail = () => {
    if (!entityDetail) return null;
    const close = closeEntity;
    const buildShareUrl = (type: string, id: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set('entity', type);
      url.searchParams.set('eid', id);
      return url.toString();
    };

    if (entityDetail.type === 'city') {
      const c = entityDetail.data;
      return (
        <EntityDetailSheet
          open
          onClose={close}
          shareUrl={buildShareUrl('city', c.city)}
          title={c.city}
          subtitle="City overview"
          icon={<Globe className="h-5 w-5 text-teal-600" />}
          fields={[
            { label: 'Houses listed', value: c.listingCount ?? 0 },
            { label: 'Tenants', value: c.tenantCount ?? 0 },
          ]}
        />
      );
    }

    if (entityDetail.type === 'no-landlord') {
      const t = entityDetail.data;
      return (
        <EntityDetailSheet
          open
          onClose={close}
          shareUrl={buildShareUrl('no-landlord', t.id)}
          title={t.tenant_name}
          subtitle="Tenant with no landlord listed"
          icon={<UserX className="h-5 w-5 text-orange-600" />}
          fields={[
            { label: 'Rent', value: `UGX ${Number(t.rent_amount || 0).toLocaleString()}` },
            { label: 'City', value: t.request_city || '—' },
            { label: 'Category', value: t.house_category || '—' },
            { label: 'Status', value: t.status || '—' },
            { label: 'Agent', value: t.agent_name || '—' },
          ]}
        >
          {t.tenant_phone && (
            <div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contact Tenant</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">{t.tenant_name}</span>
                <ListPropertyCTA phone={t.tenant_phone} name={t.tenant_name} role="tenant" />
              </div>
            </div>
          )}
          {t.agent_id && t.agent_phone && (
            <div className="rounded-lg bg-indigo-500/10 p-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contact Agent</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">{t.agent_name || 'Agent'}</span>
                <ListPropertyCTA phone={t.agent_phone} name={t.agent_name || undefined} role="agent" />
              </div>
            </div>
          )}
        </EntityDetailSheet>
      );
    }

    if (entityDetail.type === 'tenant') {
      const tn = entityDetail.data;
      return (
        <EntityDetailSheet
          open
          onClose={close}
          shareUrl={buildShareUrl('tenant', tn.id)}
          title={tn.name}
          subtitle={tn.landlord_name ? `Tenant of ${tn.landlord_name}` : 'Tenant'}
          icon={<Users className="h-5 w-5 text-green-600" />}
          fields={[
            { label: 'Status', value: <span className="capitalize">{(tn.status || 'listed').replace(/_/g, ' ')}</span> },
            { label: 'Phone', value: tn.phone || '—' },
          ]}
        >
          {tn.phone && (
            <div className="rounded-lg bg-green-500/10 p-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contact Tenant</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">{tn.name}</span>
                <PhoneLinks phone={tn.phone} name={tn.name} />
              </div>
            </div>
          )}
        </EntityDetailSheet>
      );
    }

    // landlord (empty / occupied views)
    const l = entityDetail.data;
    const houseCount = landlordHouseCounts.get(l.id) || l.number_of_houses || 0;
    const tenants = (l.tenants || []) as { id: string; name: string; phone: string | null; status: string }[];
    const statusCounts = tenants.reduce<Record<string, number>>((acc, t) => {
      const s = (t.status || 'listed').toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return (
      <EntityDetailSheet
        open
        onClose={close}
        shareUrl={buildShareUrl('landlord', l.id)}
        title={l.name}
        subtitle={tenants.length > 0 ? 'Occupied landlord' : 'Empty landlord'}
        icon={<Building2 className="h-5 w-5 text-sky-600" />}
        fields={[
          { label: 'Phone', value: l.phone || '—' },
          { label: 'Houses', value: houseCount },
          { label: 'Tenants', value: tenants.length },
          { label: 'Monthly rent', value: `UGX ${fmt(l.monthly_rent || 0)}` },
          { label: 'Verified', value: l.verified ? 'Yes' : 'No' },
          { label: 'Address', value: l.property_address || '—' },
          { label: 'Agent', value: l.agent_name || '—' },
          { label: 'District', value: l.district || '—' },
          { label: 'Region', value: l.region || '—' },
        ]}
      >
        {l.phone && (
          <div className="rounded-lg bg-sky-500/10 p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contact Landlord</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium truncate">{l.name}</span>
              <PhoneLinks phone={l.phone} name={l.name} />
            </div>
          </div>
        )}
        {l.agent_name && (
          <div className="rounded-lg bg-indigo-500/10 p-2.5 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Linked Agent</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium truncate">{l.agent_name}</span>
              {l.agent_phone && <PhoneLinks phone={l.agent_phone} name={l.agent_name} />}
            </div>
          </div>
        )}
        {tenants.length > 0 && (
          <TenantStatusFilter
            tenants={tenants}
            landlordName={l.name}
            onOpenTenant={openEntity}
          />
        )}
      </EntityDetailSheet>
    );
  };

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

    let filtered = landlordsList.filter(l => !rejectedLandlordIds.has(l.id));

    // Category filter
    if (categoryFilter === 'verified') filtered = filtered.filter(l => l.verified);
    else if (categoryFilter === 'pending') filtered = filtered.filter(l => !l.verified);
    else if (categoryFilter === 'has_tenants') filtered = filtered.filter(l => l.tenants && l.tenants.length > 0);
    else if (categoryFilter === 'no_tenants') filtered = filtered.filter(l => !l.tenants || l.tenants.length === 0);

    // Search filter (name, phone, tenant, agent, location)
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l =>
        l.name?.toLowerCase().includes(q) || l.phone?.includes(q) ||
        l.tenant_name?.toLowerCase().includes(q) || l.agent_name?.toLowerCase().includes(q) ||
        l.district?.toLowerCase().includes(q) || l.region?.toLowerCase().includes(q) ||
        l.village?.toLowerCase().includes(q) || l.property_address?.toLowerCase().includes(q)
      );
    }

    // Only apply pending-specific quick filters when actually viewing pending category
    if (categoryFilter === 'pending') {
      if (pendingFilter === 'has_address') filtered = filtered.filter(l => !!l.property_address);
      else if (pendingFilter === 'has_phone') filtered = filtered.filter(l => !!l.phone && l.phone.length >= 9);
      else if (pendingFilter === 'has_smartphone') filtered = filtered.filter(l => l.has_smartphone === true);
      else if (pendingFilter === 'has_bank') filtered = filtered.filter(l => !!l.bank_name && !!l.account_number);
      else if (pendingFilter === 'has_momo') filtered = filtered.filter(l => !!l.mobile_money_number);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (landlordSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (landlordSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (landlordSort === 'highest_rent') return (b.monthly_rent || 0) - (a.monthly_rent || 0);
      return 0;
    });

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
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setBulkImportLandlordsOpen(true)} className="h-9">
              <Upload className="h-4 w-4 mr-1.5" /> Bulk Import
            </Button>
            <span className="text-xs text-muted-foreground">{filtered.length} landlords</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, location, tenant, or agent…" value={search} onChange={e => { setSearch(e.target.value); setLandlordPage(1); }} className="pl-9 h-9" />
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

        {/* Pending landlord quick filters */}
        {categoryFilter === 'pending' && (
          <div className="flex gap-1.5 flex-wrap">
            {([
              { value: 'all' as PendingFilter, label: 'All Pending' },
              { value: 'has_address' as PendingFilter, label: 'Has Address' },
              { value: 'has_phone' as PendingFilter, label: 'Has Phone' },
              { value: 'has_smartphone' as PendingFilter, label: 'Smartphone' },
              { value: 'has_bank' as PendingFilter, label: 'Bank' },
              { value: 'has_momo' as PendingFilter, label: 'MoMo' },
            ]).map(f => {
              const active = pendingFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setPendingFilter(f.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                    active
                      ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Sort (all categories) */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-medium">Sort:</span>
          <div className="flex gap-1.5">
            {([
              { value: 'newest' as SortOption, label: 'Newest' },
              { value: 'oldest' as SortOption, label: 'Oldest' },
              { value: 'highest_rent' as SortOption, label: 'Highest Rent' },
            ]).map(s => (
              <button
                key={s.value}
                onClick={() => setLandlordSort(s.value)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
                  landlordSort === s.value
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
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
                  const isExpanded = expandedLandlordId === landlord.id;
                  return (
                    <Fragment key={landlord.id}>
                    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => openEntity('landlord', landlord)}
                            className="font-bold text-sm text-sky-700 hover:underline text-left block"
                          >
                            {landlord.name}
                          </button>
                          <div className="flex items-center gap-1.5">
                            <PhoneLinks phone={landlord.phone} name={landlord.name} />
                          </div>
                          {/* Mobile-only extra info */}
                          <div className="sm:hidden flex flex-wrap gap-1 mt-1">
                            {landlord.verified ? (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-0">Verified</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 border-0">Pending</Badge>
                            )}
                            {tenantCount > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">{tenantCount} tenants</Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                        <PhoneLinks phone={landlord.phone} name={landlord.name} />
                      </td>
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
                        <div className="flex items-center justify-end gap-1.5">
                          {!landlord.verified && (
                            <Button
                              variant={isExpanded ? 'secondary' : 'default'}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setExpandedLandlordId(isExpanded ? null : landlord.id)}
                            >
                              {isExpanded ? 'Close' : 'Review'}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditLandlord({ ...landlord })}
                          >
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && !landlord.verified && (
                      <tr className="border-b border-border last:border-0 bg-muted/20">
                        <td colSpan={6} className="px-3 py-3 space-y-3">
                          <p className="text-xs font-bold flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                            Verify {landlord.name}
                          </p>
                          <div className="rounded-lg bg-sky-500/5 p-2.5 border border-sky-200/40">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Landlord Contact</p>
                            <PhoneLinks phone={landlord.phone} name={landlord.name} />
                            {landlord.property_address && (
                              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{landlord.property_address}
                              </p>
                            )}
                          </div>
                          {/* Registering agent contact — ops can call to complete verification */}
                          {(landlord.agent_name || landlord.agent_phone) && (
                            <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-2 space-y-1">
                              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                                <Users className="h-3 w-3" /> Registering agent
                              </p>
                              <p className="text-xs font-medium">{landlord.agent_name || 'Unknown agent'}</p>
                              {landlord.agent_phone && <PhoneLinks phone={landlord.agent_phone} name={landlord.agent_name || 'Agent'} />}
                            </div>
                          )}
                          <InlineModerationActions
                            approveLabel="Review & Approve"
                            rejectLabel="Reject"
                            onApprove={(note) => handleApproveLandlord(landlord, note)}
                            onReject={(note) => handleRejectLandlord(landlord, note)}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
        user={user} refetchAll={refetchAll} queryClient={queryClient}
      />
      <BulkImportLandlordsDialog
        open={bulkImportLandlordsOpen}
        onClose={() => setBulkImportLandlordsOpen(false)}
        onImported={refetchAll}
      />
      {renderEntityDetail()}
      </>
    );
  }

  // ─── LOCATIONS VIEW ───
  if (view === 'locations') {
    const filtered = search
      ? locationGroups.filter(g => g.region.toLowerCase().includes(search.toLowerCase()) || g.district?.toLowerCase().includes(search.toLowerCase()))
      : locationGroups;
    return (
      <>
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
      {renderDialogs()}
      </>
    );
  }

  // ─── LC1 VIEW ───
  if (view === 'lc1') {
    let filtered = search
      ? lc1Groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || g.village?.toLowerCase().includes(search.toLowerCase()) || g.phone?.includes(search))
      : [...lc1Groups];
    // "Needs Verification" keys ONLY on the LC1 chairperson's own verified flag,
    // NOT on the landlords linked under them.
    if (lc1VerifyFilter === 'verified') filtered = filtered.filter(g => g.verified);
    else if (lc1VerifyFilter === 'unverified') filtered = filtered.filter(g => !g.verified);

    const unverifiedCount = lc1Groups.filter(g => !g.verified).length;
    const verifiedCount = lc1Groups.filter(g => g.verified).length;
    return (
      <>
      <div className="space-y-3">
        <BackButton />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /> LC1 Chairpersons ({filtered.length}{filtered.length !== lc1Groups.length ? ` / ${lc1Groups.length}` : ''})</h2>
          <Button size="sm" onClick={() => setBulkImportOpen(true)} className="h-9">
            <Upload className="h-4 w-4 mr-1.5" /> Bulk Import
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, village, or phone…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>
        {/* LC1 Verification quick filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {([
            { value: 'all' as LC1VerifyFilter, label: 'All', count: lc1Groups.length },
            { value: 'verified' as LC1VerifyFilter, label: 'Verified', count: verifiedCount },
            { value: 'unverified' as LC1VerifyFilter, label: 'Needs Verification', count: unverifiedCount },
          ]).map(f => {
            const active = lc1VerifyFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setLc1VerifyFilter(f.value)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                  active
                    ? f.value === 'unverified'
                      ? 'bg-rose-100 text-rose-700 border-rose-300 shadow-sm'
                      : f.value === 'verified'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300 shadow-sm'
                        : 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                }`}
                title={active ? 'Active filter' : `Show ${f.label.toLowerCase()} LC1 chairpersons`}
              >
                {f.label}
                <span className={`text-[9px] font-bold px-1 py-0 rounded-full ${active ? 'bg-white/40' : 'bg-black/5'}`}>
                  {f.count}
                </span>
              </button>
            );
          })}
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
              {/* Registering agent contact — so ops can call them to complete verification */}
              {(lc1.agentName || lc1.agentPhone) && (
                <div className={`rounded-lg border px-2.5 py-2 space-y-1 ${!lc1.verified ? 'border-amber-300/60 bg-amber-50 dark:bg-amber-500/10' : 'border-border bg-muted/30'}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 ${!lc1.verified ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                    <Users className="h-3 w-3" /> Registering agent
                  </p>
                  <p className="text-xs font-medium">{lc1.agentName || 'Unknown agent'}</p>
                  {lc1.agentPhone && <PhoneLinks phone={lc1.agentPhone} name={lc1.agentName || 'Agent'} />}
                </div>
              )}
              {/* LC1 chairperson verification — required before agents can post rent requests */}
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">LC1 verification</span>
                <VerifyLc1Button
                  lc1Id={lc1.id}
                  lc1Name={lc1.name}
                  verified={lc1.verified}
                  onVerified={() => { refetchLC1(); refetchAll(); }}
                />
              </div>
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
                        <VerifyLandlordButton
                          landlordId={ll.id}
                          landlordName={ll.name}
                          verified={!!ll.verified}
                          onVerified={() => { refetchLC1(); refetchAll(); }}
                        />
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
        user={user} refetchAll={refetchAll} queryClient={queryClient}
      />
      <BulkImportLC1Dialog
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImported={refetchAll}
      />
      </>
    );
  }

  // ─── LC1 DUPLICATES VIEW (dedicated section) ───
  if (view === 'lc1-duplicates') {
    return (
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><Layers className="h-5 w-5 text-rose-600" /> LC1 Duplicates</h2>
        <p className="text-sm text-muted-foreground">
          Review duplicate LC1 chairperson phone rows and merge them into a single canonical record.
        </p>
        <Lc1DuplicatesPanel onResolved={() => { refetchLC1(); refetchAll(); }} />
      </div>
    );
  }

  // ─── GPS & LC1 VERIFICATION VIEW (set pending/verified/rejected with reason) ───
  if (view === 'residence-verify') {
    return (
      <>
      <div className="space-y-4">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /> GPS & LC1 Verification</h2>
        <ResidenceVerificationPanel />
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── CITIES VIEW ───
  if (view === 'cities') {
    const filtered = search
      ? cityGroups.filter(g => g.city.toLowerCase().includes(search.toLowerCase()))
      : cityGroups;
    return (
      <>
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
        <DrilldownTable
          data={filtered}
          rowKey={(c, i) => `${c.city}-${i}`}
          emptyMessage="No cities found"
          onRowClick={(c) => openEntity('city', c)}
          columns={[
            { key: 'city', label: 'City', render: (c) => <span className="font-semibold">{c.city}</span> },
            { key: 'listingCount', label: 'Houses', align: 'right' },
            { key: 'tenantCount', label: 'Tenants', align: 'right' },
          ] as DrilldownColumn<typeof filtered[number]>[]}
        />
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
      {renderDialogs()}
      </>
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
      <>
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
        <DrilldownTable
          data={filtered}
          rowKey={(t) => t.id}
          emptyMessage="All tenants have landlords listed"
          onRowClick={(t) => openEntity('no-landlord', t)}
          columns={[
            { key: 'tenant_name', label: 'Tenant', render: (t) => <span className="font-semibold">{t.tenant_name}</span> },
            { key: 'request_city', label: 'City', render: (t) => t.request_city || '—' },
            { key: 'rent_amount', label: 'Rent', align: 'right', render: (t) => `UGX ${t.rent_amount.toLocaleString()}` },
            { key: 'status', label: 'Status' },
            { key: 'agent_name', label: 'Agent', render: (t) => t.agent_name || '—' },
          ] as DrilldownColumn<typeof filtered[number]>[]}
        />
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
      {renderDialogs()}
      </>
    );
  }

  // ─── EMPTY HOUSES VIEW ───
  if (view === 'empty') {
    return (
      <>
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><DoorOpen className="h-5 w-5 text-destructive" /> Empty Houses ({emptyLandlords.length})</h2>
        {emptyLandlords.length > 0 && (
          <div className="rounded-xl border-2 border-destructive/30 p-3 flex items-start gap-3">
            <DoorOpen className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-destructive">{emptyLandlords.length} empty — UGX {fmt(lostMonthlyRevenue)}/mo lost revenue</p>
          </div>
        )}
        <DrilldownTable
          data={emptyLandlords}
          rowKey={(l) => l.id}
          emptyMessage="No empty houses"
          onRowClick={(l) => openEntity('landlord', l)}
          columns={[
            { key: 'name', label: 'Landlord', render: (l) => <span className="font-semibold">{l.name}</span> },
            { key: 'phone', label: 'Phone', render: (l) => l.phone || '—' },
            { key: 'houses', label: 'Houses', align: 'right', sortValue: (l) => landlordHouseCounts.get(l.id) || l.number_of_houses || 0, render: (l) => landlordHouseCounts.get(l.id) || l.number_of_houses || 0 },
            { key: 'monthly_rent', label: 'Rent', align: 'right', render: (l) => `UGX ${fmt(l.monthly_rent || 0)}` },
          ] as DrilldownColumn<typeof emptyLandlords[number]>[]}
        />
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
      {renderDialogs()}
      </>
    );
  }

  // ─── OCCUPIED HOUSES VIEW ───
  if (view === 'occupied') {
    return (
      <>
      <div className="space-y-3">
        <BackButton />
        <h2 className="text-lg font-bold flex items-center gap-2"><UserCheck className="h-5 w-5 text-green-600" /> Occupied Houses ({occupiedLandlords.length})</h2>
        <DrilldownTable
          data={occupiedLandlords}
          rowKey={(l) => l.id}
          emptyMessage="No occupied houses"
          onRowClick={(l) => openEntity('landlord', l)}
          columns={[
            { key: 'name', label: 'Landlord', render: (l) => <span className="font-semibold">{l.name}</span> },
            { key: 'phone', label: 'Phone', render: (l) => l.phone || '—' },
            { key: 'tenants', label: 'Tenants', align: 'right', sortValue: (l) => l.tenants?.length || 0, render: (l) => l.tenants?.length || 0 },
            { key: 'houses', label: 'Houses', align: 'right', sortValue: (l) => landlordHouseCounts.get(l.id) || l.number_of_houses || 0, render: (l) => landlordHouseCounts.get(l.id) || l.number_of_houses || 0 },
            { key: 'monthly_rent', label: 'Rent', align: 'right', render: (l) => `UGX ${fmt(l.monthly_rent || 0)}` },
          ] as DrilldownColumn<typeof occupiedLandlords[number]>[]}
        />
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
      {renderDialogs()}
      </>
    );
  }

  // ─── VERIFICATION VIEW ───
  if (view === 'verify') {
    const VERIFY_FILTERS: { value: VerifyFilter; label: string }[] = [
      { value: 'all', label: 'All Pending' },
      { value: 'has_landlord', label: 'Has Landlord' },
      { value: 'no_landlord', label: 'No Landlord' },
      { value: 'has_images', label: 'Has Photos' },
      { value: 'has_gps', label: 'Has GPS' },
      { value: 'has_lc1', label: 'Has LC1' },
    ];

    // Status scope: pending | verified | hidden | rejected | all
    // When the operator types a search, we widen the source to the global
    // (server-side) search results so that agents whose listings fall outside
    // the most-recent 500 are still findable. Status scope still applies.
    const searchActive = debouncedVerifySearch.length >= 2;
    const dateRangeActive = !!(verifyDateFrom || verifyDateTo);
    const baseSource: ListingWithLandlord[] = (searchActive || dateRangeActive)
      ? (() => {
          const seen = new Set<string>();
          const merged: ListingWithLandlord[] = [];
          for (const l of [
            ...(globalSearchListings || []),
            ...(globalDateRangeListings || []),
            ...rows,
          ]) {
            if (seen.has(l.id)) continue;
            seen.add(l.id);
            merged.push(l);
          }
          return merged;
        })()
      : rows;
    const scopeListings =
      houseStatusFilter === 'all'
        ? baseSource.filter(l => l.status !== 'rejected' && l.status !== 'delisted' && !optimisticallyVerifiedIds.has(l.id))
        : houseStatusFilter === 'verified'
        ? baseSource.filter(l => l.verified && l.status !== 'rejected' && l.status !== 'delisted')
        : houseStatusFilter === 'hidden'
        ? baseSource.filter(l => l.is_hidden && l.status !== 'rejected' && l.status !== 'delisted')
        : houseStatusFilter === 'rejected'
        ? (searchActive ? baseSource.filter(l => l.status === 'rejected') : rejectedListings)
        : (searchActive ? baseSource.filter(l => !l.verified && l.status !== 'rejected' && l.status !== 'delisted') : unverifiedListings);
    let filteredHouses = scopeListings;

    // Text search across name, phone, location, agent
    if (verifySearch.trim()) {
      const q = verifySearch.toLowerCase().trim();
      filteredHouses = filteredHouses.filter(h =>
        h.title?.toLowerCase().includes(q) ||
        h.landlords?.name?.toLowerCase().includes(q) ||
        h.landlords?.phone?.includes(q) ||
        h.agent_name?.toLowerCase().includes(q) ||
        h.agent_phone?.includes(q) ||
        h.region?.toLowerCase().includes(q) ||
        h.district?.toLowerCase().includes(q) ||
        h.village?.toLowerCase().includes(q) ||
        h.lc1_chairperson_name?.toLowerCase().includes(q) ||
        h.lc1_chairperson_phone?.includes(q) ||
        h.address?.toLowerCase().includes(q)
      );
    }

    // Quick filter chips
    if (verifyFilter === 'has_landlord') filteredHouses = filteredHouses.filter(h => !!h.landlords);
    else if (verifyFilter === 'no_landlord') filteredHouses = filteredHouses.filter(h => !h.landlords);
    else if (verifyFilter === 'has_images') filteredHouses = filteredHouses.filter(h => h.image_urls && h.image_urls.length > 0);
    else if (verifyFilter === 'has_gps') filteredHouses = filteredHouses.filter(h => h.latitude && h.longitude);
    else if (verifyFilter === 'has_lc1') filteredHouses = filteredHouses.filter(h => !!h.lc1_chairperson_name);

    // Date range filter (created_at)
    if (verifyDateFrom) {
      const from = new Date(verifyDateFrom).getTime();
      filteredHouses = filteredHouses.filter(h => new Date(h.created_at).getTime() >= from);
    }
    if (verifyDateTo) {
      const to = new Date(verifyDateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
      filteredHouses = filteredHouses.filter(h => new Date(h.created_at).getTime() <= to);
    }

    // Sort
    filteredHouses = [...filteredHouses].sort((a, b) => {
      if (verifySort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (verifySort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (verifySort === 'highest_rent') return (b.monthly_rent || 0) - (a.monthly_rent || 0);
      if (verifySort === 'recently_updated') {
        const bu = (b as any).updated_at || b.created_at;
        const au = (a as any).updated_at || a.created_at;
        return new Date(bu).getTime() - new Date(au).getTime();
      }
      return 0;
    });

    return (
      <>
      <div className="space-y-3">
        <BackButton />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /> Verification Queue</h2>
          <Badge variant="outline" className="text-sm font-bold px-3 py-1 bg-amber-100 text-amber-700 border-amber-300">{filteredHouses.length} {houseStatusFilter === 'all' ? 'houses' : houseStatusFilter === 'rejected' ? 'rejected' : houseStatusFilter}</Badge>
        </div>

        {/* Thumb-friendly status filter chips */}
        <div className="flex gap-2 flex-wrap items-center">
          {([
            { value: 'pending' as HouseStatusFilter, label: 'Pending', count: unverifiedListings.length, color: 'amber' },
            { value: 'verified' as HouseStatusFilter, label: 'Verified', count: verifiedListings.length, color: 'emerald' },
            { value: 'hidden' as HouseStatusFilter, label: 'Hidden', count: hiddenListings.length, color: 'slate' },
            { value: 'rejected' as HouseStatusFilter, label: 'Rejected', count: rejectedListings.length, color: 'rose' },
            { value: 'all' as HouseStatusFilter, label: 'All houses', count: rows.filter(l => l.status !== 'rejected' && l.status !== 'delisted' && !optimisticallyVerifiedIds.has(l.id)).length, color: 'primary' },
          ]).map(s => {
            const active = houseStatusFilter === s.value;
            const colorMap: Record<string, string> = {
              amber: active ? 'bg-amber-500 text-white border-amber-500' : 'bg-background text-amber-700 border-amber-300 hover:bg-amber-50',
              emerald: active ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-background text-emerald-700 border-emerald-300 hover:bg-emerald-50',
              slate: active ? 'bg-slate-500 text-white border-slate-500' : 'bg-background text-slate-700 border-slate-300 hover:bg-slate-50',
              rose: active ? 'bg-rose-500 text-white border-rose-500' : 'bg-background text-rose-700 border-rose-300 hover:bg-rose-50',
              primary: active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-primary border-primary/30 hover:bg-primary/5',
            };
            return (
              <button
                key={s.value}
                onClick={() => setHouseStatusFilter(s.value)}
                className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-bold transition-all border shadow-sm flex items-center gap-1.5 ${colorMap[s.color]}`}
              >
                {s.label}
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {s.count}
                </span>
              </button>
            );
          })}
          {(houseStatusFilter !== 'pending' || verifyFilter !== 'all' || verifySearch || verifyDateFrom || verifyDateTo) && (
            <button
              onClick={() => { setHouseStatusFilter('pending'); setVerifyFilter('all'); setVerifySearch(''); setVerifyDateFrom(''); setVerifyDateTo(''); }}
              className="min-h-[44px] px-3 py-2 rounded-full text-sm font-semibold text-muted-foreground border border-border bg-background hover:bg-muted transition-all flex items-center gap-1.5"
              title="Reset filters"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search house, landlord, agent, phone, or location…"
            value={verifySearch}
            onChange={e => setVerifySearch(e.target.value)}
            className="pl-9 pr-9 h-11"
          />
          {verifySearch && (
            <button onClick={() => setVerifySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" aria-label="Clear">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {debouncedVerifySearch.length >= 2 && (
          <p className="text-[11px] text-muted-foreground -mt-1 pl-1">
            {isGlobalSearching ? 'Searching all agents & listings…' : `Searching across all listings (not just the latest ${rows.length}).`}
          </p>
        )}

        {/* Date range filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-medium">Date:</span>
          <Input
            type="date"
            value={verifyDateFrom}
            onChange={e => setVerifyDateFrom(e.target.value)}
            className="h-8 w-auto text-xs"
            aria-label="From date"
          />
          <span className="text-[11px] text-muted-foreground">to</span>
          <Input
            type="date"
            value={verifyDateTo}
            onChange={e => setVerifyDateTo(e.target.value)}
            className="h-8 w-auto text-xs"
            aria-label="To date"
          />
          {(verifyDateFrom || verifyDateTo) && (
            <button onClick={() => { setVerifyDateFrom(''); setVerifyDateTo(''); }} className="text-[11px] text-muted-foreground hover:text-foreground underline">
              clear
            </button>
          )}
        </div>

        {/* Quick filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {VERIFY_FILTERS.map(f => {
            const count =
              f.value === 'all' ? scopeListings.length :
              f.value === 'has_landlord' ? scopeListings.filter(h => !!h.landlords).length :
              f.value === 'no_landlord' ? scopeListings.filter(h => !h.landlords).length :
              f.value === 'has_images' ? scopeListings.filter(h => h.image_urls && h.image_urls.length > 0).length :
              f.value === 'has_gps' ? scopeListings.filter(h => h.latitude && h.longitude).length :
              scopeListings.filter(h => !!h.lc1_chairperson_name).length;
            const active = verifyFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setVerifyFilter(f.value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                  active
                    ? 'bg-amber-100 text-amber-700 border-amber-300 shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {f.label}
                <span className="ml-1 opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-medium">Sort:</span>
          <div className="flex gap-1.5">
            {([
              { value: 'newest' as SortOption, label: 'Newest' },
              { value: 'oldest' as SortOption, label: 'Oldest' },
              { value: 'recently_updated' as SortOption, label: 'Recently Updated' },
              { value: 'highest_rent' as SortOption, label: 'Highest Rent' },
            ]).map(s => (
              <button
                key={s.value}
                onClick={() => setVerifySort(s.value)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
                  verifySort === s.value
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <ListingBonusApprovalQueue filter="all" collapsible defaultOpen={false} />
        <VerificationTimelinePanel />

        {/* ── Bulk selection bar ── */}
        {filteredHouses.length > 0 && (() => {
          const selectedHouses = filteredHouses.filter(h => verifySelectedIds.has(h.id));
          const allSelected = selectedHouses.length === filteredHouses.length;
          const anySelected = selectedHouses.length > 0;
          return (
            <div className="sticky top-0 z-10 rounded-xl border border-border bg-card/95 backdrop-blur p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => allSelected ? clearVerifySelection() : setVerifySelectedIds(new Set(filteredHouses.map(h => h.id)))}
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <Checkbox checked={allSelected} className="pointer-events-none" />
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
                <Badge variant="outline" className="text-xs font-bold">{selectedHouses.length} selected</Badge>
              </div>
              {anySelected && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Button size="sm" variant="outline" className="h-10 gap-1.5 font-semibold" disabled={bulkBusy !== null} onClick={() => handleBulkHide(selectedHouses, true)}>
                    <EyeOff className="h-4 w-4" />{bulkBusy === 'hide' ? '…' : 'Hide'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 gap-1.5 font-semibold" disabled={bulkBusy !== null} onClick={() => handleBulkHide(selectedHouses, false)}>
                    <Eye className="h-4 w-4" />{bulkBusy === 'unhide' ? '…' : 'Unhide'}
                  </Button>
                  <Button size="sm" className="h-10 gap-1.5 font-semibold" disabled={bulkBusy !== null} onClick={() => handleBulkVerify(selectedHouses)}>
                    <ShieldCheck className="h-4 w-4" />{bulkBusy === 'verify' ? '…' : 'Verify'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-10 gap-1.5 font-semibold border-destructive/40 text-destructive hover:bg-destructive/10" disabled={bulkBusy !== null} onClick={() => handleBulkReject(selectedHouses)}>
                    <XCircle className="h-4 w-4" />{bulkBusy === 'reject' ? '…' : 'Reject'}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}

        <div className="space-y-3">
          {filteredHouses.map(house => (
            <div key={house.id} className={`rounded-xl border bg-card overflow-hidden ${verifySelectedIds.has(house.id) ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}>
              {/* ── Card Header ── */}
              <div className="p-4 pb-3 space-y-3">
                <div className="flex gap-3">
                  {/* Bulk select checkbox */}
                  <div className="shrink-0 pt-1">
                    <Checkbox
                      checked={verifySelectedIds.has(house.id)}
                      onCheckedChange={() => toggleVerifySelect(house.id)}
                    />
                  </div>
                  {/* Thumbnail */}
                  <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-muted border border-border">
                    {house.image_urls?.[0] ? (
                      <button onClick={() => setPreviewImages({ images: house.image_urls!, title: house.title })} className="w-full h-full">
                        <StorageImage src={house.image_urls[0]} alt={house.title} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Home className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  {/* House Title & Rent */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-bold text-base leading-tight truncate">{house.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {house.address ? `${house.address} · ` : ''}{house.village ? `${house.village} · ` : ''}{house.region}{house.district ? `, ${house.district}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">{house.house_category}</Badge>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5">{house.number_of_rooms} rooms</Badge>
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px] h-5 px-1.5 font-bold">UGX {house.monthly_rent.toLocaleString()}/mo</Badge>
                      {house.verified && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] h-5 px-1.5 font-bold"><CheckCircle2 className="h-3 w-3 mr-0.5" />Verified</Badge>
                      )}
                      {house.is_hidden && (
                        <Badge className="bg-slate-200 text-slate-700 border-0 text-[10px] h-5 px-1.5 font-bold"><EyeOff className="h-3 w-3 mr-0.5" />Hidden</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Divider ── */}
              <div className="h-px bg-border mx-4" />

              {/* ── Prominent Landlord Section ── */}
              {house.landlords ? (
                <div className="p-4 py-3 bg-sky-500/5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" />
                    Registered Landlord
                  </p>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-bold text-foreground truncate">{house.landlords.name}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <PhoneLinks phone={house.landlords.phone} name={house.landlords.name} />
                        {house.landlords.mobile_money_name && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-sky-300 text-sky-700">
                            MoMo: {house.landlords.mobile_money_name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {house.landlords.verified ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] h-5 px-2">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] h-5 px-2">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Unverified
                        </Badge>
                      )}
                      {house.landlords.has_smartphone != null && (
                        house.landlords.has_smartphone ? (
                          <Badge className="bg-green-100 text-green-700 border-0 text-[9px] h-4 px-1.5">Smartphone</Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-700 border-0 text-[9px] h-4 px-1.5">No Smartphone</Badge>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 py-3 bg-orange-500/5">
                  <div className="flex items-center gap-2">
                    <UserX className="h-4 w-4 text-orange-600" />
                    <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">No landlord linked to this listing</p>
                  </div>
                  <Button size="sm" variant="outline" className="mt-2 h-8 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-100" onClick={() => handleAssignPerson(house.id, house.title, 'landlord')}>
                    <UserPlus className="h-3 w-3" /> Link Landlord
                  </Button>
                </div>
              )}

              {/* ── Agent & LC1 Details ── */}
              <div className="px-4 py-3 space-y-2">
                {/* Agent */}
                {house.agent_name && (
                  <div className="rounded-lg bg-indigo-500/5 px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Listing Agent</p>
                        <p className="text-xs font-medium truncate">{house.agent_name}</p>
                      </div>
                      {house.agent_phone && <PhoneLinks phone={house.agent_phone} name={house.agent_name} />}
                    </div>
                    {house.agent_email && (
                      <a href={`mailto:${house.agent_email}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline break-all">
                        <Mail className="h-3 w-3 shrink-0" /> {house.agent_email}
                      </a>
                    )}
                    {house.agent_id && (
                      <div className="pt-1.5 mt-1 border-t border-indigo-500/10">
                        <AgentListingBlockControl agentId={house.agent_id} agentName={house.agent_name} />
                      </div>
                    )}
                  </div>
                )}
                {/* LC1 — always shown on every card, even when none is linked */}
                {house.lc1_chairperson_name ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">LC1 Chairperson</p>
                      <p className="text-xs font-medium truncate">{house.lc1_chairperson_name}</p>
                      {house.lc1_chairperson_village && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" />{house.lc1_chairperson_village}
                        </p>
                      )}
                    </div>
                    {house.lc1_chairperson_phone && (
                      <PhoneLinks phone={house.lc1_chairperson_phone} name={house.lc1_chairperson_name} />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 px-3 py-2">
                    <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">LC1 Chairperson</p>
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">No LC1 chairperson linked to this listing</p>
                    </div>
                  </div>
                )}
                {/* GPS */}
                {house.latitude && house.longitude && (
                  <a href={`https://www.google.com/maps?q=${house.latitude},${house.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline text-[11px] font-medium">
                    <MapPinned className="h-3.5 w-3.5" /> View exact location on Google Maps
                  </a>
                )}

                {/* ── Listing metadata for approval review ── */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 mt-1 border-t border-border">
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Category</p>
                    <p className="text-[11px] font-medium">{house.house_category || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Rooms</p>
                    <p className="text-[11px] font-medium">{house.number_of_rooms ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Monthly rent</p>
                    {editingRentId === house.id ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Input
                          type="number"
                          value={editRentValue}
                          onChange={(e) => setEditRentValue(e.target.value)}
                          className="h-7 text-[11px] px-2 py-0.5 w-28"
                          disabled={savingRentId === house.id}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          disabled={savingRentId === house.id}
                          onClick={() => handleUpdateMonthlyRent(house, Number(editRentValue))}
                        >
                          {savingRentId === house.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px]"
                          disabled={savingRentId === house.id}
                          onClick={() => { setEditingRentId(null); setEditRentValue(''); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-[11px] font-medium">UGX {Number(house.monthly_rent || 0).toLocaleString()}</p>
                        <button
                          onClick={() => { setEditingRentId(house.id); setEditRentValue(String(house.monthly_rent || '')); }}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="Edit monthly rent"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Daily rate</p>
                    <p className="text-[11px] font-medium">{house.daily_rate ? `UGX ${Number(house.daily_rate).toLocaleString()}` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Listed</p>
                    <p className="text-[11px] font-medium">{house.created_at ? new Date(house.created_at).toLocaleDateString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Status</p>
                    <p className="text-[11px] font-medium capitalize">{house.status || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Listing ID</p>
                    <p className="text-[10px] font-mono text-muted-foreground break-all">{house.id}</p>
                  </div>
                </div>
              </div>

              {/* ── Moderation Actions ── */}
              <div className="p-4 pt-2 bg-muted/30 border-t border-border">
                {/* Hide / unhide from the tenant dashboard — works on ANY house */}
                <div className="mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-10 gap-2 font-semibold"
                    disabled={!!togglingHide[house.id]}
                    onClick={() => handleToggleHidden(house)}
                  >
                    {house.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {togglingHide[house.id]
                      ? 'Saving…'
                      : house.is_hidden
                        ? 'Show on tenant dashboard'
                        : 'Hide from tenant dashboard'}
                  </Button>
                </div>
                <InlineModerationActions
                  approveHidden={!!house.verified}
                  approveLabel="Verify → UGX 5K"
                  rejectLabel="Reject"
                  onApprove={(note) => handleVerifyListing(house, note)}
                  onReject={(note) => handleRejectListing(house, note)}
                  checklistTitle="Confirm landlord & house details"
                  checklistSubtitle={`Landlord: ${house.landlords?.name || 'Not linked'}`}
                  approveChecklist={[
                    { label: 'This person is the genuine landlord', value: house.landlords?.name || 'No landlord linked' },
                    { label: 'Landlord name is correct', value: house.landlords?.name || '—' },
                    {
                      label: 'House location is correct',
                      value: [house.address, house.village, house.region, house.district].filter(Boolean).join(' · ') || '—',
                    },
                    { label: 'Price of the house listed is correct', value: `UGX ${Number(house.monthly_rent || 0).toLocaleString()} / month` },
                    { label: 'LC chairperson of the village is confirmed', value: house.lc1_chairperson_name || 'Not provided' },
                    { label: 'The house has water and electricity', value: undefined },
                    {
                      label: 'Meter number is in whose names',
                      value: [
                        house.landlords?.electricity_meter_number ? `Electricity: ${house.landlords.electricity_meter_number}` : null,
                        house.landlords?.water_meter_number ? `Water: ${house.landlords.water_meter_number}` : null,
                      ].filter(Boolean).join(' · ') || 'Confirm meter ownership',
                    },
                  ]}
                />
              </div>
            </div>
          ))}
          {filteredHouses.length === 0 && scopeListings.length > 0 && (
            <div className="text-center py-10">
              <Search className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-semibold text-muted-foreground">No matches for "{verifySearch}"</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search or clear filters</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setVerifySearch(''); setVerifyFilter('all'); }}>
                Clear Filters
              </Button>
            </div>
          )}
          {scopeListings.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
              <p className="font-semibold">{houseStatusFilter === 'all' ? 'No houses found.' : 'No listings in this view.'}</p>
            </div>
          )}
        </div>
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── ALL REQUESTS VIEW (landlord lens) ───
  if (view === 'all-requests') {
    return (
      <>
      <div className="space-y-4">
        <BackButton />
        <ExecutiveDataTable
          data={allRequestsRows || []}
          columns={allRequestsColumns}
          loading={allRequestsLoading}
          title="All Requests"
          getRowId={(r: any) => String(r.id)}
          selectedIds={allReqSelectedIds}
          onSelectionChange={setAllReqSelectedIds}
          bulkActions={(ids) => (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setAllReqBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {ids.length}
            </Button>
          )}
          filters={[{
            key: 'status',
            label: 'Status',
            options: [
              { value: 'pending', label: 'Pending' },
              { value: 'tenant_ops_approved', label: 'Tenant Ops Approved' },
              { value: 'agent_verified', label: 'Agent Verified' },
              { value: 'landlord_ops_approved', label: 'Landlord Ops Approved' },
              { value: 'coo_approved', label: 'COO Approved' },
              { value: 'funded', label: 'Funded' },
              { value: 'repaying', label: 'Repaying' },
              { value: 'fully_repaid', label: 'Fully Repaid' },
              { value: 'defaulted', label: 'Defaulted' },
            ],
          }]}
        />
      </div>
      {renderDialogs()}
      {/* Single-row delete dialog */}
      <AlertDialog
        open={allReqDeleteDialog.open}
        onOpenChange={(open) => !open && !allReqDeleting && setAllReqDeleteDialog({ open: false, requestId: '', tenantName: '' })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rent Request</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the rent request for <strong>{allReqDeleteDialog.tenantName}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={allReqDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={allReqDeleting}
              onClick={(e) => { e.preventDefault(); handleDeleteOneRentRequest(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {allReqDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Bulk delete dialog */}
      <AlertDialog
        open={allReqBulkDeleteOpen}
        onOpenChange={(open) => !open && !allReqDeleting && setAllReqBulkDeleteOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {allReqSelectedIds.length} request{allReqSelectedIds.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected rent requests. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={allReqDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={allReqDeleting}
              onClick={(e) => { e.preventDefault(); handleBulkDeleteRentRequests(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {allReqDeleting ? 'Deleting…' : `Delete ${allReqSelectedIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    );
  }

  // ─── PIPELINE VIEW ───
  if (view === 'pipeline') {
    return (
      <>
      <div className="space-y-4">
        <BackButton />
        <RentPipelineQueue stage="tenant_ops_approved" />
        <RejectedRequestsQueue stageFilter="tenant_ops_approved" title="Rejected at Landlord Ops" collapsible />
        <DealPipeline />
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── CHAIN VIEW ───
  if (view === 'chain') {
    return (
      <>
      <div className="space-y-4">
        <BackButton />
        <ChainHealthTab />
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── MATCHING VIEW ───
  if (view === 'matching') {
    return (
      <>
      <div className="space-y-4">
        <BackButton />
        <TenantMatchingQueue onViewingCreated={() => refetch()} />
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── AGENTS VIEW ───
  if (view === 'agents') {
    return (
      <>
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
      {renderDialogs()}
      </>
    );
  }

  // ─── ANALYTICS VIEW ───
  if (view === 'analytics') {
    return (
      <>
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
      {renderDialogs()}
      </>
    );
  }

  // ─── ADVANCE REQUESTS VIEW ───
  if (view === 'advance-requests') {
    return (
      <>
      <div className="space-y-6">
        <BackButton />
        <h2 className="text-lg font-bold">Business Advances</h2>
        <BusinessAdvanceQueue stage="landlord_ops" />
        <RentHistoryVerificationQueue dept="landlord_ops" />
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── LANDLORDS PAID VIEW ───
  if (view === 'landlords-paid') {
    return (
      <>
      <div className="space-y-4">
        <BackButton />
        <LandlordsPaidView />
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── LANDLORDS & TENANTS VIEW ───
  if (view === 'landlords-tenants') {
    return (
      <>
      <div className="space-y-4">
        <BackButton />
        <LandlordsWithTenantsView />
      </div>
      {renderDialogs()}
      </>
    );
  }

  // ─── HOUSES BY LANDLORD (bind / swap / remove tenant; reassign agent) ───
  if (view === 'houses-by-landlord') {
    return (
      <>
        <div className="space-y-4">
          <BackButton />
          <LandlordHousesPanel />
        </div>
        {renderDialogs()}
      </>
    );
  }

  // ─── HOME: Mobile-first card navigation ───
  return (
    <div className="space-y-6">
      {/* Sticky header with quick section switcher */}
      <div className="flex items-center justify-between gap-2 sticky top-0 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border/50">
        <h2 className="text-[15px] font-semibold tracking-tight flex items-center gap-2 min-w-0">
          <Building2 className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
          <span className="truncate">Landlord Ops</span>
        </h2>
        <SectionSwitcher />
      </div>
      {/* PROMINENT: Agent-initiated landlord verification requests — top priority */}
      <AgentVerificationRequestsPanel onResolved={refetchAll} />
      {/* PROMINENT: Agent-initiated LC1 chairperson verification requests */}
      <Lc1VerificationRequestsPanel onResolved={refetchAll} />
      {/* PROMINENT: Awaiting verification (houses + landlords) — always first */}
      {(unverifiedListings.length > 0 || unverifiedLandlords.length > 0) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-muted">
              <ShieldCheck className="h-[18px] w-[18px] text-amber-600 shrink-0" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">Awaiting your verification</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Review newly listed houses &amp; registered landlords
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setView('verify')}
              disabled={unverifiedListings.length === 0}
              className="rounded-xl border border-border bg-background p-3 text-left min-h-[60px] touch-manipulation active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
            >
              <div className="flex items-center gap-1.5">
                <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Houses</span>
              </div>
              <p className="text-2xl font-semibold tracking-tight leading-tight mt-1">{unverifiedListings.length}</p>
              <p className="text-[10px] text-muted-foreground leading-snug">pending · UGX {fmt(unverifiedListings.length * 5000)} bonuses</p>
            </button>
            <button
              onClick={() => { setView('landlords'); setLandlordCategory('pending'); }}
              disabled={pendingVerificationCount === 0}
              className="rounded-xl border border-border bg-background p-3 text-left min-h-[60px] touch-manipulation active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
            >
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Landlords</span>
              </div>
              <p className="text-2xl font-semibold tracking-tight leading-tight mt-1">{pendingVerificationCount}</p>
              <p className="text-[10px] text-muted-foreground leading-snug">pending verification · awaiting review</p>
            </button>
          </div>
        </div>
      )}

      {/* Quick access — funded tenants & location browse */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* HERO: Tenants whose Landlords were Funded */}
        <button
          onClick={() => setView('landlords-paid')}
          className="w-full rounded-2xl border border-border bg-card p-4 flex items-center gap-3 text-left min-h-[64px] touch-manipulation active:scale-[0.98] transition-transform hover:bg-muted/40"
        >
          <div className="p-2 rounded-xl bg-muted">
            <Banknote className="h-[18px] w-[18px] text-emerald-600 shrink-0" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground leading-tight">Tenants whose Landlords were Funded</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {paidLandlordsCount !== undefined ? `${paidLandlordsCount} landlords paid · ` : ''}View disbursements from tenant rent
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </button>

        {/* Browse by Location */}
        <button
          onClick={() => setView('houses-by-landlord')}
          className="w-full rounded-2xl border border-border bg-card p-4 flex items-center gap-3 text-left min-h-[64px] touch-manipulation active:scale-[0.98] transition-transform hover:bg-muted/40"
        >
          <div className="p-2 rounded-xl bg-muted">
            <MapPin className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">Browse Houses by Location</p>
            <p className="text-xs text-muted-foreground leading-snug">Explore properties across regions, districts &amp; wards</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </button>
      </div>

      {/* Priority actions */}
      <RentPipelineQueue stage="tenant_ops_approved" />
      <RejectedRequestsQueue stageFilter="tenant_ops_approved" title="Rejected at Landlord Ops" collapsible />
      <LandlordOpsPayoutReview reviewRole="landlord_ops" />

      {/* Agent Rent-Request Capacity (fleet-wide) */}
      <AgentRentCapacityPanel />

      {/* KPIs — responsive card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="Total Properties" value={landlordsList.length} icon={Home} loading={isLoading} onClick={() => setView('houses-by-landlord')} />
        <KPICard title="Occupied" value={occupiedLandlords.length} icon={UserCheck} loading={isLoading} color="bg-green-500/10 text-green-600" subtitle={`UGX ${fmt(totalMonthlyRevenue)}/mo`} onClick={() => setView('occupied')} />
        <KPICard title="Empty" value={emptyLandlords.length} icon={DoorOpen} loading={isLoading} color="bg-red-500/10 text-red-600" subtitle={`UGX ${fmt(lostMonthlyRevenue)}/mo lost`} onClick={() => setView('empty')} />
        <KPICard title="Landlords" value={landlordsList.length} icon={Building2} loading={isLoading} color="bg-sky-500/10 text-sky-600" subtitle={`${verifiedLandlords.length} verified`} onClick={() => setView('landlords')} />
        <KPICard title="Cities" value={cityGroups.length} icon={Globe} loading={isLoading} color="bg-teal-500/10 text-teal-600" subtitle="operating in" onClick={() => setView('cities')} />
        <KPICard title="No Landlord" value={noLandlordList.length} icon={UserX} loading={isLoading} color="bg-orange-500/10 text-orange-600" subtitle="need listing" onClick={() => setView('no-landlord')} />
      </div>

      {/* No landlord alert */}
      {noLandlordList.length > 0 && (
        <button
          onClick={() => setView('no-landlord')}
          className="w-full rounded-2xl border border-border bg-card p-4 flex items-center gap-3 text-left min-h-[56px] touch-manipulation active:scale-[0.98] transition-transform hover:bg-muted/40"
        >
          <div className="p-2 rounded-xl bg-muted">
            <UserX className="h-[18px] w-[18px] text-orange-600 shrink-0" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">{noLandlordList.length} tenants without landlord</p>
            <p className="text-[10px] text-muted-foreground leading-snug">Contact them to list property &amp; earn UGX 5,000</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      )}

      {/* Navigation Cards */}
      <div className="space-y-4">
        {/* Print Landlord Payouts Report */}
        <div className="flex flex-wrap justify-end items-center gap-2 pb-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1.5 font-normal", !reportFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {reportFrom ? format(reportFrom, 'dd MMM yyyy') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={reportFrom} onSelect={setReportFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1.5 font-normal", !reportTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {reportTo ? format(reportTo, 'dd MMM yyyy') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={reportTo} onSelect={setReportTo} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          {(reportFrom || reportTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setReportFrom(undefined); setReportTo(undefined); }}>
              Clear
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintReport} disabled={printingPdf}>
            {printingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print Report
          </Button>
        </div>
        {/* Priority items first */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 pt-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] text-muted-foreground font-medium tracking-wider">MANAGEMENT</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {navItems.filter(n => !n.priority).map(item => (
            <NavCard key={item.id} item={item} onClick={() => setView(item.id)}
              badge={
                item.id === 'empty' ? `${emptyLandlords.length}` :
                item.id === 'occupied' ? `${occupiedLandlords.length}` :
                item.id === 'verify' ? (unverifiedListings.length > 0 ? `${unverifiedListings.length}` : undefined) :
                item.id === 'agents' ? `${agentSummary.length}` : undefined
              } />
          ))}
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
        user={user} refetchAll={refetchAll} queryClient={queryClient}
      />

      {/* ─── Bulk action result summary ─── */}
      <Dialog open={!!bulkResult} onOpenChange={(o: boolean) => { if (!o) setBulkResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{bulkResult?.action} — results</DialogTitle>
          </DialogHeader>
          {bulkResult && (() => {
            const ok = bulkResult.results.filter(r => r.ok).length;
            const failed = bulkResult.results.length - ok;
            return (
              <div className="space-y-3">
                <div className="flex gap-2 text-sm font-semibold">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-700 px-2 py-1">
                    <CheckCircle2 className="h-4 w-4" />{ok} succeeded
                  </span>
                  {failed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-2 py-1">
                      <XCircle className="h-4 w-4" />{failed} failed
                    </span>
                  )}
                </div>
                <div className="max-h-[50vh] overflow-y-auto divide-y divide-border rounded-lg border border-border">
                  {bulkResult.results.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 p-2.5 text-sm">
                      {r.ok
                        ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                        : <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.title || 'Untitled house'}</p>
                        {!r.ok && <p className="text-xs text-destructive break-words">{r.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setBulkResult(null)}>Close</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared Dialogs Component ───
function LandlordDialogs({ editLandlord, setEditLandlord, editLC1, setEditLC1, assignPerson, setAssignPerson, deleteLandlord, setDeleteLandlord, deleteReason, setDeleteReason, deleting, setDeleting, previewImages, setPreviewImages, adjustListing, setAdjustListing, actionDialog, setActionDialog, user, refetchAll, queryClient }: any) {
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
          onComplete={() => {
            // Instantly remove the listing from the pending list by patching the
            // React Query cache. The full refetch below reconciles related fields.
            const targetId = actionDialog.listing.id;
            const action = actionDialog.type;
            queryClient?.setQueryData?.(['exec-house-listings-ops'], (old: any) => {
              if (!Array.isArray(old)) return old;
              if (action === 'delete') return old.filter((l: any) => l.id !== targetId);
              const newStatus = action === 'reject' ? 'rejected' : 'delisted';
              return old.map((l: any) => l.id === targetId ? { ...l, status: newStatus } : l);
            });
            refetchAll();
          }}
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
// ─── Reusable inline approve / reject control (shared by houses & landlords) ───
function InlineModerationActions({
  onApprove,
  onReject,
  approveLabel = 'Review & Approve',
  rejectLabel = 'Reject',
  approveHidden = false,
  approveChecklist,
  checklistTitle,
  checklistSubtitle,
}: {
  onApprove: (note: string) => Promise<void> | void;
  onReject: (note: string) => Promise<void> | void;
  approveLabel?: string;
  rejectLabel?: string;
  approveHidden?: boolean;
  approveChecklist?: { label: string; value?: string | null }[] | null;
  checklistTitle?: string;
  checklistSubtitle?: string;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const rejectValid = note.trim().length >= 10;

  const checklistItems = approveChecklist ?? [];
  const allChecked = checklistItems.length > 0 && checklistItems.every((_, i) => checked[i]);

  const run = async (kind: 'approve' | 'reject') => {
    if (busy) return;
    setBusy(kind);
    try {
      await (kind === 'approve' ? onApprove(note) : onReject(note));
      if (kind === 'approve') {
        setChecklistOpen(false);
        setChecked({});
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (required to reject, optional to approve)…"
        className="min-h-[64px] text-sm"
      />
      {note.length > 0 && note.trim().length < 10 && (
        <p className="text-[10px] text-muted-foreground">{10 - note.trim().length} more characters needed to reject</p>
      )}
      <div className={approveHidden ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
        <Button
          size="sm"
          variant="outline"
          className="h-11 gap-2 font-bold border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={!rejectValid || busy !== null}
          onClick={() => run('reject')}
        >
          <XCircle className="h-4 w-4" />
          {busy === 'reject' ? 'Rejecting…' : rejectLabel}
        </Button>
        {!approveHidden && (
        <Button
          size="sm"
          className="h-11 gap-2 font-bold"
          disabled={busy !== null}
          onClick={() => {
            if (checklistItems.length > 0) {
              setChecked({});
              setChecklistOpen(true);
            } else {
              run('approve');
            }
          }}
        >
          <ShieldCheck className="h-4 w-4" />
          {busy === 'approve' ? 'Approving…' : approveLabel}
        </Button>
        )}
      </div>

      {checklistItems.length > 0 && (
        <Dialog open={checklistOpen} onOpenChange={(o) => { if (!busy) setChecklistOpen(o); }}>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {checklistTitle || 'Confirm approval details'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {checklistSubtitle || 'Tick every item you have confirmed. The Approve button unlocks only when all are checked.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2.5 py-1">
              {checklistItems.map((item, i) => (
                <label
                  key={i}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors',
                    checked[i] ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={!!checked[i]}
                    onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [i]: !!v }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">{item.label}</span>
                    {item.value != null && item.value !== '' && (
                      <span className="block text-xs text-muted-foreground break-words mt-0.5">{item.value}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={busy !== null}
                onClick={() => setChecklistOpen(false)}
              >
                Cancel
              </Button>
              {allChecked && (
                <Button
                  className="w-full sm:w-auto gap-2 font-bold"
                  disabled={busy !== null}
                  onClick={() => run('approve')}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {busy === 'approve' ? 'Approving…' : approveLabel}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Reusable Nav Card ───
function NavCard({ item, onClick, badge, badgeAlert }: { item: typeof navItems[number]; onClick: () => void; badge?: string; badgeAlert?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 transition-colors text-left min-h-[64px] touch-manipulation active:scale-[0.98]"
    >
      <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
        <item.icon className="h-[18px] w-[18px] text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight">{item.label}</p>
        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <Badge
            variant={badgeAlert ? 'default' : 'secondary'}
            className={badgeAlert ? 'text-[10px] font-bold bg-rose-600 text-white hover:bg-rose-600' : 'text-[10px] font-medium'}
          >
            {badge}
          </Badge>
        )}
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
              <StorageImage src={house.image_urls[0]} alt={house.title} className="w-full h-full object-cover" />
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
            <MapPin className="h-2.5 w-2.5 shrink-0" />{house.address ? `${house.address} · ` : ''}{house.village ? `${house.village} · ` : ''}{house.region}{house.district ? `, ${house.district}` : ''}
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
