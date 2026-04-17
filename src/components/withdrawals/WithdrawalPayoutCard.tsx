import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Banknote, CheckCircle2, Loader2, Building2, Clock, Smartphone,
  UserCheck, ArrowRight, Phone, CreditCard, ChevronDown,
} from 'lucide-react';

export interface WithdrawalPayoutCardProps {
  withdrawal: any;
  isClaimed?: boolean;
  isClaimedByOther?: boolean;
  onClaim?: () => void;
  onComplete?: (data: { id: string; reference: string; method: string }) => void;
  isClaimPending?: boolean;
  isCompletePending?: boolean;
  /** Read-only mode: hide Claim/Confirm actions (used by CFO viewer) */
  readOnly?: boolean;
}

export function WithdrawalPayoutCard({
  withdrawal,
  isClaimed = false,
  isClaimedByOther = false,
  onClaim,
  onComplete,
  isClaimPending = false,
  isCompletePending = false,
  readOnly = false,
}: WithdrawalPayoutCardProps) {
  const [reference, setReference] = useState('');
  const [open, setOpen] = useState(false);

  const method = withdrawal.payout_method || 'cash';
  const isMoMo = ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(method);
  const isBank = method === 'bank_transfer';
  const isCash = !isMoMo && !isBank;

  const methodLabel = isBank ? 'Bank Transfer' : isMoMo ? 'Mobile Money' : 'Cash';
  const MethodIcon = isBank ? Building2 : isMoMo ? Smartphone : Banknote;

  const recipientName = withdrawal.profiles?.full_name || 'Unknown';
  const recipientPhone = withdrawal.profiles?.phone || '—';

  return (
    <Card className={isClaimedByOther && !readOnly ? 'opacity-50' : ''}>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Collapsed header — name + amount */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded-t-lg"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{recipientName}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <Badge variant="secondary" className="text-[9px] gap-1 h-4 px-1.5">
                  <MethodIcon className="h-2.5 w-2.5" />
                  {methodLabel}
                </Badge>
                {isClaimed && !readOnly && (
                  <Badge className="text-[9px] h-4 px-1.5 bg-amber-500 text-white hover:bg-amber-500 gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    AWAITING PAYMENT
                  </Badge>
                )}
                {isClaimedByOther && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">
                    {readOnly ? 'Claimed' : 'Taken'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-bold text-base text-primary tabular-nums">{formatUGX(withdrawal.amount)}</p>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Expanded body */}
        <CollapsibleContent>
          <CardContent className="px-3 pb-3 pt-0 space-y-2.5">
            {/* Contact + status row */}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {recipientPhone}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(withdrawal.created_at), 'MMM d, HH:mm')}
              </span>
            </div>

            {/* Recipient Payout Details */}
            <div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5 text-xs">
              <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <CreditCard className="h-3 w-3 inline mr-1" />
                Payout Details
              </p>
              {isBank && (
                <>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Bank</span><span className="font-medium truncate">{withdrawal.bank_name || '—'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Account #</span><span className="font-mono font-bold truncate">{withdrawal.bank_account_number || '—'}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Account Name</span><span className="font-medium truncate text-right">{withdrawal.bank_account_name || '—'}</span></div>
                </>
              )}
              {isMoMo && (
                <>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Provider</span><span className="font-medium truncate">{withdrawal.mobile_money_provider || method}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Number</span><span className="font-mono font-bold truncate">{withdrawal.mobile_money_number || recipientPhone}</span></div>
                  {withdrawal.mobile_money_name && (
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Name on MoMo</span><span className="font-medium truncate text-right">{withdrawal.mobile_money_name}</span></div>
                  )}
                </>
              )}
              {isCash && (
                <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Contact</span><span className="font-mono font-bold truncate">{recipientPhone}</span></div>
              )}
            </div>

            {/* Status pill */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[9px]">{withdrawal.status?.replace(/_/g, ' ')}</Badge>
              {readOnly && !isClaimed && !isClaimedByOther && (
                <Badge variant="outline" className="text-[9px]">Unclaimed</Badge>
              )}
            </div>

            {withdrawal.reason && (
              <p className="text-[10px] text-muted-foreground italic break-words">"{withdrawal.reason}"</p>
            )}

            {/* Actions */}
            {readOnly ? null : isClaimedByOther ? null : !isClaimed ? (
              <Button
                className="w-full h-10 gap-2 font-semibold"
                variant="outline"
                onClick={onClaim}
                disabled={isClaimPending}
              >
                {isClaimPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserCheck className="h-4 w-4" /> Claim This Withdrawal</>}
              </Button>
            ) : (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-[10px] font-semibold text-primary flex items-start gap-1">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{isBank ? 'Enter bank transfer reference after depositing' : isMoMo ? 'Enter MoMo TID after sending' : 'Enter cash voucher / receipt number'}</span>
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder={isBank ? 'Bank reference / TID...' : isMoMo ? 'MoMo Transaction ID...' : 'Cash voucher number...'}
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="text-xs h-10 font-mono flex-1 min-w-0"
                  />
                  <Button
                    className="h-10 gap-1 px-4 sm:w-auto w-full"
                    disabled={!reference.trim() || reference.trim().length < 3 || isCompletePending}
                    onClick={() => onComplete?.({ id: withdrawal.id, reference, method: methodLabel })}
                  >
                    {isCompletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Confirm Paid
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
