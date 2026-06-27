/**
 * Dev-only Playwright harness that renders the real `PhoneContactActions`
 * component (used in the rent-request landlord picker) for a range of phone
 * numbers — both valid Ugandan numbers and clearly invalid ones.
 *
 * Used by `e2e/phone-contact-actions.spec.ts` to assert that:
 *   - invalid / missing numbers render NO Call or WhatsApp links (disabled), and
 *   - valid numbers render enabled Call (`tel:+256…`) and WhatsApp
 *     (`https://wa.me/256…`) links with the correctly normalised E.164 number.
 *
 * Mounted at `/__e2e/phone-contact-actions` ONLY when `import.meta.env.DEV`
 * is true — so it never ships in production builds.
 */
import { PhoneContactActions } from '@/components/agent/AgentRentRequestDialog';

const CASES: { id: string; label: string; phone: string | null | undefined }[] = [
  { id: 'valid-local', label: 'Valid local (0759…)', phone: '0759229748' },
  { id: 'valid-spaced', label: 'Valid spaced (0772 123 456)', phone: '0772 123 456' },
  { id: 'valid-intl', label: 'Valid intl (+256…)', phone: '+256759229748' },
  { id: 'valid-bare', label: 'Valid bare 9-digit', phone: '759229748' },
  { id: 'invalid-short', label: 'Invalid (too short)', phone: '07592297' },
  { id: 'invalid-long', label: 'Invalid (too long)', phone: '075922974899' },
  { id: 'invalid-prefix', label: 'Invalid (2nd digit < 3)', phone: '0259229748' },
  { id: 'invalid-letters', label: 'Invalid (letters)', phone: 'not-a-number' },
  { id: 'empty', label: 'Empty', phone: '' },
  { id: 'null', label: 'Null', phone: null },
];

export default function PhoneContactActionsHarness() {
  return (
    <div data-testid="e2e-phone-contact-actions-harness" className="p-6 space-y-4 max-w-md">
      {CASES.map((c) => (
        <div key={c.id} data-testid={`case-${c.id}`} className="rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">{c.label}</div>
          <PhoneContactActions phone={c.phone} />
        </div>
      ))}
    </div>
  );
}