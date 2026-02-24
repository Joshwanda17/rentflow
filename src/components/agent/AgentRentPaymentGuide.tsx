import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Wallet, ArrowRight, RefreshCw, UserSearch, BadgeCheck, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
  {
    icon: UserSearch,
    title: 'Search Tenant',
    desc: 'Tap "Pay Rent for Tenant" from the menu. Search by name or phone number.',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    icon: Wallet,
    title: 'Enter Amount',
    desc: 'See the tenant\'s outstanding balance and your wallet balance. Enter the amount to pay — it cannot exceed your balance.',
    color: 'text-success',
    bg: 'bg-success/10',
  },
  {
    icon: BadgeCheck,
    title: 'Instant Processing',
    desc: 'Money is deducted from your wallet, credited to the tenant, and auto-applied to their rent. You earn 5% commission.',
    color: 'text-warning',
    bg: 'bg-warning/10',
  },
  {
    icon: ShieldCheck,
    title: 'Receivables Updated',
    desc: 'The Receivables Statement updates immediately — "Collected" increases and "Net Outstanding" decreases.',
    color: 'text-success',
    bg: 'bg-success/10',
  },
];

export function AgentRentPaymentGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border border-primary/20 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left touch-manipulation"
      >
        <div className="p-2 rounded-lg bg-primary/10">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">How Rent Payments & Auto-Deductions Work</p>
          <p className="text-[11px] text-muted-foreground">Tap to learn the process</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <CardContent className="px-4 pb-4 pt-0 space-y-4">
              {/* Pay Rent Steps */}
              <div>
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-3">
                  Paying Rent for a Tenant
                </p>
                <div className="space-y-0">
                  {steps.map((step, i) => (
                    <div key={i} className="flex gap-3 relative">
                      {/* Connector line */}
                      {i < steps.length - 1 && (
                        <div className="absolute left-[17px] top-9 bottom-0 w-px bg-border" />
                      )}
                      <div className={`p-1.5 rounded-lg ${step.bg} shrink-0 z-10 h-fit`}>
                        <step.icon className={`h-4 w-4 ${step.color}`} />
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="font-semibold text-xs flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Step {i + 1}</span>
                          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                          {step.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-Deduction Section */}
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-warning" />
                  <p className="text-[10px] font-bold text-warning uppercase tracking-wider">Auto-Deduction System</p>
                </div>
                <div className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
                  <p>When a tenant's rent is facilitated, a <span className="font-semibold text-foreground">repayment schedule</span> is created with daily/weekly installments.</p>
                  <div className="space-y-1.5 pl-1">
                    <div className="flex gap-2">
                      <span className="text-success font-bold shrink-0">1.</span>
                      <span>System deducts installment from <span className="font-semibold text-foreground">tenant's wallet</span> first</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-warning font-bold shrink-0">2.</span>
                      <span>If tenant funds are low → <span className="font-semibold text-foreground">agent's wallet</span> covers the shortfall</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-destructive font-bold shrink-0">3.</span>
                      <span>If agent also low → shortfall recorded as <span className="font-semibold text-foreground">accumulated debt</span></span>
                    </div>
                  </div>
                  <p className="pt-1 border-t border-warning/20">
                    <span className="font-semibold text-foreground">No Smartphone tenants:</span> Auto-charge skips tenant wallet entirely — agent is charged directly for all installments.
                  </p>
                </div>
              </div>

              {/* Quick Summary */}
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Flow Summary</p>
                <div className="flex flex-wrap items-center gap-1 text-[10px] font-medium">
                  <span className="px-2 py-1 rounded-md bg-primary/10 text-primary">Agent collects cash</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="px-2 py-1 rounded-md bg-destructive/10 text-destructive">Wallet debited</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="px-2 py-1 rounded-md bg-success/10 text-success">Tenant credited</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="px-2 py-1 rounded-md bg-warning/10 text-warning">Rent auto-paid</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="px-2 py-1 rounded-md bg-success/10 text-success">5% commission</span>
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
