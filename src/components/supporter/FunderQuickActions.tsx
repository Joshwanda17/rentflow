import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowDownLeft, ArrowUpRight, Send } from 'lucide-react';
import DepositFlow from '@/components/payments/DepositFlow';
import WithdrawFlow from '@/components/payments/WithdrawFlow';
import { SendMoneyDialog } from '@/components/wallet/SendMoneyDialog';
import { hapticTap } from '@/lib/haptics';

/**
 * Funder-only wallet actions: Deposit, Withdraw, Transfer.
 *
 * Wired strictly to the existing flows:
 *  - DepositFlow with `personal_deposit` purpose → funds land in the
 *    funder's withdrawable bucket (recipient_type=`user` per WALLET
 *    ROUTING v2), so they are immediately usable + withdrawable.
 *  - WithdrawFlow → goes through the strict ledger-backed
 *    `get_user_available_balance` gate, like every other role.
 *  - SendMoneyDialog → wallet-to-wallet transfer.
 *
 * This component MUST be rendered behind a `role === 'supporter'` (a.k.a.
 * Funder) gate by the caller; it does not gate itself.
 */
interface Props {
  availableBalance: number;
  roiBalance?: number;
  /** Called after any flow closes so caller can refresh wallet caches. */
  onChanged?: () => void;
}

export function FunderQuickActions({ availableBalance, roiBalance = 0, onChanged }: Props) {
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const handleClose = (setter: (v: boolean) => void) => (open: boolean) => {
    setter(open);
    if (!open) onChanged?.();
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="gap-2 h-11"
          onClick={() => { hapticTap(); setShowDeposit(true); }}
        >
          <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold">Deposit</span>
        </Button>
        <Button
          variant="outline"
          className="gap-2 h-11"
          onClick={() => { hapticTap(); setShowWithdraw(true); }}
        >
          <ArrowUpRight className="w-4 h-4 text-rose-600" />
          <span className="font-semibold">Withdraw</span>
        </Button>
        <Button
          variant="outline"
          className="gap-2 h-11"
          onClick={() => { hapticTap(); setShowTransfer(true); }}
        >
          <Send className="w-4 h-4 text-primary" />
          <span className="font-semibold">Transfer</span>
        </Button>
      </div>

      <DepositFlow
        open={showDeposit}
        onOpenChange={handleClose(setShowDeposit)}
        walletBalance={availableBalance}
        allowedPurposes={['personal_deposit']}
        defaultPurpose="personal_deposit"
        lockPurpose
      />
      <WithdrawFlow
        open={showWithdraw}
        onOpenChange={handleClose(setShowWithdraw)}
        availableBalance={availableBalance}
        roiBalance={roiBalance}
        onSuccess={() => { setShowWithdraw(false); onChanged?.(); }}
      />
      <SendMoneyDialog
        open={showTransfer}
        onOpenChange={handleClose(setShowTransfer)}
      />
    </>
  );
}

export default FunderQuickActions;