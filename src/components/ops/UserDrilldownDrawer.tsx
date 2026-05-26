import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  User, Home, UserCheck, MapPin, Loader2, Link2, Plus, Phone,
  Wallet, ShieldAlert, Building2, ReceiptText, Smartphone, SmartphoneNfc,
  Search, Pencil, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { UserSearchPicker } from '@/components/cfo/UserSearchPicker';
import { Switch } from '@/components/ui/switch';

type UserBrief = { id: string; full_name: string | null; phone: string | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId?: string | null;
  agentId?: string | null;
  /** landlords.id (NOT auth user) — landlords live in their own table */
  landlordId?: string | null;
  defaultTab?: 'tenant' | 'agent' | 'landlord';
}

const fmtUGX = (n: number | string | null | undefined) =>
  `UGX ${Number(n ?? 0).toLocaleString()}`;

function useIsOpsRole(): boolean {
  const { user } = useAuth() as any;
  const { data } = useQuery({
    queryKey: ['is-ops-role', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
        .eq('enabled', true);
      const roles = (data ?? []).map((r: any) => r.role);
      return roles.some((r) => ['manager', 'super_admin', 'coo', 'operations'].includes(r));
    },
    staleTime: 60_000,
  });
  return !!data;
}

export function UserDrilldownDrawer({
  open, onOpenChange, tenantId, agentId, landlordId, defaultTab = 'landlord',
}: Props) {
  const [tab, setTab] = useState<'tenant' | 'agent' | 'landlord'>(defaultTab);
  // Global "open any user" — overrides tenantId when a user is picked
  const [pickedUser, setPickedUser] = useState<UserBrief | null>(null);
  const effectiveTenantId = pickedUser?.id ?? tenantId ?? null;
  const isOps = useIsOpsRole();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-4 sm:px-6 pt-5 pb-3 border-b">
          <SheetTitle className="text-lg">User drill-down</SheetTitle>
          <SheetDescription className="text-xs">
            Edit location, balances and linkages for every party in this rent flow.
            All changes are audited.
          </SheetDescription>
        </SheetHeader>

        {isOps && (
          <div className="px-4 sm:px-6 pt-3 pb-1 border-b bg-muted/20">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
              <Search className="h-3 w-3" /> Find any user — tenant, agent, landlord, funder, anyone
            </div>
            <UserSearchPicker
              label=""
              placeholder="Search by name or phone (any country, any agent, any town)"
              selectedUser={pickedUser as any}
              onSelect={(u) => { setPickedUser(u as any); if (u) setTab('tenant'); }}
            />
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="px-4 sm:px-6 pt-3">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="tenant" disabled={!effectiveTenantId}>
              <User className="h-3.5 w-3.5 mr-1" /> Tenant
            </TabsTrigger>
            <TabsTrigger value="agent" disabled={!agentId}>
              <UserCheck className="h-3.5 w-3.5 mr-1" /> Agent
            </TabsTrigger>
            <TabsTrigger value="landlord" disabled={!landlordId}>
              <Home className="h-3.5 w-3.5 mr-1" /> Landlord
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tenant" className="py-4">
            {effectiveTenantId && <TenantPane tenantId={effectiveTenantId} isOps={isOps} />}
          </TabsContent>
          <TabsContent value="agent" className="py-4">
            {agentId && <AgentPane agentId={agentId} isOps={isOps} />}
          </TabsContent>
          <TabsContent value="landlord" className="py-4">
            {landlordId && <LandlordPane landlordId={landlordId} isOps={isOps} />}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Profile (tenant/agent) shared header + location editor              */
/* ------------------------------------------------------------------ */
function useProfile(id: string) {
  return useQuery({
    queryKey: ['drilldown-profile', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, phone, continent, country, region, district, city, town, sub_county, parish, village, landmark, residence_lat, residence_lng, address_complete, has_smartphone',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

function useUserRoles(id: string) {
  return useQuery({
    queryKey: ['drilldown-roles', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles').select('role, enabled').eq('user_id', id).eq('enabled', true);
      return (data ?? []).map((r: any) => r.role as string);
    },
    enabled: !!id,
  });
}

function ProfileHeader({
  profile, roles, userId, canEdit,
}: { profile: any; roles: string[]; userId?: string; canEdit?: boolean }) {
  const qc = useQueryClient();
  const [showEditBtn, setShowEditBtn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState<string>(profile?.full_name ?? '');
  const [phone, setPhone] = useState<string>(profile?.phone ?? '');
  const [reason, setReason] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Missing user');
      if (reason.trim().length < 10) throw new Error('Reason must be ≥ 10 characters');
      const { error } = await supabase.rpc('ops_update_user_identity', {
        p_user_id: userId,
        p_full_name: name,
        p_phone: phone,
        p_reason: reason.trim(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      qc.invalidateQueries({ queryKey: ['drilldown-profile', userId] });
      setEditing(false); setShowEditBtn(false); setReason('');
    },
    onError: (e: any) => toast.error(e.message ?? 'Update failed'),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => canEdit && setShowEditBtn((v) => !v)}
              className={`text-base font-semibold truncate text-left ${canEdit ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
              title={canEdit ? 'Tap to edit' : undefined}
            >
              {profile?.full_name ?? 'Unnamed user'}
            </button>
            {canEdit && showEditBtn && !editing && (
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" /> {profile?.phone ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {roles.length === 0 && <Badge variant="outline" className="text-[10px]">no role</Badge>}
          {roles.map((r) => (
            <Badge key={r} variant="outline" className="text-[10px] capitalize">{r}</Badge>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Dashboards accessible: <span className="font-medium text-foreground">
          {roles.length ? roles.map((r) => r.replace('_', ' ')).join(', ') : 'none'}
        </span>
      </p>
      {canEdit && editing && (
        <Card className="p-3 space-y-2 border-primary/40">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Edit identity
            </div>
            <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setEditing(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-sm" />
          </div>
          <Textarea
            placeholder="Reason for change (min 10 chars)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-xs"
            rows={2}
          />
          <Button
            size="sm" className="w-full"
            disabled={save.isPending || reason.trim().length < 10}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Save changes
          </Button>
        </Card>
      )}
    </div>
  );
}

function LocationEditor({
  userId, profile, canEdit,
}: { userId: string; profile: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    country: profile?.country ?? 'Uganda',
    region: profile?.region ?? '',
    district: profile?.district ?? '',
    sub_county: profile?.sub_county ?? '',
    parish: profile?.parish ?? '',
    village: profile?.village ?? '',
    landmark: profile?.landmark ?? '',
  });
  const [hasSmartphone, setHasSmartphone] = useState<boolean>(
    profile?.has_smartphone ?? true,
  );
  const [gps, setGps] = useState<{ lat: number | null; lng: number | null; acc: number | null }>(
    { lat: profile?.residence_lat ?? null, lng: profile?.residence_lng ?? null, acc: null },
  );
  const [reason, setReason] = useState('');
  const [capturing, setCapturing] = useState(false);

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported on this device');
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
        setCapturing(false);
        toast.success('GPS captured');
      },
      (err) => { setCapturing(false); toast.error(err.message || 'GPS failed'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 10) throw new Error('Reason must be ≥ 10 characters');
      const { data, error } = await supabase.rpc('ops_update_user_location', {
        p_user_id: userId,
        p_address: form as any,
        p_latitude: gps.lat,
        p_longitude: gps.lng,
        p_accuracy: gps.acc,
        p_reason: reason.trim(),
        p_has_smartphone: hasSmartphone,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      qc.invalidateQueries({ queryKey: ['drilldown-profile', userId] });
      setReason('');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to update profile'),
  });

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="h-4 w-4 text-primary" /> Location
        {!profile?.address_complete && (
          <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Incomplete</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['country','region','district','sub_county','parish','village'] as const).map((k) => (
          <div key={k}>
            <Label className="text-[10px] uppercase text-muted-foreground">{k.replace('_',' ')}</Label>
            <Input
              value={(form as any)[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              disabled={!canEdit}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Landmark</Label>
        <Input
          value={form.landmark}
          onChange={(e) => setForm({ ...form, landmark: e.target.value })}
          disabled={!canEdit}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs">
        <span className="text-muted-foreground">
          GPS: {gps.lat != null ? `${gps.lat.toFixed(5)}, ${gps.lng?.toFixed(5)}` : '—'}
          {gps.acc != null && <> · ±{Math.round(gps.acc)}m</>}
        </span>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-7" onClick={captureGps} disabled={capturing}>
            {capturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
            <span className="ml-1">Capture</span>
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
        <div className="flex items-center gap-2 text-xs">
          {hasSmartphone ? <Smartphone className="h-3.5 w-3.5 text-emerald-600" /> : <SmartphoneNfc className="h-3.5 w-3.5 text-amber-600" />}
          <span className="font-medium">
            {hasSmartphone ? 'Has a smartphone' : 'No smartphone (USSD / agent-led)'}
          </span>
        </div>
        <Switch checked={hasSmartphone} onCheckedChange={setHasSmartphone} disabled={!canEdit} />
      </div>
      {canEdit && (
        <>
          <Textarea
            placeholder="Reason for change (min 10 chars)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-xs"
            rows={2}
          />
          <Button
            size="sm" className="w-full"
            onClick={() => save.mutate()}
            disabled={save.isPending || reason.trim().length < 10}
          >
            {save.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Save location
          </Button>
        </>
      )}
      {!canEdit && (
        <Alert className="py-2">
          <ShieldAlert className="h-3 w-3" />
          <AlertDescription className="text-[11px]">
            Read-only — only ops roles or the managing agent can edit this user's location.
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Tenant pane                                                         */
/* ------------------------------------------------------------------ */
function TenantPane({ tenantId, isOps }: { tenantId: string; isOps: boolean }) {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useProfile(tenantId);
  const { data: roles = [] } = useUserRoles(tenantId);
  const { data: rentReqs = [] } = useQuery({
    queryKey: ['drilldown-tenant-rr', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('rent_requests')
        .select('id, rent_amount, daily_repayment, total_repayment, amount_repaid, status, agent_id, assigned_agent_id, landlord_id, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const activeRr: any = rentReqs[0] ?? null;
  const balance = activeRr
    ? Math.max(0, Number(activeRr.total_repayment || 0) - Number(activeRr.amount_repaid || 0))
    : 0;

  const [reassignAgent, setReassignAgent] = useState<UserBrief | null>(null);
  const [reassignReason, setReassignReason] = useState('');
  const reassign = useMutation({
    mutationFn: async () => {
      if (!reassignAgent) throw new Error('Pick an agent');
      if (reassignReason.trim().length < 10) throw new Error('Reason ≥ 10 chars');
      // Always link the user → agent at the profile level (works for any user,
      // even with no active rent request).
      const { error: linkErr } = await supabase.rpc('ops_link_user_to_agent', {
        p_user_id: tenantId,
        p_agent_id: reassignAgent.id,
        p_reason: reassignReason.trim(),
      } as any);
      if (linkErr) throw linkErr;
      // If there is an active rent request, also reassign it so collections
      // route to the new agent immediately.
      if (activeRr) {
        const { error } = await supabase.rpc('reassign_rent_request_agent', {
          p_rent_request_id: activeRr.id,
          p_new_agent_id: reassignAgent.id,
          p_reason: reassignReason.trim(),
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('User linked to agent');
      setReassignAgent(null); setReassignReason('');
      qc.invalidateQueries({ queryKey: ['drilldown-tenant-rr', tenantId] });
      qc.invalidateQueries({ queryKey: ['drilldown-profile', tenantId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Link failed'),
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin mx-auto" />;

  return (
    <div className="space-y-3">
      <ProfileHeader profile={profile} roles={roles} />
      <LocationEditor userId={tenantId} profile={profile} canEdit={isOps /* agent edit handled elsewhere */} />

      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-primary" /> Rent balance
        </div>
        {!activeRr ? (
          <p className="text-xs text-muted-foreground">No rent requests on file.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Rent amount</span><p className="font-semibold">{fmtUGX(activeRr.rent_amount)}</p></div>
              <div><span className="text-muted-foreground">Daily repayment</span><p className="font-semibold">{fmtUGX(activeRr.daily_repayment)}</p></div>
              <div><span className="text-muted-foreground">Repaid</span><p className="font-semibold">{fmtUGX(activeRr.amount_repaid)}</p></div>
              <div><span className="text-muted-foreground">Outstanding</span><p className="font-semibold text-amber-700">{fmtUGX(balance)}</p></div>
            </div>
            <Badge variant="outline" className="text-[10px]">{activeRr.status}</Badge>
          </>
        )}
      </Card>

      {isOps && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-primary" /> Link to agent
          </div>
          <p className="text-[11px] text-muted-foreground">
            Assigns the managing agent on this user's profile{activeRr ? ' and reassigns the active rent request' : ''}. Works for any user — tenant, funder, landlord contact, or anyone else.
          </p>
          <UserSearchPicker
            label="Pick agent"
            selectedUser={reassignAgent as any}
            onSelect={(u) => setReassignAgent(u as any)}
            roleFilter="agent"
          />
          <Input
            placeholder="Reason (min 10 chars)"
            value={reassignReason}
            onChange={(e) => setReassignReason(e.target.value)}
            className="h-8 text-sm"
          />
          <Button
            size="sm" className="w-full"
            disabled={!reassignAgent || reassign.isPending}
            onClick={() => reassign.mutate()}
          >
            {reassign.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {activeRr ? 'Link & reassign rent' : 'Link to agent'}
          </Button>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agent pane                                                          */
/* ------------------------------------------------------------------ */
function AgentPane({ agentId, isOps }: { agentId: string; isOps: boolean }) {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useProfile(agentId);
  const { data: roles = [] } = useUserRoles(agentId);
  const { data: stats } = useQuery({
    queryKey: ['drilldown-agent-stats', agentId],
    queryFn: async () => {
      const [tenants, rentSum, landlords] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('managing_agent_id', agentId),
        supabase.from('rent_requests').select('rent_amount').eq('assigned_agent_id', agentId).limit(1000),
        supabase.from('agent_landlord_assignments').select('landlord_id, landlords(id,name,phone)').eq('agent_id', agentId).eq('status','active'),
      ]);
      const totalRent = (rentSum.data ?? []).reduce((s: number, r: any) => s + Number(r.rent_amount || 0), 0);
      return {
        tenantCount: tenants.count ?? 0,
        totalRent,
        landlords: landlords.data ?? [],
      };
    },
  });

  const [linkLandlord, setLinkLandlord] = useState<UserBrief | null>(null);
  const [linkReason, setLinkReason] = useState('');
  const link = useMutation({
    mutationFn: async () => {
      if (!linkLandlord) throw new Error('Pick a landlord');
      if (linkReason.trim().length < 10) throw new Error('Reason ≥ 10 chars');
      const { error } = await supabase.rpc('ops_link_agent_landlord', {
        p_agent_id: agentId,
        p_landlord_id: linkLandlord.id,
        p_reason: linkReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Landlord linked to agent');
      setLinkLandlord(null); setLinkReason('');
      qc.invalidateQueries({ queryKey: ['drilldown-agent-stats', agentId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Link failed'),
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin mx-auto" />;

  return (
    <div className="space-y-3">
      <ProfileHeader profile={profile} roles={roles} />
      <LocationEditor userId={agentId} profile={profile} canEdit={isOps} />

      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ReceiptText className="h-4 w-4 text-primary" /> Portfolio
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Tenants</span><p className="font-semibold">{stats?.tenantCount ?? 0}</p></div>
          <div><span className="text-muted-foreground">Rent under mgmt</span><p className="font-semibold">{fmtUGX(stats?.totalRent ?? 0)}</p></div>
        </div>
      </Card>

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" /> Linked landlords
          </div>
          <Badge variant="outline" className="text-[10px]">{stats?.landlords?.length ?? 0}</Badge>
        </div>
        {(stats?.landlords ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No landlords linked yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {(stats?.landlords ?? []).map((a: any) => (
              <li key={a.landlord_id} className="flex justify-between border-b border-border/40 py-1">
                <span className="truncate">{a.landlords?.name ?? a.landlord_id}</span>
                <span className="text-muted-foreground font-mono">{a.landlords?.phone}</span>
              </li>
            ))}
          </ul>
        )}

        {isOps && (
          <div className="pt-2 border-t border-border/40 space-y-2">
            <UserSearchPicker
              label="+ Link landlord"
              selectedUser={linkLandlord as any}
              onSelect={(u) => setLinkLandlord(u as any)}
              roleFilter="landlord"
            />
            <Input
              placeholder="Reason (min 10 chars)"
              value={linkReason}
              onChange={(e) => setLinkReason(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              size="sm" className="w-full"
              disabled={!linkLandlord || link.isPending}
              onClick={() => link.mutate()}
            >
              {link.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Link landlord
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landlord pane                                                       */
/* ------------------------------------------------------------------ */
function LandlordPane({ landlordId, isOps }: { landlordId: string; isOps: boolean }) {
  const qc = useQueryClient();
  const { data: landlord, isLoading } = useQuery({
    queryKey: ['drilldown-landlord', landlordId],
    queryFn: async () => {
      const { data } = await supabase.from('landlords')
        .select('id, name, phone, mobile_money_number, property_address, monthly_rent, verified, has_smartphone')
        .eq('id', landlordId).maybeSingle();
      return data;
    },
  });

  const { data: listings = [] } = useQuery({
    queryKey: ['drilldown-landlord-listings', landlordId],
    queryFn: async () => {
      const { data } = await supabase
        .from('house_listings')
        .select('id, title, monthly_rent, status, village, district')
        .eq('landlord_id', landlordId).limit(50);
      return data ?? [];
    },
  });

  const { data: funderLinks = [] } = useQuery({
    queryKey: ['drilldown-landlord-funders', landlordId],
    queryFn: async () => {
      const { data } = await supabase
        .from('landlord_funder_links')
        .select('id, funder_id, reason, created_at, active')
        .eq('landlord_id', landlordId).eq('active', true);
      const ids = (data ?? []).map((r: any) => r.funder_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from('profiles').select('id, full_name, phone').in('id', ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((r: any) => ({ ...r, funder: map.get(r.funder_id) ?? null }));
    },
  });

  const [linkFunder, setLinkFunder] = useState<UserBrief | null>(null);
  const [linkReason, setLinkReason] = useState('');
  const link = useMutation({
    mutationFn: async () => {
      if (!linkFunder) throw new Error('Pick a funder');
      if (linkReason.trim().length < 10) throw new Error('Reason ≥ 10 chars');
      const { error } = await supabase.rpc('ops_link_landlord_funder', {
        p_landlord_id: landlordId,
        p_funder_id: linkFunder.id,
        p_reason: linkReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Funder linked');
      setLinkFunder(null); setLinkReason('');
      qc.invalidateQueries({ queryKey: ['drilldown-landlord-funders', landlordId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Link failed'),
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin mx-auto" />;

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold truncate">{landlord?.name ?? 'Unknown landlord'}</p>
          {landlord?.verified && (
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Verified</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {landlord?.phone}</p>
        <p className="text-xs text-muted-foreground">MoMo: <span className="font-mono">{landlord?.mobile_money_number ?? '—'}</span></p>
        <p className="text-xs text-muted-foreground">Address: {landlord?.property_address}</p>
        {landlord?.monthly_rent != null && (
          <p className="text-xs">Default rent: <b>{fmtUGX(landlord.monthly_rent)}</b></p>
        )}
        <LandlordSmartphoneToggle landlordId={landlordId} initial={landlord?.has_smartphone ?? true} canEdit={isOps} />
      </Card>

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" /> Rentals listed
          </div>
          <Badge variant="outline" className="text-[10px]">{listings.length}</Badge>
        </div>
        {listings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No listings recorded.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {listings.map((l: any) => (
              <li key={l.id} className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span className="truncate flex-1">{l.title} · <span className="text-muted-foreground">{l.village ?? l.district ?? ''}</span></span>
                <span className="font-semibold">{fmtUGX(l.monthly_rent)}</span>
                <Badge variant="outline" className="text-[9px]">{l.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-primary" /> Linked funders
          </div>
          <Badge variant="outline" className="text-[10px]">{funderLinks.length}</Badge>
        </div>
        {funderLinks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No funders linked yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {funderLinks.map((l: any) => (
              <li key={l.id} className="flex justify-between border-b border-border/40 py-1">
                <span className="truncate">{l.funder?.full_name ?? l.funder_id}</span>
                <span className="text-muted-foreground font-mono">{l.funder?.phone}</span>
              </li>
            ))}
          </ul>
        )}

        {isOps && (
          <div className="pt-2 border-t border-border/40 space-y-2">
            <UserSearchPicker
              label="+ Link funder"
              selectedUser={linkFunder as any}
              onSelect={(u) => setLinkFunder(u as any)}
              roleFilter="supporter"
            />
            <Input
              placeholder="Reason (min 10 chars)"
              value={linkReason}
              onChange={(e) => setLinkReason(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              size="sm" className="w-full"
              disabled={!linkFunder || link.isPending}
              onClick={() => link.mutate()}
            >
              {link.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Link funder
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Link2 className="h-4 w-4" /> LC1 chairperson
        </div>
        <p className="text-xs text-muted-foreground italic">Coming soon — confirm data model to enable.</p>
      </Card>
    </div>
  );
}

function LandlordSmartphoneToggle({
  landlordId, initial, canEdit,
}: { landlordId: string; initial: boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const [val, setVal] = useState<boolean>(initial);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: async (next: boolean) => {
      if (reason.trim().length < 10) throw new Error('Reason must be ≥ 10 characters');
      const { error } = await supabase.rpc('ops_update_landlord_smartphone', {
        p_landlord_id: landlordId,
        p_has_smartphone: next,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Smartphone flag updated');
      setEditing(false); setReason('');
      qc.invalidateQueries({ queryKey: ['drilldown-landlord', landlordId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Update failed'),
  });

  return (
    <div className="mt-1 pt-2 border-t border-border/40 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          {val ? <Smartphone className="h-3.5 w-3.5 text-emerald-600" /> : <SmartphoneNfc className="h-3.5 w-3.5 text-amber-600" />}
          <span className="font-medium">{val ? 'Has smartphone' : 'No smartphone (USSD / agent-led)'}</span>
        </div>
        {canEdit && (
          <Switch
            checked={val}
            onCheckedChange={(v) => { setVal(v); setEditing(true); }}
          />
        )}
      </div>
      {canEdit && editing && (
        <div className="space-y-1.5">
          <Input
            placeholder="Reason (min 10 chars)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-7"
              disabled={save.isPending || reason.trim().length < 10}
              onClick={() => save.mutate(val)}>
              {save.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7"
              onClick={() => { setVal(initial); setEditing(false); setReason(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}