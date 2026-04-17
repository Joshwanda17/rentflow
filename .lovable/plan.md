
The user wants three changes to Partner Management (`src/components/coo/COOPartnersPage.tsx`):
1. Remove the table-wide blur/dim overlay during search; show spinner inside search input instead.
2. Add `pg_trgm` GIN indexes on `profiles(full_name)` and `profiles(phone)` for fast ILIKE search.
3. Add a new "Wallet" filter dropdown — options: All Wallets / Has Balance / Empty.

Let me check the file briefly to confirm structure before planning details.
