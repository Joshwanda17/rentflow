import { useEffect, useState } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import BudgetReviewQueue from '@/components/budget/BudgetReviewQueue';
import { useBudgetCycles } from '@/hooks/useDepartmentBudgets';

/**
 * COO review stage for department budgets, scoped server-side to Tenant Ops,
 * Agent Ops, Landlord Ops and Partner Ops. Approval forwards the submission to
 * the CFO queue; a rejection or revision request returns it to the department.
 */
export default function COODepartmentBudgets() {
  const { cycles } = useBudgetCycles();
  const [cycleId, setCycleId] = useState('all');

  useEffect(() => { if (cycleId === 'all' && cycles.length) setCycleId(cycles[0].id); }, [cycles, cycleId]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Select value={cycleId} onValueChange={setCycleId}>
          <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue placeholder="Budget cycle" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="all">All budget cycles</SelectItem>
            {cycles.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}{c.financial_year ? ` · ${c.financial_year}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <BudgetReviewQueue cycleId={cycleId === 'all' ? null : cycleId} stage="coo" />
    </div>
  );
}
