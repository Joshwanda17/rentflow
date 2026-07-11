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
      "Y'ello, you have received UGX 50,000 from JOHN. TID MP260504A12345. New balance UGX 150,000. 04/05/2026 16:20";
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

  it('parses MTN "sent" SMS with ISO date+time and "ID :" TID', () => {
    const sms =
      'You have sent UGX 150000 to LYDIA NAMUGENYI, 256767652611 on 2026-05-05 15:08:28, fee: 1000. Reason: Rent Paid. New balance: 4736158. ID :40479927536. Download MoMo App http://bit.ly/3KGlEJJ to get 500MBs.';
    const r = parseSMS(sms);
    expect(r.amount).toBe(150000);
    expect(r.transactionId).toBe('40479927536');
    expect(r.date).toBe('2026-05-05');
    expect(r.time).toBe('15:08');
  });

  it('parses MTN "Financial Transaction Id" label', () => {
    const sms =
      'Financial Transaction Id: 40479927536. You have sent UGX 150,000 to LYDIA (256767652611). Fee UGX 1,000. Bal UGX 4,736,158.';
    const r = parseSMS(sms);
    expect(r.amount).toBe(150000);
    expect(r.transactionId).toBe('40479927536');
  });

  it('handles trailing "/=" currency form', () => {
    const r = parseSMS('You have sent 50,000/= to JOHN. Ref 12345678. New balance 4,736,158/=');
    expect(r.amount).toBe(50000);
    expect(r.transactionId).toBe('12345678');
  });

  it('handles amount with currency AFTER the number', () => {
    const r = parseSMS('PAID 300,000 UGX to WELILE. TID 146525101664. Bal 323,546 UGX. 04-May-2026 16:20');
    expect(r.amount).toBe(300000);
    expect(r.transactionId).toBe('TID146525101664');
  });

  it('handles no-space currency prefix (UGX50,000)', () => {
    const r = parseSMS('You have received UGX50,000 from JANE. TID12345678. Bal UGX150,000');
    expect(r.amount).toBe(50000);
    expect(r.transactionId).toBe('TID12345678');
  });

  it('recognises "U.Sh" currency spelling', () => {
    const r = parseSMS('Sent U.Sh 30,000 to MARY. TID 55667788. Bal U.Sh 5,000');
    expect(r.amount).toBe(30000);
    expect(r.transactionId).toBe('TID55667788');
  });

  it('recognises "Shs" / "UShs" currency spelling', () => {
    expect(parseSMS('You have received Shs 10,000 from PETER. Txn ID: ABC12345. Balance Shs 20,000').amount).toBe(10000);
    expect(parseSMS('Payment of UShs 75,000 received. Ref: FT98765432. New balance UShs 200,000').amount).toBe(75000);
  });

  it('captures the value after connective words ("Reference number 5647…")', () => {
    const r = parseSMS('Cash out of UGX 40,000 successful. Reference number 5647382910. Charge UGX 800');
    expect(r.amount).toBe(40000);
    expect(r.transactionId).toBe('5647382910');
  });

  it('does not mistake the English word "Reference" for a bank ref', () => {
    const r = parseSMS('Please quote your Reference in all correspondence. You have sent UGX 20,000. TID 88776655.');
    expect(r.transactionId).toBe('TID88776655');
  });
});