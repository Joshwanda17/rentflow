import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, User, Phone, Calendar, TrendingUp, CheckCircle, Clock, AlertTriangle, XCircle, Mail, MessageCircle, FileText, Trash2, BadgeCheck, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatLocation, locationHaystack } from '@/lib/locationText';
import { CompactAmount } from '@/components/ui/CompactAmount';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export function PromissoryNotesQueue() {
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const canReverseBonus = (roles || []).some((r: string) => ['ceo', 'coo', 'cfo', 'super_admin'].includes(r));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [approveReason, setApproveReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);

  const { data: leadCandidates = [], isFetching: leadLoading } = useQuery({
    queryKey: ['partner-lead-candidates', leadSearch],
    enabled: !!approveTarget && leadSearch.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('partner_lead_candidates' as any, {
        p_search: leadSearch.trim(),
      });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handleReverseBonus = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 20) {
      toast.error('Please provide a reason of at least 20 characters.');
      return;
    }
    setRejecting(true);
    try {
      const { data, error } = await supabase.rpc('reverse_promissory_note_bonus' as any, {
        p_note_id: rejectTarget.id,
        p_reason: reason,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.status === 'error') throw new Error(res.message);
      if (res?.status === 'reversed') {
        const legs = Array.isArray(res?.legs) ? res.legs : [];
        const summary = legs.length
          ? legs
              .map((l: any) => `${l.role || l.payee_role || 'payee'}: ${l.recovered ?? l.amount ?? 0}${l.arrears ? ` (arrears ${l.arrears})` : ''}`)
              .join(' · ')
          : 'No wallet legs recovered.';
        toast.success(`Bonus reversed — ${summary}`);
      } else {
        toast.info(res?.message || `Reversal returned status: ${res?.status ?? 'unknown'}`);
      }
      setRejectTarget(null);
      setRejectReason('');
      setSelectedNote(null);
      queryClient.invalidateQueries({ queryKey: ['promissory-notes-queue'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reverse promissory note bonus.');
    } finally {
      setRejecting(false);
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    const reason = approveReason.trim();
    if (reason.length < 20) {
      toast.error('Please provide a reason of at least 20 characters.');
      return;
    }
    setApproving(true);
    try {
      if (selectedLead?.user_id && approveTarget.agent_id) {
        const { error: assignError } = await supabase
          .from('partner_lead_assignments' as any)
          .insert({
            lead_user_id: selectedLead.user_id,
            agent_id: approveTarget.agent_id,
            reason,
          } as any);
        // 23505 = unique violation: an active assignment already exists. Continue.
        if (assignError && (assignError as any).code !== '23505') {
          throw assignError;
        }
      }
      const { data, error } = await supabase.rpc('approve_promissory_note', {
        p_note_id: approveTarget.id,
        p_reason: reason,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.status === 'error') throw new Error(res.message);
      if (res?.status === 'already_approved') {
        toast.info('This promissory note was already approved.');
      } else {
        toast.success('Approved — UGX 1,500 credited to the agent’s wallet.');
      }
      setApproveTarget(null);
      setApproveReason('');
      setSelectedLead(null);
      setLeadSearch('');
      setSelectedNote(null);
      queryClient.invalidateQueries({ queryKey: ['promissory-notes-queue'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve promissory note.');
    } finally {
      setApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const reason = deleteReason.trim();
    if (reason.length < 10) {
      toast.error('Please provide a reason of at least 10 characters.');
      return;
    }
    setDeleting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const actorId = userData?.user?.id;

      // Record the deletion in the audit trail BEFORE removing the record
      const { error: auditError } = await supabase.from('audit_logs').insert({
        user_id: actorId,
        action_type: 'delete',
        action: 'delete_promissory_note',
        table_name: 'promissory_notes',
        record_id: String(deleteTarget.id),
        metadata: {
          reason,
          partner_name: deleteTarget.partner_name,
          whatsapp_number: deleteTarget.whatsapp_number,
          amount: deleteTarget.amount,
          total_collected: deleteTarget.total_collected,
          status: deleteTarget.status,
          agent_id: deleteTarget.agent_id,
          agent_name: deleteTarget.agent_name,
          deleted_at: new Date().toISOString(),
        },
      });
      if (auditError) throw auditError;

      const { error: delError } = await supabase
        .from('promissory_notes')
        .delete()
        .eq('id', deleteTarget.id);
      if (delError) throw delError;

      toast.success('Promissory note deleted and logged.');
      setDeleteTarget(null);
      setDeleteReason('');
      setSelectedNote(null);
      queryClient.invalidateQueries({ queryKey: ['promissory-notes-queue'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete promissory note.');
    } finally {
      setDeleting(false);
    }
  };

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['promissory-notes-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promissory_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      if (!data) return [];

      // Fetch agent profiles
      const agentIds = [...new Set([
        ...data.map(n => n.agent_id),
        ...data.map(n => n.partner_user_id),
      ].filter(Boolean))];
      const { data: agents } = await supabase
        .from('profiles')
        .select('id, full_name, phone, region, district, sub_county, parish, village, city, town, landmark')
        .in('id', agentIds);

      const agentMap = new Map(agents?.map(a => [a.id, a]) || []);

      const addressOf = (p: any) => formatLocation([
        p?.landmark, p?.village, p?.parish, p?.sub_county, p?.city || p?.town, p?.district, p?.region,
      ]);

      // ---- Detect partners who have actually come in (registered) ----
      const last9 = (v?: string | null) => (v || '').replace(/\D/g, '').slice(-9);
      const phoneKeys = new Set<string>();
      const emailKeys = new Set<string>();
      data.forEach(n => {
        [n.whatsapp_number, n.phone_number].forEach(p => {
          const k = last9(p);
          if (k.length === 9) phoneKeys.add(k);
        });
        if (n.email) emailKeys.add(n.email.trim().toLowerCase());
      });
      const phoneVariants = [...phoneKeys].flatMap(k => [`+256${k}`, `256${k}`, `0${k}`, k]);

      const [{ data: byPhone }, { data: byEmail }] = await Promise.all([
        phoneVariants.length
          ? supabase.from('profiles').select('id, full_name, phone, email, created_at').in('phone', phoneVariants)
          : Promise.resolve({ data: [] as any[] } as any),
        emailKeys.size
          ? supabase.from('profiles').select('id, full_name, phone, email, created_at').in('email', [...emailKeys])
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const phoneIndex = new Map<string, any>();
      (byPhone || []).forEach((p: any) => {
        const k = last9(p.phone);
        if (k.length === 9 && !phoneIndex.has(k)) phoneIndex.set(k, p);
      });
      const emailIndex = new Map<string, any>();
      (byEmail || []).forEach((p: any) => {
        const k = (p.email || '').trim().toLowerCase();
        if (k && !emailIndex.has(k)) emailIndex.set(k, p);
      });

      return data.map(note => {
        const agent = agentMap.get(note.agent_id) as any;
        const partner = note.partner_user_id ? (agentMap.get(note.partner_user_id) as any) : null;
        const agentAddress = addressOf(agent);
        const partnerAddress = addressOf(partner);

        const noteEmail = (note.email || '').trim().toLowerCase();
        const matched =
          partner ||
          phoneIndex.get(last9(note.whatsapp_number)) ||
          phoneIndex.get(last9(note.phone_number)) ||
          (noteEmail ? emailIndex.get(noteEmail) : null) ||
          null;
        const matchedBy = partner
          ? 'linked account'
          : phoneIndex.get(last9(note.whatsapp_number)) || phoneIndex.get(last9(note.phone_number))
          ? 'phone'
          : matched
          ? 'email'
          : null;

        return {
          ...note,
          agent_name: agent?.full_name || 'Unknown Agent',
          agent_phone: agent?.phone || '',
          agent_address: agentAddress,
          partner_address: partnerAddress,
          came_in: !!matched,
          came_in_user_id: matched?.id || null,
          came_in_name: matched?.full_name || null,
          came_in_phone: matched?.phone || null,
          came_in_email: matched?.email || null,
          came_in_matched_by: matchedBy,
          came_in_at: matched?.created_at || null,
          search_text: locationHaystack([
            note.partner_name,
            note.whatsapp_number,
            note.phone_number,
            agent?.full_name,
            agentAddress,
            partnerAddress,
            matched?.full_name,
            matched?.phone,
            matched?.email,
            matched ? 'came in registered' : 'not registered',
          ]),
        };
      });
    },
  });

  const filtered = notes.filter(n => {
    const matchesSearch = !search || (n.search_text || '').includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'came_in'
        ? !!n.came_in
        : statusFilter === 'not_registered'
        ? !n.came_in
        : n.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = notes.reduce((acc, n) => {
    acc[n.status] = (acc[n.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalReceivable = notes
    .filter(n => ['pending', 'activated'].includes(n.status))
    .reduce((sum, n) => sum + Number(n.amount) - Number(n.total_collected), 0);

  const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
    pending: { icon: Clock, color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Pending' },
    activated: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Activated' },
    fulfilled: { icon: TrendingUp, color: 'bg-primary/10 text-primary border-primary/20', label: 'Fulfilled' },
    defaulted: { icon: AlertTriangle, color: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Defaulted' },
    cancelled: { icon: XCircle, color: 'bg-muted text-muted-foreground border-border', label: 'Cancelled' },
  };

  const statuses = ['all', 'pending', 'activated', 'fulfilled', 'defaulted', 'cancelled'];
  const cameInCount = notes.filter((n: any) => n.came_in).length;
  const notRegisteredCount = notes.length - cameInCount;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Notes</p>
            <p className="text-lg font-bold">{notes.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Receivable</p>
            <p className="text-sm font-bold text-emerald-700"><CompactAmount value={totalReceivable} /></p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-700">{statusCounts.pending || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, agent, phone, district or address..." className="pl-9" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            {s === 'all' ? `All (${notes.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${statusCounts[s] || 0})`}
          </button>
        ))}
        <button
          onClick={() => setStatusFilter('came_in')}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
            statusFilter === 'came_in' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          )}
        >
          Came in ({cameInCount})
        </button>
        <button
          onClick={() => setStatusFilter('not_registered')}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
            statusFilter === 'not_registered' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          )}
        >
          Not registered ({notRegisteredCount})
        </button>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading promissory notes...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No promissory notes found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(note => {
            const config = statusConfig[note.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const outstanding = Number(note.amount) - Number(note.total_collected);

            return (
              <Card key={note.id} className="border cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedNote(note)}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{note.partner_name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">{note.whatsapp_number}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0', config.color)}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>

                  {note.came_in ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <BadgeCheck className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                        <span className="text-[11px] font-semibold text-emerald-800">
                          Came in — partner registered
                        </span>
                        <span className="text-[10px] text-emerald-700/80 ml-auto">via {note.came_in_matched_by}</span>
                      </div>
                      <p className="text-[11px] text-emerald-800/90 mt-0.5 truncate">
                        {note.came_in_name || 'Account'}
                        {note.came_in_phone ? ` · ${note.came_in_phone}` : ''}
                        {note.came_in_email ? ` · ${note.came_in_email}` : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1">
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">Not yet registered in the system</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-muted-foreground">Promised: </span>
                      <span className="font-bold"><CompactAmount value={Number(note.amount)} /></span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Collected: </span>
                      <span className="font-medium"><CompactAmount value={Number(note.total_collected)} /></span>
                    </div>
                    {outstanding > 0 && (
                      <div>
                        <span className="text-muted-foreground">Due: </span>
                        <span className="font-bold text-primary"><CompactAmount value={outstanding} /></span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(note.created_at), 'dd MMM yyyy')}
                    </span>
                    <span>{note.contribution_type === 'monthly' ? `Monthly (Day ${note.deduction_day})` : 'Once-off'}</span>
                    <span>Agent: {note.agent_name}</span>
                  </div>

                  {/* Progress bar for collection */}
                  {Number(note.amount) > 0 && (
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-primary rounded-full h-1.5 transition-all"
                        style={{ width: `${Math.min(100, (Number(note.total_collected) / Number(note.amount)) * 100)}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedNote} onOpenChange={(open) => { if (!open) setSelectedNote(null); }}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Promissory Note Details
            </SheetTitle>
          </SheetHeader>
          {selectedNote && (() => {
            const config = statusConfig[selectedNote.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const outstanding = Number(selectedNote.amount) - Number(selectedNote.total_collected);
            const progress = Number(selectedNote.amount) > 0 ? Math.min(100, (Number(selectedNote.total_collected) / Number(selectedNote.amount)) * 100) : 0;

            return (
              <div className="space-y-4 mt-4 overflow-y-auto max-h-[calc(85vh-80px)] pb-6">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={cn('text-xs', config.color)}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(selectedNote.created_at), 'dd MMM yyyy HH:mm')}
                  </span>
                </div>

                {/* Partner Info */}
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Partner</p>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{selectedNote.partner_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>{selectedNote.whatsapp_number}</span>
                    </div>
                    {selectedNote.phone_number && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{selectedNote.phone_number}</span>
                      </div>
                    )}
                    {(selectedNote.partner_address || selectedNote.agent_address) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{selectedNote.partner_address || selectedNote.agent_address}</span>
                      </div>
                    )}
                    {selectedNote.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span>{selectedNote.email}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Financial Summary */}
                <Card>
                  <CardContent className="p-3 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Financial</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Promised</p>
                        <p className="font-bold text-sm"><CompactAmount value={Number(selectedNote.amount)} /></p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Collected</p>
                        <p className="font-bold text-sm text-emerald-600"><CompactAmount value={Number(selectedNote.total_collected)} /></p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Outstanding</p>
                        <p className="font-bold text-sm text-primary"><CompactAmount value={outstanding} /></p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Progress</span>
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Schedule & Agent */}
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Details</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-medium capitalize">{selectedNote.contribution_type}</p>
                      </div>
                      {selectedNote.deduction_day && (
                        <div>
                          <p className="text-xs text-muted-foreground">Deduction Day</p>
                          <p className="font-medium">Day {selectedNote.deduction_day}</p>
                        </div>
                      )}
                      {selectedNote.next_deduction_date && (
                        <div>
                          <p className="text-xs text-muted-foreground">Next Deduction</p>
                          <p className="font-medium">{format(new Date(selectedNote.next_deduction_date), 'dd MMM yyyy')}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">Agent</p>
                        <p className="font-medium">{selectedNote.agent_name}</p>
                        {selectedNote.agent_phone && <p className="text-xs text-muted-foreground">{selectedNote.agent_phone}</p>}
                      </div>
                    </div>
                    {selectedNote.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">Notes</p>
                        <p className="text-sm">{selectedNote.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Danger zone: delete with audit trail */}
                <div className="flex gap-2">
                  {!selectedNote.approval_bonus_paid ? (
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => { setApproveReason(''); setApproveTarget(selectedNote); }}
                    >
                      <BadgeCheck className="h-4 w-4 mr-2" />
                      Approve & Pay UGX 1,500
                    </Button>
                  ) : (
                    <Button className="flex-1" variant="outline" disabled>
                      <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />
                      Approved
                    </Button>
                  )}
                  {selectedNote.approval_bonus_paid && canReverseBonus && (
                    <Button
                      variant="outline"
                      className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => { setRejectReason(''); setRejectTarget(selectedNote); }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject & Reverse Bonus
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => { setDeleteReason(''); setDeleteTarget(selectedNote); }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Promissory Note
                  </Button>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation with mandatory reason */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(null); setDeleteReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete promissory note?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.partner_name}'s promissory note. A reason is required and this action is recorded in the audit trail against your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-reason">Reason for deletion (min 10 characters)</Label>
            <Textarea
              id="delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Duplicate entry created in error by agent"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting || deleteReason.trim().length < 10}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete & Log'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve confirmation with mandatory reason */}
      <AlertDialog open={!!approveTarget} onOpenChange={(open) => { if (!open && !approving) { setApproveTarget(null); setApproveReason(''); setSelectedLead(null); setLeadSearch(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve promissory note?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks {approveTarget?.partner_name}'s promissory note as verified and credits UGX 1,500 to {approveTarget?.agent_name}'s wallet. A reason is required and this action is recorded in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-lead">Lead partner growth (optional)</Label>
            {selectedLead ? (
              <div className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div>
                  <p className="text-sm font-medium">{selectedLead.display_name}</p>
                  {selectedLead.position_title && (
                    <p className="text-xs text-muted-foreground">{selectedLead.position_title}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedLead(null); setLeadSearch(''); }}>Clear</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  id="approve-lead"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Search enrolled employees by name"
                />
                {leadSearch.trim().length >= 2 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
                    {leadLoading && <p className="p-2 text-xs text-muted-foreground">Searching…</p>}
                    {!leadLoading && leadCandidates.length === 0 && (
                      <p className="p-2 text-xs text-muted-foreground">No enrolled employees match that search.</p>
                    )}
                    {leadCandidates.map((c: any) => (
                      <button
                        key={c.user_id}
                        type="button"
                        className="w-full px-2 py-1.5 text-left hover:bg-muted"
                        onClick={() => setSelectedLead(c)}
                      >
                        <span className="block text-sm font-medium">{c.display_name}</span>
                        {c.position_title && (
                          <span className="block text-xs text-muted-foreground">{c.position_title}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to approve without a lead. The agent is still paid; no override is paid to anyone.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="approve-reason">Reason for approval (min 20 characters)</Label>
            <Textarea
              id="approve-reason"
              value={approveReason}
              onChange={(e) => setApproveReason(e.target.value)}
              placeholder="e.g. Verified partner details and confirmed the signed promissory note document"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleApprove(); }}
              disabled={approving || approveReason.trim().length < 20}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {approving ? 'Approving…' : 'Approve & Pay'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject an already-approved note and reverse the paid bonus */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(open) => { if (!open && !rejecting) { setRejectTarget(null); setRejectReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject approved promissory note?</AlertDialogTitle>
            <AlertDialogDescription>
              This reverses the approval of {rejectTarget?.partner_name}'s promissory note. A reason of at least 20 characters is required and this action is recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-destructive">
              This reverses the bonus already paid. Money will be debited from the agent's wallet, and from the lead's wallet where an override was paid. If a wallet is short, the balance becomes recoverable arrears.
            </p>
            <Label htmlFor="reject-reason">Reason for rejection (min 20 characters)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Promissory note document could not be verified with the partner on follow-up"
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground text-right">{rejectReason.trim().length}/20 characters</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleReverseBonus(); }}
              disabled={rejecting || rejectReason.trim().length < 20}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rejecting ? 'Reversing…' : 'Reject & Reverse'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
