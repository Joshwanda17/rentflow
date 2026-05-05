import { describe, it, expect } from 'vitest';
import { parseSMS } from '../smsParser';

describe('parseSMS', () => {
  it('parses Airtel-style SMS with space-separated TID and month-name date', () => {
    const sms =
      'PAID.TID 146525101664. UGX 300,000 to WELILE TECHNOLOGIES LIMITED Charge UGX 0. Bal UGX 323,546. 04-May-2026 16:20';
    const r = parseSMS(sms);
    expect(r.amount).toBe(300000);
    expect(r.transactionId).toBe('TID146525101664');
    expect(r.date).toBe('2026-05-04');
    expect(r.time).toBe('16:20');
  });

  it('parses MTN MP… style TID', () => {
    const sms =
      'Y\'ello, you have received UGX 50,000 from JOHN. TID: MP260504.1620.A12345. New balance UGX 150,000. 04/05/2026 16:20';
    const r = parseSMS(sms);
    expect(r.amount).toBe(50000);
    expect(r.transactionId?.startsWith('MP')).toBe(true);
    expect(r.date).toBe('2026-05-04');
    expect(r.time).toBe('16:20');
  });

  it('skips Bal/Charge tokens when picking the amount', () => {
    const sms =
      'Bal UGX 999,000. Charge UGX 0. PAID UGX 25,000 TID 12345678. 04-May-2026 09:05';
    const r = parseSMS(sms);
    expect(r.amount).toBe(25000);
    expect(r.transactionId).toBe('TID12345678');
  });

  it('leaves time undefined when SMS has no time token', () => {
    const sms = 'PAID UGX 10,000 TID 99887766. 01-Jan-2026';
    const r = parseSMS(sms);
    expect(r.amount).toBe(10000);
    expect(r.date).toBe('2026-01-01');
    expect(r.time).toBeUndefined();
  });
});