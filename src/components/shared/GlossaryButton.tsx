import { useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface GlossaryTerm {
  term: string;
  category: 'Money' | 'Agent Ops' | 'Tenant' | 'Landlord' | 'Roles' | 'Process';
  short: string;
  example?: string;
  also?: string[];
}

/**
 * Single source of truth for Welile vocabulary used by ops, agents and execs.
 * Keep entries SHORT and in plain English — this is what the team reads
 * during a stand-up, not technical docs.
 */
export const GLOSSARY: GlossaryTerm[] = [
  // --- Money ---
  {
    term: 'Float',
    category: 'Money',
    short:
      "An agent's permission to collect cash. Like airtime on a SIM — once it's used up, they can't collect more until it's refilled.",
    example: 'Agent has UGX 5,000,000 float → they can collect up to that much before depositing.',
    also: ['Float Limit', 'Refill', 'Cash on Hand'],
  },
  {
    term: 'Float Limit',
    category: 'Money',
    short:
      'The maximum amount of cash an agent is trusted to hold at one time. Set by Agent Ops.',
  },
  {
    term: 'Cash on Hand',
    category: 'Money',
    short:
      'The physical cash an agent is currently holding from collections that has not yet been deposited back to Welile.',
  },
  {
    term: 'Cash Collected',
    category: 'Money',
    short:
      'Money the agent has physically received from a tenant. The moment this is recorded, the float drops by the same amount.',
    example: 'Tenant pays UGX 200,000 → float drops by 200,000, cash on hand goes up by 200,000.',
  },
  {
    term: 'Deposit / Refill',
    category: 'Money',
    short:
      'When the agent returns cash to Welile (via merchant code, bank, or branch). Once Finance confirms it, their float is topped back up.',
    also: ['Float'],
  },
  {
    term: 'Withdrawable Balance',
    category: 'Money',
    short:
      'Money in a wallet the user can actually take out — earned commissions, refunds, or returned investments.',
  },
  {
    term: 'Advance Balance',
    category: 'Money',
    short:
      'Money lent to an agent against future earnings. Repaid automatically as commissions come in.',
  },
  {
    term: 'Wallet (3 Buckets)',
    category: 'Money',
    short:
      'Every wallet has three pockets: Withdrawable (cash out), Float (collect on behalf of Welile), and Advance (loaned). They never mix.',
  },
  {
    term: 'Commission',
    category: 'Money',
    short:
      'The percentage an agent earns on a successful collection or investment. Lands in the Withdrawable bucket.',
  },
  {
    term: 'Payout / Disbursement',
    category: 'Money',
    short:
      'Money moving OUT of Welile to a landlord or partner — usually via Mobile Money or via an agent delivering cash in person.',
  },

  // --- Process ---
  {
    term: 'Rent Request',
    category: 'Process',
    short:
      "A tenant's application to have Welile pay their landlord upfront so the tenant can repay in installments.",
  },
  {
    term: 'Rent Plan',
    category: 'Process',
    short:
      'The repayment schedule for a funded rent request — daily/weekly/monthly installments back to Welile.',
  },
  {
    term: 'Proxy Payout',
    category: 'Process',
    short:
      'When an agent physically delivers cash to a landlord on Welile\'s behalf instead of a Mobile Money transfer.',
  },
  {
    term: 'Reconciliation',
    category: 'Process',
    short:
      "End-of-day check: does what the agent says they collected match what's actually in their float and deposit slips?",
  },
  {
    term: 'OTP Verification',
    category: 'Process',
    short:
      'A one-time SMS code used to confirm a sensitive action (e.g., landlord confirming they received cash).',
  },

  // --- Roles ---
  {
    term: 'Agent',
    category: 'Roles',
    short:
      'A field representative who registers tenants/landlords, collects rent in cash, and delivers payouts.',
  },
  {
    term: 'Sub-Agent',
    category: 'Roles',
    short:
      'An agent recruited and managed by another agent. Earns their own commissions; the parent agent earns 1% override.',
  },
  {
    term: 'Proxy Agent',
    category: 'Roles',
    short:
      'An agent assigned to act on behalf of a partner (typically a non-smartphone user) for deposits and withdrawals.',
  },
  {
    term: 'Supporter / Funder',
    category: 'Roles',
    short:
      'A person who deposits money into Welile to fund tenant rent and earns monthly returns.',
  },
  {
    term: 'Partner',
    category: 'Roles',
    short:
      'A funder who works through an agent (often without their own smartphone). The agent manages their wallet on their behalf.',
  },

  // --- Tenant / Landlord ---
  {
    term: 'Tenant',
    category: 'Tenant',
    short:
      'The renter. Welile pays their rent upfront; they repay in installments.',
  },
  {
    term: 'Tenant Wallet',
    category: 'Tenant',
    short:
      "The tenant's account inside Welile. Auto-deductions for rent installments come from here first.",
  },
  {
    term: 'Auto-Deduction',
    category: 'Tenant',
    short:
      "When rent is due, the system pulls from the tenant's wallet first; if short, it falls back to the agent's wallet; if both are short, it's recorded as debt.",
  },
  {
    term: 'Landlord',
    category: 'Landlord',
    short:
      'The property owner who receives rent from Welile (Mobile Money or agent cash drop).',
  },
  {
    term: 'House Listing',
    category: 'Landlord',
    short:
      "A vacant property posted to Welile's marketplace. Agents earn UGX 5,000 per verified listing.",
  },

  // --- Agent Ops ---
  {
    term: 'Tracking ID',
    category: 'Agent Ops',
    short:
      'A unique receipt reference (e.g., WLE-2026-00123) generated for every payment, so tenant, agent and Finance can trace it.',
  },
  {
    term: 'Pending Sync',
    category: 'Agent Ops',
    short:
      "Payments recorded offline that haven't reached the server yet. They upload automatically once the agent has signal.",
  },
  {
    term: 'Streak',
    category: 'Agent Ops',
    short:
      'Consecutive days an agent has collected at least one payment. Longer streaks earn badges and bonus multipliers.',
  },
  {
    term: 'Trust Score',
    category: 'Agent Ops',
    short:
      "Welile's internal credit rating for a tenant or partner, based on payment history, supporters, and verified signals.",
  },
  {
    term: 'Escalation',
    category: 'Agent Ops',
    short:
      'A flagged issue from the field (missing tenant, refused payout, dispute) that needs Agent Ops to resolve.',
  },
];

const CATEGORY_ORDER: GlossaryTerm['category'][] = [
  'Money',
  'Process',
  'Agent Ops',
  'Tenant',
  'Landlord',
  'Roles',
];

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