import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Search, User, Phone, Calendar, TrendingUp, CheckCircle, Clock, AlertTriangle, XCircle, Mail, MessageCircle, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CompactAmount } from '@/components/ui/CompactAmount';

export function PromissoryNotesQueue() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedNote, setSelectedNote] = useState<any>(null);

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
      const agentIds = [...new Set(data.map(n => n.agent_id))];
      const { data: agents } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', agentIds);

      const agentMap = new Map(agents?.map(a => [a.id, a]) || []);

      return data.map(note => ({
        ...note,
        agent_name: agentMap.get(note.agent_id)?.full_name || 'Unknown Agent',
        agent_phone: agentMap.get(note.agent_id)?.phone || '',
      }));
    },
  });

  const filtered = notes.filter(n => {
    const matchesSearch = !search || 
      n.partner_name.toLowerCase().includes(search.toLowerCase()) ||
      n.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
      n.whatsapp_number.includes(search);
    const matchesStatus = statusFilter === 'all' || n.status === statusFilter;
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
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, agent, or phone..." className="pl-9" />
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
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
