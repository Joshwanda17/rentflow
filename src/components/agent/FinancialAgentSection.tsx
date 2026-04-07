import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Banknote } from 'lucide-react';
import { AgentRequisitionForm } from '@/components/financial-ops/AgentRequisitionForm';

interface FinancialAgentSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FinancialAgentSection({ open, onOpenChange }: FinancialAgentSectionProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Fund Requisition
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
              Financial Agent
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-4">
          <p className="text-xs text-muted-foreground">
            You are a <span className="font-semibold text-primary">Financial Agent</span> — submit fund requisitions below for CFO approval.
          </p>
        </div>
        <AgentRequisitionForm />
      </SheetContent>
    </Sheet>
  );
}
