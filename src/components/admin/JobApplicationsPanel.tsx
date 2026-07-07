import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, MessageCircle, Mail, RefreshCw, MapPin, Link2, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface JobApplication {
  id: string;
  full_name: string;
  whatsapp_number: string;
  email: string | null;
  category: string;
  role_interest: string | null;
  experience_level: string | null;
  portfolio_url: string | null;
  location: string | null;
  cover_note: string | null;
  status: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  developer: 'Developer',
  sales: 'Sales',
  marketing: 'Marketing',
  operations: 'Operations',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  developer: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  sales: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  marketing: 'bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/30',
  operations: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  other: 'bg-muted text-muted-foreground border-border',
};

function waLink(num: string) {
  const digits = num.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}`;
}

export default function JobApplicationsPanel() {
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from('job_applications' as any) as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('Error fetching job applications:', error);
    } else {
      setApps((data || []) as JobApplication[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const markContacted = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from('job_applications' as any) as any)
      .update({ status: 'contacted', contacted_by: user?.id ?? null, contacted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('Could not update', { description: error.message });
      return;
    }
    toast.success('Marked as contacted');
    setApps(prev => prev.map(a => a.id === id ? { ...a, status: 'contacted' } : a));
  };

  const newCount = apps.filter(a => a.status === 'new').length;

  return (
    <div className="mb-6 rounded-2xl border-2 border-primary/30 bg-primary/5 overflow-hidden no-print">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-primary/20 bg-primary/10">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
          <Briefcase className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">Job Applications</h2>
            {newCount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground border-0 text-[10px]">
                {newCount} NEW · Priority
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Contact applicants via WhatsApp or email (info@welile.com)</p>
        </div>
        <button onClick={fetchApps} className="p-2 rounded-lg hover:bg-primary/10 transition-colors">
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-8">
            <Briefcase className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No applications yet</p>
            <p className="text-xs text-muted-foreground">Applications from /careers will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {apps.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{a.full_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge variant="outline" className={cn('text-[10px]', CATEGORY_COLORS[a.category] || CATEGORY_COLORS.other)}>
                        {CATEGORY_LABELS[a.category] || a.category}
                      </Badge>
                      {a.role_interest && <span className="text-[11px] text-muted-foreground truncate">{a.role_interest}</span>}
                    </div>
                  </div>
                  {a.status === 'contacted' ? (
                    <Badge variant="outline" className="text-[10px] border-success/40 text-success gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> Contacted
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-warning/40 text-warning gap-1 shrink-0">
                      <Clock className="h-3 w-3" /> New
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {a.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.location}</span>}
                  {a.experience_level && <span>Experience: {a.experience_level}</span>}
                  {a.portfolio_url && (
                    <a href={a.portfolio_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline truncate">
                      <Link2 className="h-3 w-3 shrink-0" /> {a.portfolio_url}
                    </a>
                  )}
                  {a.cover_note && <p className="text-[11px] leading-snug line-clamp-3 text-foreground/80">{a.cover_note}</p>}
                  <span className="text-[10px]">Applied {format(new Date(a.created_at), 'dd MMM yyyy, HH:mm')}</span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10">
                    <a href={waLink(a.whatsapp_number)} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" /> {a.whatsapp_number}
                    </a>
                  </Button>
                  {a.email && (
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                      <a href={`mailto:${a.email}?cc=info@welile.com`}>
                        <Mail className="h-3.5 w-3.5" /> Email
                      </a>
                    </Button>
                  )}
                  {a.status !== 'contacted' && (
                    <Button size="sm" className="h-8 gap-1.5" onClick={() => markContacted(a.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark contacted
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
