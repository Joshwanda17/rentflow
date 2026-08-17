import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  ShieldQuestion, CheckCircle2, XCircle, Phone, Loader2, UserCircle,
  MapPin, Home, Banknote, Smartphone, Calendar, Search, Building2,
  FilterX, Clock,
} from 'lucide-react';
import { notifyVerificationResolved } from '@/lib/landlordVerificationNotify';
import { setLandlordVerification } from '@/lib/landlord-ops/verification';

interface VerificationRequest {
  id: string;
  landlord_id: string;
  landlord_name: string | null;
  landlord_phone: string | null;
  requested_by: string;
  agent_name: string | null;
  agent_phone: string | null;
  note: string | null;
  created_at: string;
}

interface Props {
  onResolved?: () => void;
}

interface LandlordDetail {
  id: string;
  name: string | null;
  phone: string | null;
  property_address: string | null;
  region: string | null;
  district: string | null;
  county: string | null;
  sub_county: string | null;
  town_council: string | null;
  village: string | null;
  latitude: number | null;
  longitude: number | null;
  number_of_houses: number | null;
  house_category: string | null;
  monthly_rent: number | null;
  bank_name: string | null;
  account_number: string | null;
  mobile_money_number: string | null;
  mobile_money_name: string | null;
  has_smartphone: boolean | null;
  caretaker_name: string | null;
  caretaker_phone: string | null;
  created_at: string | null;
}

interface HouseRow {
  id: string;
  title: string | null;
  region: string | null;
  district: string | null;
  monthly_rent: number | null;
  status: string | null;
}

interface DetailBundle {
  landlord: LandlordDetail | null;
  houses: HouseRow[];
}

const fmtUgx = (n?: number | null) =>
  n == null ? '—' : `UGX ${Number(n).toLocaleString()}`;

/**
 * Agent-initiated landlord verification requests.
 * Shown very prominently on the Landlord Ops dashboard so operators can
 * verify (or reject with a comment) a landlord an agent flagged while trying
 * to post a rent request.
 */
export function AgentVerificationRequestsPanel({ onResolved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [verifyComment, setVerifyComment] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [details, setDetails] = useState<Record<string, DetailBundle>>({});
  // Landlord district per pending request — loaded up-front so the queue can be
  // filtered by district without expanding every card.
  const [districtByLandlord, setDistrictByLandlord] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('landlord_verification_requests')
      .select('id, landlord_id, landlord_name, landlord_phone, requested_by, agent_name, agent_phone, note, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (!error) {
      const rows = (data ?? []) as VerificationRequest[];
      setRequests(rows);
      const ids = Array.from(new Set(rows.map(r => r.landlord_id).filter(Boolean)));
      if (ids.length > 0) {
        const { data: locs } = await supabase
          .from('landlords')
          .select('id, district')
          .in('id', ids);
        setDistrictByLandlord(
          Object.fromEntries(
            ((locs ?? []) as { id: string; district: string | null }[]).map(l => [l.id, l.district || '']),
          ),
        );
      } else {
        setDistrictByLandlord({});
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('landlord-verification-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'landlord_verification_requests' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Load full landlord context (location, houses, finance, agent) so Ops can
  // verify authenticity BEFORE approving — never a blind one-click approve.
  const openDetails = useCallback(async (req: VerificationRequest) => {
    if (expandedId === req.id) { setExpandedId(null); return; }
    setExpandedId(req.id);
    setRejectingId(null);
    setVerifyComment('');
    if (details[req.landlord_id]) return; // cached
    setDetailLoading(true);
    try {
      const [{ data: landlord }, { data: houses }] = await Promise.all([
        supabase
          .from('landlords')
          .select('id, name, phone, property_address, region, district, county, sub_county, town_council, village, latitude, longitude, number_of_houses, house_category, monthly_rent, bank_name, account_number, mobile_money_number, mobile_money_name, has_smartphone, caretaker_name, caretaker_phone, created_at')
          .eq('id', req.landlord_id)
          .maybeSingle(),
        supabase
          .from('house_listings')
          .select('id, title, region, district, monthly_rent, status')
          .eq('landlord_id', req.landlord_id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      setDetails(prev => ({
        ...prev,
        [req.landlord_id]: {
          landlord: (landlord ?? null) as LandlordDetail | null,
          houses: (houses ?? []) as HouseRow[],
        },
      }));
    } catch {
      setDetails(prev => ({ ...prev, [req.landlord_id]: { landlord: null, houses: [] } }));
    } finally {
      setDetailLoading(false);
    }
  }, [expandedId, details]);

  const handleVerify = async (req: VerificationRequest) => {
    if (!user) return;
    // Optional operator comment. When supplied it becomes the recorded decision
    // reason (the same field every report/export already reads); when omitted the
    // existing default reason is kept exactly as before.
    const comment = verifyComment.trim();
    if (comment.length > 0 && comment.length < 10) {
      toast({ title: 'Comment too short', description: 'Either leave the comment empty or give at least 10 characters.', variant: 'destructive' });
      return;
    }
    setBusyId(req.id);
    try {
      // Single authorized write path: state + request + audit + event + notify.
      await setLandlordVerification({
        landlordId: req.landlord_id,
        status: 'verified',
        reason: comment
          ? `${comment} — verified from agent verification request (${req.agent_name || 'agent'})`
          : `Verified from agent verification request (${req.agent_name || 'agent'})`,
        source: 'agent_request',
      });
      toast({ title: '✅ Landlord verified', description: `${req.landlord_name || 'Landlord'} is now verified.` });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      setVerifyComment('');
      void notifyVerificationResolved({
        status: 'verified',
        agentId: req.requested_by,
        landlordId: req.landlord_id,
        landlordName: req.landlord_name,
        landlordPhone: req.landlord_phone,
        comment: comment || undefined,
        requestId: req.id,
      });
      onResolved?.();
    } catch (err: any) {
      toast({ title: 'Verify failed', description: err?.message || 'Could not verify landlord', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: VerificationRequest) => {
    if (!user) return;
    const comment = rejectComment.trim();
    if (comment.length < 10) {
      toast({ title: 'Add a comment', description: 'Please give at least 10 characters explaining the rejection.', variant: 'destructive' });
      return;
    }
    setBusyId(req.id);
    try {
      // Rejection now persists on the landlord too, so the record leaves the
      // pending bucket and shows under Rejected.
      await setLandlordVerification({
        landlordId: req.landlord_id,
        status: 'rejected',
        reason: comment,
        source: 'agent_request',
      });
      toast({ title: 'Request rejected', description: `${req.landlord_name || 'Landlord'} was rejected with a comment.` });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      setRejectingId(null);
      setRejectComment('');
      void notifyVerificationResolved({
        status: 'rejected',
        agentId: req.requested_by,
        landlordId: req.landlord_id,
        landlordName: req.landlord_name,
        landlordPhone: req.landlord_phone,
        comment,
        requestId: req.id,
      });
      onResolved?.();
    } catch (err: any) {
      toast({ title: 'Reject failed', description: err?.message || 'Could not reject request', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      (r.landlord_name || '').toLowerCase().includes(q) ||
      (r.landlord_phone || '').toLowerCase().includes(q) ||
      (r.agent_name || '').toLowerCase().includes(q) ||
      (r.agent_phone || '').toLowerCase().includes(q) ||
      (districtByLandlord[r.landlord_id] || '').toLowerCase().includes(q)
    );
  }, [requests, search, districtByLandlord]);

  if (loading || requests.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm overflow-hidden">
      {/* Header — always visible, never collapsible */}
      <div className="p-4 border-b border-amber-500/20 bg-amber-500/10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15">
              <ShieldQuestion className="h-5 w-5 text-amber-600 shrink-0" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight flex items-center gap-2">
                Landlord verification queue
                <Badge className="bg-amber-600 text-white hover:bg-amber-600">{requests.length}</Badge>
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Agents posted rent requests for landlords that still need verification.
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search landlord, phone or agent…"
              className="pl-8 h-8 text-xs bg-background/80"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <FilterX className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Proper list — not nested in a collapsible */}
      <div className="p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No requests match “{search}”.
          </div>
        ) : (
          filtered.map((req) => (
            <div
              key={req.id}
              className="rounded-xl border border-amber-500/30 bg-background p-3 space-y-3 hover:border-amber-500/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-foreground truncate">
                      {req.landlord_name || 'Unnamed landlord'}
                    </p>
                    <Badge variant="outline" className="shrink-0 border-amber-500/40 text-amber-700 text-[10px]">
                      Pending
                    </Badge>
                  </div>
                  {req.landlord_phone && (
                    <a href={`tel:${req.landlord_phone}`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 truncate mt-0.5">
                      <Phone className="h-3 w-3 shrink-0" /> {req.landlord_phone}
                    </a>
                  )}
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 truncate">
                    <UserCircle className="h-3.5 w-3.5 shrink-0" />
                    Requested by <span className="font-medium text-foreground">{req.agent_name || 'Agent'}</span>
                    {req.agent_phone ? ` · ${req.agent_phone}` : ''}
                    <span className="inline-flex items-center gap-1 ml-2 opacity-70">
                      <Clock className="h-3 w-3" />
                      {new Date(req.created_at).toLocaleDateString()}
                    </span>
                  </p>
                </div>
              </div>

              {/* Review trigger */}
              <Button
                size="sm"
                variant={expandedId === req.id ? 'secondary' : 'default'}
                className="w-full"
                onClick={() => openDetails(req)}
              >
                <Search className="h-3.5 w-3.5 mr-1" />
                {expandedId === req.id ? 'Hide details' : 'Review details to verify'}
              </Button>

              {expandedId === req.id && (() => {
                const bundle = details[req.landlord_id];
                const d = bundle?.landlord;
                const houses = bundle?.houses ?? [];
                if (detailLoading && !bundle) {
                  return (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading landlord details…
                    </div>
                  );
                }
                const locationParts = [d?.village, d?.town_council || d?.sub_county, d?.county, d?.district, d?.region]
                  .filter(Boolean);
                const hasGps = d?.latitude != null && d?.longitude != null;
                return (
                  <div className="space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5 p-3">
                    {/* Location */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Location
                      </p>
                      <p className="text-xs font-medium text-foreground">
                        {locationParts.length ? locationParts.join(', ') : (d?.property_address || 'No location on file')}
                      </p>
                      {d?.property_address && locationParts.length > 0 && (
                        <p className="text-[11px] text-muted-foreground">{d.property_address}</p>
                      )}
                      {hasGps && (
                        <a
                          href={`https://www.google.com/maps?q=${d!.latitude},${d!.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-sky-600 hover:underline inline-flex items-center gap-1"
                        >
                          <MapPin className="h-3 w-3" /> View GPS pin
                        </a>
                      )}
                    </div>

                    {/* Houses */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Home className="h-3 w-3" /> Houses
                        <span className="ml-1 normal-case text-foreground">
                          {d?.number_of_houses ?? houses.length} registered
                          {d?.house_category ? ` · ${String(d.house_category).replace(/_/g, ' ')}` : ''}
                        </span>
                      </p>
                      {houses.length > 0 ? (
                        <ul className="space-y-1">
                          {houses.slice(0, 5).map(h => (
                            <li key={h.id} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">{h.title || 'Untitled listing'}</span>
                              {[h.district, h.region].filter(Boolean).length > 0 && (
                                <span className="opacity-70">· {[h.district, h.region].filter(Boolean).join(', ')}</span>
                              )}
                              {h.monthly_rent != null && <span className="opacity-70">· {fmtUgx(h.monthly_rent)}</span>}
                            </li>
                          ))}
                          {houses.length > 5 && (
                            <li className="text-[11px] text-muted-foreground">+{houses.length - 5} more</li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">No house listings linked yet.</p>
                      )}
                    </div>

                    {/* Agent who registered */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <UserCircle className="h-3 w-3" /> Registered by agent
                      </p>
                      <p className="text-xs font-medium text-foreground">{req.agent_name || 'Unknown agent'}</p>
                      {req.agent_phone && (
                        <a href={`tel:${req.agent_phone}`} className="text-[11px] font-medium text-sky-600 hover:underline inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {req.agent_phone}
                        </a>
                      )}
                    </div>

                    {/* Finance & contact metadata */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-amber-500/20">
                      <div>
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Monthly rent</p>
                        <p className="text-[11px] font-medium">{fmtUgx(d?.monthly_rent)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Smartphone className="h-3 w-3" /> Smartphone</p>
                        <p className="text-[11px] font-medium">{d?.has_smartphone ? 'Yes' : 'No'}</p>
                      </div>
                      {(d?.bank_name || d?.account_number) && (
                        <div className="col-span-2">
                          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Bank</p>
                          <p className="text-[11px] font-medium">{[d?.bank_name, d?.account_number].filter(Boolean).join(' · ')}</p>
                        </div>
                      )}
                      {(d?.mobile_money_number || d?.mobile_money_name) && (
                        <div className="col-span-2">
                          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Mobile money</p>
                          <p className="text-[11px] font-medium">{[d?.mobile_money_name, d?.mobile_money_number].filter(Boolean).join(' · ')}</p>
                        </div>
                      )}
                      {(d?.caretaker_name || d?.caretaker_phone) && (
                        <div className="col-span-2">
                          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Caretaker</p>
                          <p className="text-[11px] font-medium">{[d?.caretaker_name, d?.caretaker_phone].filter(Boolean).join(' · ')}</p>
                        </div>
                      )}
                      {d?.created_at && (
                        <div className="col-span-2">
                          <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Registered</p>
                          <p className="text-[11px] font-medium">{new Date(d.created_at).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>

                    {/* Step 2: decide */}
                    {rejectingId === req.id ? (
                      <div className="space-y-2 pt-1">
                        <Textarea
                          value={rejectComment}
                          onChange={(e) => setRejectComment(e.target.value)}
                          placeholder="Add a comment explaining why this landlord is rejected (min 10 characters)…"
                          className="min-h-[64px] text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" className="flex-1" disabled={busyId === req.id} onClick={() => handleReject(req)}>
                            {busyId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                            Confirm reject
                          </Button>
                          <Button size="sm" variant="ghost" className="flex-1" disabled={busyId === req.id} onClick={() => { setRejectingId(null); setRejectComment(''); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busyId === req.id} onClick={() => handleVerify(req)}>
                          {busyId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                          Verify landlord
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 border-rose-500/40 text-rose-700 hover:bg-rose-50" disabled={busyId === req.id} onClick={() => { setRejectingId(req.id); setRejectComment(''); }}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
