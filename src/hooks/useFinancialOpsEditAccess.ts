import { useAuth } from '@/hooks/useAuth';

/**
 * Merchant balance corrections ("Fix balance") are a Financial Ops–only power.
 * This hook drives read-only UI ONLY. Enforcement lives in the database:
 * every write path goes through a `finops_*` gateway function that re-checks
 * the role, logs unauthorized attempts (name, phone, role, IP, device) and
 * fires an immediate security notification.
 */
export function useFinancialOpsEditAccess() {
  const { roles } = useAuth();
  const canEdit = Array.isArray(roles) && roles.includes('financial_ops' as any);
  return {
    canEdit,
    readOnlyReason:
      'Read-only: only the Financial Ops role can change merchant balances. Attempts are logged and reported.',
  };
}