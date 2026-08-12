# Person-Name Standardisation — Design Decision Record

Card 02 (Reuse Audit: Extend vs Create). Read-only spike. Status: **decided**.
Date: 2026-08-12.

## 1. Decision

| Item | Decision | Reason |
| --- | --- | --- |
| Shared field component | **CREATE** `src/components/shared/PersonNameFields.tsx` | No generic person-name field component exists anywhere in the repo. |
| Split / join helpers | **EXTEND** `src/lib/authValidation.ts` | The single existing name authority (`validateFullName`) already lives there; a new module would create a second authority. |
| Validation rules | **EXTEND / REUSE ONLY** `validateFullName` | Fully implemented rule set already in place; no new rules are needed. |
| Error rendering | **REUSE** `src/components/shared/FieldError.tsx` | Already the standard inline error under registration/listing inputs. |
| Inputs / labels | **REUSE** `@/components/ui/input`, `@/components/ui/label` | Existing primitives; no new UI primitives. |

### Evidence

- `src/lib/authValidation.ts` — `validateFullName(raw)` returns `{ valid, trimmed, error }` and already enforces: min length, ≥ 2 name parts, ≥ 2 letters per part, gibberish rejection, junk-pattern sweep, and "first == last" rejection. It normalises whitespace via `.trim().replace(/\s+/g, ' ')`. It also backs `validateSignUp`. **This is the only name authority and must stay so.** There are no split/join helpers in the file.
- `src/pages/Onboarding.tsx` — hand-rolls the target behaviour: separate `form.firstName` / `form.lastName` raw `<input>` elements (~lines 793–811, not shadcn primitives), inline length checks `form.firstName.length >= 2 && form.lastName.length >= 2` (~line 1037) and per-field messages (~lines 1079–1080), then joins on submit as `` `${cleanFirst} ${cleanLast}`.trim() `` (~line 1336) for `partner_agreements.full_name`. It never calls `validateFullName`.
- `src/components/notifications/NameCompletionGate.tsx` — the mirror image: splits the stored name with `currentName.split(/\s+/).filter(Boolean)` (first = `parts[0]`, last = `parts.slice(1).join(" ")`), then rejoins with `` `${firstName.trim()} ${lastName.trim()}`.trim() `` and validates with `validateFullName`. Uses `Input` + `Label` correctly.
- `src/hooks/useAuthForm.ts` — single `fullName` string state (line 57) validated via `validateFullName` (line 402) and `validateSignUp` (line 404). No split fields; a pilot candidate but state-heavy.
- `src/lib/formContracts/` (`contracts.ts`, `validator.ts`, `types.ts`, `index.ts`) — a generic pre-submit *payload shape* validator (types, required, min/max length). `full_name` appears only as `{ type: 'text', required: true, minLength: 2, maxLength: 200 }`. Imported by just two files (`PaymentConfirmationForm.tsx`, `RentRequestButton.tsx`). It is **not** a name authority and will not be extended.
- `src/components/ui/form.tsx` — react-hook-form wrappers (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`). Available but *not required*: most in-scope flows are plain `useState` forms, so `PersonNameFields` must work standalone.
- `src/components/shared/FieldError.tsx` — `{ message, className }`, renders nothing when empty. Drop-in under any input.
- Repo scan for `PersonName`, `NameFields`, `SplitName`, `joinName`: **no existing component or helper**. The only textual hit is unrelated (`src/hr/components/ExecutiveBrief.tsx`).

**Conclusion:** exactly two duplicated implementations of the same split/join behaviour justify exactly one shared abstraction — one component + two helpers. Nothing more.

## 2. Component contract — `PersonNameFields`

Location: `src/components/shared/PersonNameFields.tsx`

```ts
export interface PersonNameValue {
  firstName: string;
  otherNames: string;
  lastName: string;
}

export interface PersonNameFieldsProps {
  value: PersonNameValue;
  onChange: (next: PersonNameValue) => void;
  disabled?: boolean;
  required?: boolean;   // default true
  idPrefix: string;     // e.g. "signup" -> ids signup-first-name, signup-other-names, signup-last-name
  className?: string;
}
```

Rules:
- **Fully controlled.** No internal state (no `useState`, no `useEffect`).
- No submission logic, no `supabase` calls, no data fetching, no toasts, no navigation.
- Field order and labels: **First Name** (required), **Other Names** (optional), **Last Name** (required).
- `autoComplete`: `given-name`, `additional-name`, `family-name`. `autoCapitalize="words"`.
- Uses `@/components/ui/input` and `@/components/ui/label` only; per-field errors, when a caller supplies them, render via existing `FieldError`. No new styling tokens, no hardcoded colours.
- `className` is merged with `cn(...)` onto the wrapper only.

## 3. Helper contracts — added to `src/lib/authValidation.ts`

```ts
export interface PersonNameParts {
  firstName: string;
  otherNames: string;
  lastName: string;
}

export const joinPersonName = (parts: Partial<PersonNameParts>) => string;
export const splitPersonName = (fullName: string | null | undefined) => PersonNameParts;
```

`joinPersonName` — trims each part, drops empties, joins the survivors with a single space in the order `First Other Last`, and collapses any internal runs of whitespace. Returns `''` when all parts are empty. Output is byte-identical to what today's flows already send (`"First Last"` when `otherNames` is empty).

`splitPersonName` — tokenises on `/\s+/` after trimming, then:

| Tokens | firstName | otherNames | lastName |
| --- | --- | --- | --- |
| 0 | `''` | `''` | `''` |
| 1 | `token[0]` | `''` | `''` |
| 2 | `token[0]` | `''` | `token[1]` |
| 3+ | `token[0]` | middle tokens joined by single spaces | last token |

Round-trip guarantee: `joinPersonName(splitPersonName(s)) === s.trim().replace(/\s+/g, ' ')`.

## 4. Validation policy

- `validateFullName(joinPersonName(value))` is the **only** name rule set. Its `trimmed` output is what gets submitted/stored.
- Plus a per-field required check: when `required`, `firstName` and `lastName` must each be non-empty after trim (message wording reused from the existing flows: "first name", "last name").
- `otherNames` is never required and is never validated on its own.
- No new regex. No new validation module. No competing rules. `formContracts` remains untouched.

## 5. Explicitly NOT being built

- No new form library, and no mandatory react-hook-form adoption.
- No React context provider, no name store, no global state.
- No new validation module and no changes to `src/lib/formContracts/`.
- No new UI primitives (no custom input/label) and no new styling tokens or CSS variables.
- No new hook (no `usePersonName`).
- No backend, RPC, migration, edge-function, column or payload-shape change. The database keeps receiving one concatenated `full_name` string.
- No auto-fixing/auto-capitalising of user input beyond whitespace normalisation.

## 6. Test cases for Card 03 (to implement, not now)

`splitPersonName`:
1. `''` → all empty; also `null`, `undefined`, `'   '`.
2. `'Alice'` → `{ Alice, '', '' }`.
3. `'Alice Nakato'` → `{ Alice, '', Nakato }`.
4. `'Alice Grace Nakato'` → `{ Alice, 'Grace', Nakato }`.
5. `'Alice Grace Mary Nakato'` → `{ Alice, 'Grace Mary', Nakato }`.
6. `'  Alice   Grace   Nakato  '` → same as case 4 (whitespace collapsed).
7. Tabs/newlines treated as whitespace.

`joinPersonName`:
8. `{ Alice, '', Nakato }` → `'Alice Nakato'`.
9. `{ Alice, 'Grace', Nakato }` → `'Alice Grace Nakato'`.
10. `{ ' Alice ', '  ', ' Nakato ' }` → `'Alice Nakato'` (empty middle dropped).
11. All empty → `''`.
12. Missing keys (`Partial`) do not throw.

Round-trip:
13. `joinPersonName(splitPersonName(x)) === x.trim().replace(/\s+/g,' ')` for cases 2–7.

Validation integration:
14. `validateFullName(joinPersonName({ Alice, '', Nakato }))` → valid.
15. Single token (`{ Alice, '', '' }`) → invalid with the existing "at least two names" error.
16. `{ John, '', John }` → invalid via the existing identical-first/last rule.
17. Gibberish / junk parts still rejected by `validateFullName` unchanged.

Component (`PersonNameFields`):
18. Renders three labelled inputs with ids derived from `idPrefix`.
19. Typing in each field calls `onChange` with the full merged object, other keys unchanged.
20. `disabled` disables all three inputs.
21. Holds no internal state — re-render with a new `value` prop is reflected immediately.

## 7. Pilot flow for Card 04

**Signup / auth flow** — `src/hooks/useAuthForm.ts` + its signup form UI. Chosen because it is the highest-traffic capture point, it already calls `validateFullName`/`validateSignUp` (so the authority is unchanged), and it stores a single `fullName` string — proving the split UI → joined string contract with a byte-identical submitted payload before the pattern spreads. `NameCompletionGate.tsx` and `Onboarding.tsx` are consolidated in Card 05, not here.
