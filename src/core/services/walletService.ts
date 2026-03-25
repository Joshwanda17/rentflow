/**
 * Wallet Service (Phase 1 — Scaffold Only, Read-Only)
 * 
 * Provides read-only wallet/balance computation from ledger entries.
 * Balances are NEVER stored directly — always derived from the ledger.
 * 
 * Currently NOT connected to any data source.
 * Future phases will wire this to the ledger tables behind feature flags.
 */

import type { LedgerEntry } from './transactionService';

export interface WalletBalance {
  accountId: string;
  currency: string;
  balance: number;
  lastEntryAt: string | null;
}

export interface WalletSummary {
  accountId: string;
  balances: WalletBalance[];
  totalCredits: number;
  totalDebits: number;
}

export const WalletService = {
  /**
   * Compute balance from ledger entries for a given account.
   * Pure derivation — no stored balances, no side effects.
   */
  computeBalance(accountId: string, entries: LedgerEntry[]): WalletBalance {
    const accountEntries = entries.filter((e) => e.accountId === accountId);

    let balance = 0;
    let lastEntryAt: string | null = null;
    const currency = accountEntries[0]?.currency ?? 'UGX';

    for (const entry of accountEntries) {
      balance += entry.entryType === 'credit' ? entry.amount : -entry.amount;
      if (entry.createdAt && (!lastEntryAt || entry.createdAt > lastEntryAt)) {
        lastEntryAt = entry.createdAt;
      }
    }

    return { accountId, currency, balance, lastEntryAt };
  },

  /**
   * Build a full wallet summary for an account.
   * Pure derivation from ledger entries.
   */
  computeSummary(accountId: string, entries: LedgerEntry[]): WalletSummary {
    const accountEntries = entries.filter((e) => e.accountId === accountId);

    const totalCredits = accountEntries
      .filter((e) => e.entryType === 'credit')
      .reduce((sum, e) => sum + e.amount, 0);

    const totalDebits = accountEntries
      .filter((e) => e.entryType === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);

    const balance = this.computeBalance(accountId, entries);

    return {
      accountId,
      balances: [balance],
      totalCredits,
      totalDebits,
    };
  },

  /**
   * Check if an account has sufficient balance for a given amount.
   * Read-only check — no mutations.
   */
  hasSufficientBalance(accountId: string, entries: LedgerEntry[], amount: number): boolean {
    const { balance } = this.computeBalance(accountId, entries);
    return balance >= amount;
  },
};
