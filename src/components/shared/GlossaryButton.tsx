import { useState } from 'react';
import { BookOpen, Search, X, Plus, Pencil, Trash2, EyeOff, Eye, Save, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface GlossaryTerm {
  id: string;
  term: string;
  category: string;
  short: string;
  example: string | null;
  also: string[];
  sort_order: number;
  is_active: boolean;
}

const CATEGORY_ORDER = [
  'Money',
  'Process',
  'Agent Ops',
  'Tenant',
  'Landlord',
  'Roles',
] as const;

const CATEGORIES: string[] = [...CATEGORY_ORDER];

interface GlossaryButtonProps {
  variant?: 'header' | 'inline' | 'menu';
  className?: string;
  label?: string;
}

/**
 * Glossary trigger + dialog. Drop anywhere — completely self-contained.
 * Use `variant="header"` for top bars, `variant="menu"` inside menu lists,
 * `variant="inline"` for normal page placement.
 */
export function GlossaryButton({ variant = 'inline', className, label = 'Glossary' }: GlossaryButtonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? GLOSSARY.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.short.toLowerCase().includes(q) ||
          (t.example?.toLowerCase().includes(q) ?? false),
      )
    : GLOSSARY;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    terms: filtered
      .filter((t) => t.category === cat)
      .sort((a, b) => a.term.localeCompare(b.term)),
  })).filter((g) => g.terms.length > 0);

  const trigger = (() => {
    if (variant === 'header') {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors whitespace-nowrap',
            className,
          )}
          title="Welile glossary — shared team vocabulary"
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      );
    }
    if (variant === 'menu') {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            className,
          )}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted transition-colors',
          className,
        )}
      >
        <BookOpen className="h-4 w-4" />
        {label}
      </button>
    );
  })();

  return (
    <>
      {trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Welile Glossary
            </DialogTitle>
            <DialogDescription>
              Shared vocabulary so the whole team — agents, ops, finance, execs — uses the same words for the same things.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a term (e.g., float, refill, advance)…"
                className="pl-9 pr-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5">
            {grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                No terms match "{query}". Try a different word.
              </p>
            ) : (
              grouped.map((g) => (
                <section key={g.category}>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    {g.category}
                  </h3>
                  <div className="space-y-2">
                    {g.terms.map((t) => (
                      <div
                        key={t.term}
                        className="rounded-xl border border-border bg-card/60 p-3"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm">{t.term}</h4>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {t.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                          {t.short}
                        </p>
                        {t.example && (
                          <p className="text-xs text-foreground/80 mt-2 pl-3 border-l-2 border-primary/40">
                            <span className="font-semibold">Example:</span> {t.example}
                          </p>
                        )}
                        {t.also && t.also.length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            See also: {t.also.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}

            <p className="text-[11px] text-muted-foreground text-center pt-2">
              Missing a term? Tell Ops and we'll add it here.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}