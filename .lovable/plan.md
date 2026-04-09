

# Text Change: Income Selection Header

## Change
Update the income selection heading in `RegisterTenantPublic.tsx` from "How does this tenant earn income?" to "How do you earn?" — since this is the public-facing form where the tenant themselves fills it out, the language should address them directly.

## File
- `src/pages/RegisterTenantPublic.tsx` line 253: change text from `"How does this tenant earn income?"` to `"How do you earn?"`

Note: The same text in `AgentRentRequestDialog.tsx` (line 494) is kept as-is since that form is used by agents referring to a tenant in third person.

