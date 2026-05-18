import { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Clock, CheckCircle2, XCircle, Wallet, ChevronDown, ChevronUp, Target, Pencil, BadgeCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { isAutoCancelledDuplicate } from '@/lib/depositDuplicateDetection';
import {
  DepositAutoMatchAudit,
  type DepositAutoMatchAuditPayload,
} from '@/components/wallet/DepositAutoMatchAudit';

// Lazy — DepositFlow pulls a heavy form tree we don't want on first paint
// of every wallet view; the edit button only opens it on demand.
const DepositFlow = lazy(() => import('@/components/payments/DepositFlow'));

interface DepositRequest {
  id: string;
  agent_id: string;
  amount: number;
  status: string;
  created_at: string;
  rejection_reason?: string;
  agent_name?: string;
  notes?: string;
  deposit_purpose?: string | null;
  purpose_audit?: { chosen_purpose?: string } | null;
  auto_match_audit?: DepositAutoMatchAuditPayload | null;
}

const PURPOSE_LABELS: Record<string, string> = {
  operational_float: 'Operational Float',
  personal_deposit: 'Personal Deposit',
  partnership_deposit: 'Supporter Wallet Top-Up',
  personal_rent_repayment: 'Personal Rent Repayment',
  other: 'Other',
};

const purposeBadgeClass = (p: string | null | undefined) => {
  switch (p) {
    case 'operational_float':
      return 'bg-primary/15 text-primary border-primary/30';
    case 'personal_deposit':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
    case 'partnership_deposit':
      return 'bg-violet-500/15 text-violet-700 border-violet-500/30';
    case 'personal_rent_repayment':
      return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

export function UserDepositRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const fetchRequests = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        const agentIds = [...new Set(data.map(d => d.agent_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', agentIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        const enrichedRequests = data.map((d: any) => ({
          ...d,
          agent_name: profileMap.get(d.agent_id) || 'Agent',
        })) as DepositRequest[];

        setRequests(enrichedRequests);
      } else {
        setRequests([]);
      }
    } catch (error) {
      console.error('Error fetching deposit requests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Realtime removed — deposit_requests not in realtime whitelist
  }, [user]);

  // After an edit closes, refresh the list so the agent sees the new
  // amount / allocation summary immediately.
  const handleEditClose = (open: boolean) => {
    if (!open) {
      setEditingId(null);
      fetchRequests();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (req: DepositRequest) => {
    if (isAutoCancelledDuplicate(req)) {
      return (
        <span>
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
          >
            <BadgeCheck className="h-3 w-3 mr-1" />
            Already credited
          </Badge>
        </span>
      );
    }
    switch (req.status) {
      case 'approved':
        return <span><Badge variant="default" className="bg-success/10 text-success border-success/20">Approved</Badge></span>;
      case 'rejected':
        return <span><Badge variant="destructive">Rejected</Badge></span>;
      default:
        return <span><Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending</Badge></span>;
    }
  };

  if (loading) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="w-full justify-between text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Loading deposit requests...
        </span>
      </Button>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  // True rejections only — auto-cancelled duplicates are NOT failures; they
  // mean the depositor was already credited from their mobile-money
  // receipt, so they don't warrant the red "rejected" highlight.
  const rejectedCount = requests.filter(
    (r) => r.status === 'rejected' && !isAutoCancelledDuplicate(r),
  ).length;

  return (
    <>
    <Collapsible
      open={isOpen || rejectedCount > 0}
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`w-full justify-between hover:bg-muted/50 ${rejectedCount > 0 ? 'bg-destructive/5' : ''}`}
        >
          <span className="flex items-center gap-2">
            <Wallet className={`h-4 w-4 ${rejectedCount > 0 ? 'text-destructive' : 'text-primary'}`} />
            <span className="text-sm font-medium">Deposit Requests</span>
            {rejectedCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {rejectedCount} rejected
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 text-xs">
                {pendingCount} pending
              </Badge>
            )}
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardContent className="p-3 space-y-2">
            <AnimatePresence mode="popLayout">
              {requests.map((request) => (
                <motion.div
                  key={request.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  className="p-3 rounded-lg border bg-card/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isAutoCancelledDuplicate(request) ? (
                        <BadgeCheck className="h-4 w-4 text-emerald-600" />
                      ) : (
                        getStatusIcon(request.status)
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {formatCurrency(request.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          via {request.agent_name}
                        </p>
                        {(() => {
                          const p = request.purpose_audit?.chosen_purpose ?? request.deposit_purpose ?? null;
                          if (!p) return null;
                          return (
                            <Badge
                              variant="outline"
                              className={`mt-1 text-[10px] px-1.5 py-0 h-4 ${purposeBadgeClass(p)}`}
                            >
                              <Target className="h-2.5 w-2.5 mr-0.5" />
                              {PURPOSE_LABELS[p] ?? p}
                            </Badge>
                          );
                        })()}
                        {request.notes && (
                          <p className="text-xs text-muted-foreground italic">
                            "{request.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(request)}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {isAutoCancelledDuplicate(request) ? (
                    <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800">
                      <p className="font-medium flex items-center gap-1">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        No duplicate created
                      </p>
                      <p className="mt-0.5 text-emerald-700/90">
                        {request.rejection_reason}
                      </p>
                    </div>
                  ) : request.status === 'rejected' && request.rejection_reason && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                        Reason: {request.rejection_reason}
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditingId(request.id)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Fix details & resubmit
                      </Button>
                    </div>
                  )}
                      {request.status === 'pending' &&
                        (request.deposit_purpose === 'operational_float' ||
                          request.purpose_audit?.chosen_purpose === 'operational_float') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 text-xs"
                            onClick={() => setEditingId(request.id)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit allocations
                          </Button>
                        )}
                  <DepositAutoMatchAudit audit={request.auto_match_audit} />
                </motion.div>
              ))}
            </AnimatePresence>
          </CardContent>
        </Card>
      </CollapsibleContent>
        </Collapsible>

        {editingId && (
          <Suspense fallback={null}>
            <DepositFlow
              open={!!editingId}
              onOpenChange={handleEditClose}
              editRequestId={editingId}
            />
          </Suspense>
        )}
      </>
  );
}