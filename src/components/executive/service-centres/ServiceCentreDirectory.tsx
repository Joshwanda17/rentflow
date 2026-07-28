import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, ExternalLink, Loader2, MapPin, Phone, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useServiceCentres, SC_STATUS_META, mapsUrl, type ServiceCentreStatus } from '@/hooks/useServiceCentres';

const FILTERS: ('all' | ServiceCentreStatus)[] = ['all', 'pending', 'verified', 'paid', 'rejected'];

/** Searchable register of every Service Centre with photo, GPS and status. */
export function ServiceCentreDirectory() {
  const { data: centres, isLoading } = useServiceCentres();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | ServiceCentreStatus>('all');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (centres || []).filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!term) return true;
      return [c.agent_name, c.agent_phone, c.location_name].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [centres, q, filter]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-primary" />
          Service Centre Directory
          <span className="ml-auto text-xs font-normal text-muted-foreground">{rows.length} shown</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agent, phone or location" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} className="h-7 text-xs capitalize" onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : SC_STATUS_META[f].label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No service centres match this view.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <div key={c.id} className="rounded-xl border border-border overflow-hidden bg-card">
                <img src={c.photo_url} alt={`Service centre run by ${c.agent_name}`} loading="lazy" className="h-32 w-full object-cover" />
                <div className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{c.agent_name}</p>
                    <Badge variant="outline" className={cn('text-[10px] shrink-0 border-0', SC_STATUS_META[c.status].className)}>
                      {SC_STATUS_META[c.status].label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{c.agent_phone || '—'}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{c.location_name || 'No description'}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'dd MMM yyyy')}</span>
                    <a href={mapsUrl(c.latitude, c.longitude)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      <MapPin className="h-3 w-3" />Map<ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {c.rejection_reason && <p className="text-[11px] text-destructive">{c.rejection_reason}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
