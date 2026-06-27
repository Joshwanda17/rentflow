import { describe, it, expect } from 'vitest';
import { getNextRunDate, computeNextRun } from './standingOrderSchedule';

describe('monthly standing order time-of-day preservation', () => {
  it('keeps the original next_run_at time-of-day across many monthly cycles', () => {
    // Created at a specific, non-midnight local time.
    const createdAt = new Date(2026, 0, 15, 9, 37, 12, 0); // 15 Jan 2026, 09:37:12
    const first = new Date(getNextRunDate({ frequency: 'monthly', dayOfMonth: 15, dayOfWeek: 1, intervalDays: 30 }, createdAt));

    const h = first.getHours();
    const m = first.getMinutes();
    const s = first.getSeconds();

    // Run 24 cycles forward; the wall-clock time must never drift.
    let cursor = first;
    for (let i = 0; i < 24; i++) {
      cursor = computeNextRun(cursor, { frequency: 'monthly' });
      expect(cursor.getHours()).toBe(h);
      expect(cursor.getMinutes()).toBe(m);
      expect(cursor.getSeconds()).toBe(s);
    }
  });

  it('rolls to next month when the chosen day already passed today, preserving creation time', () => {
    const createdAt = new Date(2026, 5, 20, 14, 5, 0, 0); // 20 Jun 2026, 14:05
    const next = new Date(getNextRunDate({ frequency: 'monthly', dayOfMonth: 10, dayOfWeek: 1, intervalDays: 30 }, createdAt));
    expect(next.getMonth()).toBe(6); // July
    expect(next.getDate()).toBe(10);
    expect(next.getHours()).toBe(14);
    expect(next.getMinutes()).toBe(5);
  });

  it('daily / weekly / interval also preserve the creation time-of-day', () => {
    const createdAt = new Date(2026, 2, 3, 7, 22, 45, 0);
    for (const cfg of [
      { frequency: 'daily' as const, dayOfMonth: 1, dayOfWeek: 1, intervalDays: 1 },
      { frequency: 'weekly' as const, dayOfMonth: 1, dayOfWeek: 5, intervalDays: 1 },
      { frequency: 'interval' as const, dayOfMonth: 1, dayOfWeek: 1, intervalDays: 3 },
    ]) {
      const next = new Date(getNextRunDate(cfg, createdAt));
      expect(next.getHours()).toBe(7);
      expect(next.getMinutes()).toBe(22);
      expect(next.getSeconds()).toBe(45);
    }
  });
});
