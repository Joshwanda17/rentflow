import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Banknote, CheckCircle2, Loader2, Building2, Clock, Smartphone,
  UserCheck, ArrowRight, Phone, CreditCard,
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

  const method = withdrawal.payout_method || 'cash';
  const isMoMo = ['mobile_money', 'mtn_mobile_money', 'airtel_money'].includes(method);
  const isBank = method === 'bank_transfer';
  const isCash = !isMoMo && !isBank;

  const borderColor = isBank ? 'border-l-blue-500' : isMoMo ? 'border-l-yellow-500' : 'border-l-green-600';
  const methodLabel = isBank ? 'Bank Transfer' : isMoMo ? 'Mobile Money' : 'Cash';
  const MethodIcon = isBank ? Building2 : isMoMo ? Smartphone : Banknote;

  const recipientName = withdrawal.profiles?.full_name || 'Unknown';
  const recipientPhone = withdrawal.profiles?.phone || '—';

  return (
    <Card className={`border-l-4 ${borderColor} ${isClaimedByOther && !readOnly ? 'opacity-50' : ''}`}>
      <CardContent className="p-3 space-y-2.5">
        {/* Header: Recipient + Amount */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-sm">{recipientName}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Phone className="h-3 w-3" />
              {recipientPhone}
            </div>
          </div>
          <div className="text-right">
            <p className="font-black text-lg text-primary">{formatUGX(withdrawal.amount)}</p>
            <Badge variant="outline" className="text-[9px] gap-1">
              <MethodIcon className="h-3 w-3" />
              {methodLabel}
            </Badge>
          </div>
        </div>

        {/* Recipient Payout Details */}
        <div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5 text-xs">
          <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <CreditCard className="h-3 w-3 inline mr-1" />
            Payout Details
          </p>
          {isBank && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{withdrawal.bank_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Account #</span><span className="font-mono font-bold">{withdrawal.bank_account_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Account Name</span><span className="font-medium">{withdrawal.bank_account_name || '—'}</span></div>
            </>
          )}
          {isMoMo && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="font-medium">{withdrawal.mobile_money_provider || method}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Number</span><span className="font-mono font-bold">{withdrawal.mobile_money_number || recipientPhone}</span></div>
              {withdrawal.mobile_money_name && (
                <div className="flex justify-between"><span className="text-muted-foreground">Name on MoMo</span><span className="font-medium">{withdrawal.mobile_money_name}</span></div>
              )}
            </>
          )}
          {isCash && (
            <div className="flex justify-between"><span className="text-muted-foreground">Contact</span><span className="font-mono font-bold">{recipientPhone}</span></div>
          )}
        </div>

        {/* Status + Time */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[9px]">{withdrawal.status?.replace(/_/g, ' ')}</Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(withdrawal.created_at), 'MMM d, HH:mm')}
          </span>
          {isClaimed && (
            <Badge className="text-[9px] bg-green-600 gap-1">
              <UserCheck className="h-3 w-3" />
              {readOnly ? 'Claimed' : 'Claimed by you'}
            </Badge>
          )}
          {isClaimedByOther && (
            <Badge variant="outline" className="text-[9px] text-muted-foreground">
              {readOnly ? 'Claimed by an agent' : 'Claimed by another agent'}
            </Badge>
          )}
          {readOnly && !isClaimed && !isClaimedByOther && (
            <Badge variant="outline" className="text-[9px]">Unclaimed</Badge>
          )}
        </div>

        {withdrawal.reason && (
          <p className="text-[10px] text-muted-foreground italic">"{withdrawal.reason}"</p>
        )}

        {/* Actions — hidden in readOnly */}
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
          <div className="space-y-2 pt-1 border-t border-border/50">
            <p className="text-[10px] font-semibold text-primary">
              <ArrowRight className="h-3 w-3 inline mr-1" />
              {isBank ? 'Enter bank transfer reference after depositing' : isMoMo ? 'Enter MoMo TID after sending' : 'Enter cash voucher / receipt number'}
            </p>
            <div className="flex gap-2">
              <Input
                placeholder={isBank ? 'Bank reference / TID...' : isMoMo ? 'MoMo Transaction ID...' : 'Cash voucher number...'}
                value={reference}
                onChange={e => setReference(e.target.value)}
                className="text-xs h-10 font-mono"
              />
              <Button
                className="h-10 gap-1 px-4"
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
    </Card>
  );
}
