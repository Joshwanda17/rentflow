import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// E2E test for the 2-minute cash-deposit receipt-code expiry.
// Part A (frontend): the code input stays enabled until the countdown hits
//   zero, then disables at exactly 120s and surfaces the auto-rejection notice.
// Part B (backend contract): the shared verification core (the exact decision
//   logic the verify-code edge function runs) reports `expired` once the
//   window passes, and the atomic claim refuses to credit — i.e. the deposit
//   is auto-rejected, never credited, after the timer runs out.

// ── Mocks ──────────────────────────────────────────────────────────────────
const supaState = vi.hoisted(() => ({
  invoke: vi.fn(async (_fn: string, _opts: any) => ({
    data: { ok: true, deposit_request_id: 'dep-1' },
    error: null,
  })),
}));
const toastState = vi.hoisted(() => ({
  error: vi.fn(), success: vi.fn(), info: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: supaState.invoke } },
}));
vi.mock('sonner', () => ({ toast: toastState }));

import CashWithFinancialOpsDeposit from '../CashWithFinancialOpsDeposit';
import {
  evaluateAttempt,
  VerificationStore,
  type VerificationRecord,
} from '../../../../supabase/functions/_shared/cash-verification-core';

const CODE_TTL_SECONDS = 120;

beforeEach(() => {
  vi.useFakeTimers();
  supaState.invoke.mockClear();
  toastState.error.mockClear();
  toastState.success.mockClear();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('Cash deposit 2-minute code expiry — end to end', () => {
  it('keeps the code input enabled until the countdown hits zero, then disables it exactly at 120s', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CashWithFinancialOpsDeposit open onOpenChange={() => {}} />);

    // Enter an amount and request the code.
    await user.type(screen.getByPlaceholderText('0'), '50000');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send deposit request/i }));
    });

    // We are now on the code step; the input is present and enabled.
    const codeInput = await screen.findByPlaceholderText('e.g. 1234');
    expect(codeInput).toBeEnabled();
    expect(screen.getByText(/the deposit is auto-rejected/i)).toBeInTheDocument();

    // Advance to 1 second before expiry — still enabled.
    act(() => { vi.advanceTimersByTime((CODE_TTL_SECONDS - 1) * 1000); });
    expect(codeInput).toBeEnabled();

    // Cross the 2-minute boundary — input must disable exactly at zero.
    act(() => { vi.advanceTimersByTime(1000); });
    await waitFor(() => expect(codeInput).toBeDisabled());
    expect(
      screen.getByText(/this code expired\. the deposit was auto-rejected/i),
    ).toBeInTheDocument();
  });

  it('backend auto-rejects: an expired window yields `expired` and refuses to credit', () => {
    const now = Date.now();
    const rec: VerificationRecord = {
      status: 'awaiting_code',
      attempts: 0,
      max_attempts: 6,
      expires_at: new Date(now - 1).toISOString(), // window already passed
      code_hash: 'deadbeef',
    };

    // Even the correct hash cannot be accepted once the window has elapsed.
    const decision = evaluateAttempt(rec, 'deadbeef', now);
    expect(decision.kind).toBe('expired');

    // The atomic claim that guards crediting only allows awaiting_code → verified.
    // After expiry the sweep moves it to `expired`, so no credit can ever happen.
    const store = new VerificationStore();
    store.seed({ id: 'ver-1', status: 'awaiting_code' });
    // Expiry sweep closes the window.
    expect(store.claim('ver-1', 'awaiting_code', 'expired')).toBe(true);
    // A late verify attempt can no longer claim/credit it.
    expect(store.claim('ver-1', 'awaiting_code', 'verified')).toBe(false);
    expect(store.get('ver-1')?.status).toBe('expired');
  });
});
