import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import DepartmentBudgetSubmission from '@/components/budget/DepartmentBudgetSubmission';

export default function DepartmentBudgets() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-24">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Department Budgets</h1>
          <p className="text-xs text-muted-foreground">
            Prepare your department budget against the company chart of accounts and submit it for CFO approval.
          </p>
        </div>
      </header>
      <DepartmentBudgetSubmission />
    </main>
  );
}