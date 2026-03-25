

## Phase 2: Shadow Service Layer — Mirror Existing Financial Logic

### What this does
Adds new pure-logic methods to `transactionService.ts` and `walletService.ts` that replicate the validation and business rules currently embedded in five core edge functions. **No existing code is touched.** These methods are unused — shadow mode only.

### Mapping: Edge Function → New Service Method

```text
Edge Function                    → Service Method
─────────────────────────────────────────────────────────
wallet-transfer                  → TransactionService.validateWalletTransfer()
                                 → TransactionService.buildTransferLedgerEntries()
agent-deposit                    → TransactionService.validateAgentDeposit()
                                 → TransactionService.calculateRepaymentSplit()
                                 → TransactionService.buildDepositLedgerEntries()
fund-rent-pool                   → TransactionService.validatePoolFunding()
                                 → TransactionService.buildPoolFundingEntries()
cfo-direct-credit                → TransactionService.validateCfoAdjustment()
                                 → TransactionService.buildCfoAdjustmentEntries()
approve-wallet-operation         → TransactionService.buildApprovalLedgerEntry()

(wallet balance checks)          → WalletService.validateSufficientBalance()
                                 → WalletService.ensureWalletExists() (type only)
                                 → WalletService.computeOptimisticDebit()
```

### Changes (all additive)

**1. `src/core/services/transactionService.ts`**
- Add new interfaces: `WalletTransferRequest`, `AgentDepositRequest`, `PoolFundingRequest`, `CfoAdjustmentRequest`, `RepaymentSplit`
- Add methods mirroring each edge function's validation + ledger entry construction:
  - `validateWalletTransfer()` — amount range (1–100M), self-transfer check, UUID format
  - `buildTransferLedgerEntries()` — paired in/out entries with `wallet_transfer` category
  - `validateAgentDeposit()` — amount validation, phone format check
  - `calculateRepaymentSplit()` — 5% commission, landlord/wallet split logic
  - `buildDepositLedgerEntries()` — `rent_payment_for_tenant` + `rent_repayment` entries
  - `validatePoolFunding()` — supporter role check, positive amount
  - `buildPoolFundingEntries()` — `supporter_rent_fund` category, reference ID generation
  - `validateCfoAdjustment()` — amount range (1–50M), reason min 10 chars, operation type
  - `buildCfoAdjustmentEntries()` — dual entries with `ledger_scope` (bridge + platform)
  - `buildApprovalLedgerEntry()` — mirrors the pending→approved general_ledger insert

**2. `src/core/services/walletService.ts`**
- Add `validateSufficientBalance()` — returns `{ valid, balance, shortfall }` instead of boolean
- Add `computeOptimisticDebit()` — pure function returning new balance and lock conditions
- Add `WalletExistenceCheck` interface — typed representation of ensure-or-create pattern

**3. `src/core/services/index.ts`**
- No change needed — already re-exports both services

### What stays the same
- All edge functions remain untouched and continue handling production traffic
- No frontend changes
- No database changes
- New methods are pure functions with zero side effects — they receive data and return data

### Technical details
- All new methods are pure/stateless — they take typed inputs and return typed outputs
- They mirror the exact validation rules, amount limits, commission rates (5%), and ledger entry shapes from the live edge functions
- `AGENT_COMMISSION_RATE = 0.05` is extracted as a named constant
- Phone normalization logic (last-9-digits pattern) is replicated as a utility
- UUID regex validation is replicated
- Reference ID generation (`WRF${yy}${mm}${dd}${seq}`) is replicated

