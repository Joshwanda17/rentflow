import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

interface MoveToFloatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Move-to-Float dialog (agents only).
 *
 * STRICT INTENT-ONLY COMPONENT — by design this component:
 *   • does NOT receive or read the wallet balance
 *   • does NOT validate sufficient funds (backend rejects with structured error)
 *   • does NOT compute, mutate, or refresh wallet state
 *   • does NOT decide routing — it just sends { amount } to the backend
 *
 * The wallet UI updates exclusively via the realtime `wallets` subscription
 * after the backend posts the balanced ledger pair.
 */
export default function MoveToFloatDialog({ open, onOpenChange }: MoveToFloatDialogProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter an amount", {
        description: "Type how much to move to operational float.",
      });
      return;
    }

    setSubmitting(true);
    const { error } = await invokeEdgeFunction("transfer-to-float", {
      body: { amount: parsed },
      errorTitle: "Could not move to float",
    });
    setSubmitting(false);

    if (error) return;

    toast.success("Moved to operational float", {
      description: "Your wallet will update in a moment.",
    });
    setAmount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Operational Float</DialogTitle>
          <DialogDescription>
            Send funds from your wallet to your operational float bucket so they
            can be used to pay landlords and tenants in the field.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground flex items-center gap-2">
            <span className="font-medium">Withdrawable</span>
            <ArrowRight className="h-4 w-4" />
            <span className="font-medium">Operational Float</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="float-amount">Amount (UGX)</Label>
            <Input
              id="float-amount"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
              min={1}
            />
            <p className="text-xs text-muted-foreground">
              The backend confirms your balance and posts the transfer. Your
              wallet updates automatically.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Move to Float
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
