

## Plan: Add expense sub-categories to CFO Direct Credit Tool

### File
`src/components/cfo/DirectCreditTool.tsx` (single file, lines 67–96)

### Changes

**1. Marketing Expenses** — append one entry:
```ts
subCategories: [
  { id: 'marketing_materials', label: 'Marketing Materials' },
  { id: 'events_exhibition', label: 'Events & Exhibition' },
]
```

**2. Operational Expenses** — append one entry to the existing list:
```ts
{ id: 'eviction_enforcement', label: 'Eviction & Enforcement' }
```

**3. Research & Development** — add a new `subCategories` array (currently has none):
```ts
subCategories: [
  { id: 'software', label: 'Software' },
  { id: 'welile_dowry', label: 'Welile Dowry' },
]
```

### Why this is the right place
`DirectCreditTool` is the CFO's expense-recording form. Subcategories already flow into `general_ledger.description` as `"Parent → Subcategory"` and into `pending_wallet_operations.metadata.sub_category`, so these new options will surface in:
- CFO Investor Report breakdown
- Manager Financial Statements
- Operational subcategory aggregations

No DB schema changes needed — the existing free-form `description` + `metadata.sub_category` columns absorb new ids automatically.

### Out of scope
- No changes to ledger categories (parents stay `marketing_expense`, `general_admin_expense`, `research_development_expense`)
- No changes to `AgentRequisitionForm` (those are top-level purposes, not subcategories)
- No migration

