/**
 * Transaction Service (Phase 1 — Scaffold Only)
 * 
 * This service will handle all transaction-related business logic.
 * Currently NOT integrated with any existing flows.
 * 
 * Future phases will wire this behind the feature flag system
 * (see FeatureFlagsContext.tsx).
 * 
 * Design principles:
 * - Append-only ledger entries (no direct balance edits)
 * - Every transaction produces debit + credit entries
 * - Corrections via reversing entries only
 */

export interface LedgerEntry {
  id?: string;
  transactionId: string;
  accountId: string;
  entryType: 'debit' | 'credit';
  amount: number;
  currency: string;
  description: string;
  createdAt?: string;
}

export interface TransactionRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  entries?: LedgerEntry[];
  error?: string;
}

export const TransactionService = {
  /**
   * Validate a transaction request before processing.
   * Pure logic — no side effects.
   */
  validateRequest(request: TransactionRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.fromAccountId) errors.push('Source account is required');
    if (!request.toAccountId) errors.push('Destination account is required');
    if (request.fromAccountId === request.toAccountId) {
      errors.push('Source and destination accounts must differ');
    }
    if (!request.amount || request.amount <= 0) {
      errors.push('Amount must be a positive number');
    }
    if (!request.currency) errors.push('Currency is required');
    if (!request.description) errors.push('Description is required');

    return { valid: errors.length === 0, errors };
  },

  /**
   * Build double-entry ledger entries for a transaction.
   * Pure logic — does NOT persist. Persistence will be added in a future phase.
   */
  buildLedgerEntries(transactionId: string, request: TransactionRequest): LedgerEntry[] {
    return [
      {
        transactionId,
        accountId: request.fromAccountId,
        entryType: 'debit',
        amount: request.amount,
        currency: request.currency,
        description: request.description,
      },
      {
        transactionId,
        accountId: request.toAccountId,
        entryType: 'credit',
        amount: request.amount,
        currency: request.currency,
        description: request.description,
      },
    ];
  },

  /**
   * Build reversing entries for a correction.
   * Corrections are NEVER edits — always new reversing entries.
   */
  buildReversalEntries(
    reversalTransactionId: string,
    originalEntries: LedgerEntry[],
    reason: string
  ): LedgerEntry[] {
    return originalEntries.map((entry) => ({
      transactionId: reversalTransactionId,
      accountId: entry.accountId,
      entryType: entry.entryType === 'debit' ? 'credit' as const : 'debit' as const,
      amount: entry.amount,
      currency: entry.currency,
      description: `REVERSAL: ${reason} (orig: ${entry.transactionId})`,
    }));
  },
};
