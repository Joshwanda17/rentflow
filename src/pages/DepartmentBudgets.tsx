import DepartmentBudgetSubmission from '@/components/budget/DepartmentBudgetSubmission';

export default function DepartmentBudgets() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-24">
      <header>
        <h1 className="text-lg font-semibold">Department Budgets</h1>
        <p className="text-xs text-muted-foreground">
          Prepare your department budget against the company chart of accounts and submit it for CFO approval.
        </p>
      </header>
      <DepartmentBudgetSubmission />
    </main>
  );
}