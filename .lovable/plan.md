

# Add Date Sorting & No-Email Filter — COO Partners Table

## Changes (`src/components/coo/COOPartnersPage.tsx`)

### 1. Store raw ISO dates for proper sorting
**Lines 322-323** — Change `joinedAt` and `lastActivity` from formatted locale strings to raw ISO strings. The sort comparator already handles string `localeCompare`, so ISO strings will sort chronologically.

```typescript
// Before
joinedAt: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—',
lastActivity: agg.lastActivity ? new Date(agg.lastActivity).toLocaleDateString() : '—',

// After
joinedAt: profile?.created_at || '',
lastActivity: agg.lastActivity || '',
```

### 2. Add "Joined" sortable column to the table
Insert a new column before the `actions` column (before line 1057):
- Key: `joinedAt`, Label: `Joined`, sortable: true, hideOnMobile: true
- Render: format the ISO string to readable date, or show `'—'` if empty

### 3. Default to "No Email" filter view
After data loads, set `filterContact` to `'no_email'` as the initial default so the COO immediately sees all partners missing email addresses. The existing filter logic at line 822 already handles this case.

### Technical Notes
- The `PartnerRow` type already has `joinedAt: string` — no type changes needed
- The sort comparator (line 828-836) handles string comparison via `localeCompare`, so ISO dates sort correctly
- No database migration needed

