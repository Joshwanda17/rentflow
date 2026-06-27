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

/**
 * Normalisation matrix: a variety of *valid* input formats — spacing, leading
 * zeros, hyphens, leading '+', country code with/without '+', and the
 * "00256" international dialling prefix — that should all normalise to the SAME
 * E.164 number. `e2e/phone-normalization.spec.ts` drives these cases and
 * asserts the resulting `tel:` / `wa.me` links are identical and correct.
 */
export const NORMALIZATION_CASES: { id: string; label: string; phone: string; e164: string }[] = [
  { id: 'norm-local', label: 'Local 0-prefix', phone: '0759229748', e164: '256759229748' },
  { id: 'norm-local-spaces', label: 'Local with spaces', phone: '0759 229 748', e164: '256759229748' },
  { id: 'norm-local-hyphens', label: 'Local with hyphens', phone: '0759-229-748', e164: '256759229748' },
  { id: 'norm-bare-9', label: 'Bare 9-digit (no 0)', phone: '759229748', e164: '256759229748' },
  { id: 'norm-intl-no-plus', label: 'Country code no +', phone: '256759229748', e164: '256759229748' },
  { id: 'norm-intl-plus', label: 'Country code with +', phone: '+256759229748', e164: '256759229748' },
  { id: 'norm-intl-spaces', label: '+256 with spaces', phone: '+256 759 229 748', e164: '256759229748' },
  { id: 'norm-intl-parens', label: '+256 with parens/dots', phone: '+256 (759) 229.748', e164: '256759229748' },
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

      <div className="pt-4 text-sm font-semibold">Normalisation matrix</div>
      {NORMALIZATION_CASES.map((c) => (
        <div key={c.id} data-testid={`case-${c.id}`} className="rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            {c.label} — “{c.phone}”
          </div>
          <PhoneContactActions phone={c.phone} />
        </div>
      ))}
    </div>
  );
}