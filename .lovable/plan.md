# **Fix: Cash Flow Statement Showing Incorrect Amounts**

## **Problems Identified**

### **1. Opening Balance Double Counting (“All Time”)**

- When **period = “All Time”**:
  - `startDate = null`
  - Opening balance query pulls **ALL platform entries**
  - Main cash flow queries also pull **ALL entries**

👉 Result:

```
Closing Balance = Opening Balance + Net Movement
```

…ends up **double-counting the same data**

---

### **2.** `opening_balance` **Category Contamination**

-   
Found:  

  -   
  249 entries in platform scope  

  -   
  ~46.2M cash_in  

  -   
  ~92.5M cash_out  


These are **migration artifacts**, not real transactions.

👉 Impact:

-   
Distorts:  

  -   
  Opening balance  

  -   
  Platform totals  

  -   
  Cash flow calculations  


---

### **3. Custodial Flows Overcounted**

Current logic:

```
sumAll(walletIn)
sumAll(walletOut)
```

👉 This incorrectly includes:

-   
ROI payouts  

-   
Referral bonuses  

-   
Rent flows  

-   
Proxy investments  


These are **not deposits/withdrawals**

---

### **4. Closing Balance Mismatch**

Because of the above issues:

-   
Opening = 0  

-   
Net Movement = 64M  

-   
Closing = 16M ❌  


👉 Math doesn’t reconcile

---

# **Fix Plan**

## **1. Fix Opening Balance Logic (Critical)**

### **File:** `src/hooks/useFinancialStatements.ts`

```
if (!startDate) {
  openingBalance = 0;
} else {
  // run normal opening balance query
}
```

👉 Key rule:

- **“All Time” = no opening balance**  

-   
Prevents double counting entirely  


---

## **2. Exclude** `opening_balance` **Entries (Mandatory)**

### **Option A: Query-Level Filter (Recommended)**

Add to all platform queries:

```
category !== 'opening_balance'
```

### **Option B: Helper-Level Filter (Safer Central Control)**

```
const filtered = entries.filter(
  (e) => e.category !== 'opening_balance'
);
```

👉 Apply inside:

- `sumAll`  

- `sumBy`  


✅ This guarantees:

-   
No synthetic data leaks into reports  


---

## **3. Fix Custodial Flow Classification**

Replace broad aggregation with **category-specific filtering**:

```
const userDeposits = sumBy(walletIn, [
  'deposit',
  'wallet_deposit',
  'pending_portfolio_topup'
]);

const userWithdrawals = sumBy(walletOut, [
  'wallet_withdrawal'
]);
```

👉 Now you’re measuring:

- **Actual user cash movement**  

-   
Not internal system flows  


---

## **4. Let Closing Balance Self-Correct**

Once fixes (1–3) are applied:

```
Closing Balance = Opening Balance + Net Cash Movement
```

✅ Will automatically reconcile correctly  
  
✅ No extra fix needed

---

# **Final Outcome**

After implementation:

-   
No more double counting  

-   
No synthetic data pollution  

-   
Custodial flows reflect **real user activity only**  

-   
Cash flow statement becomes **mathematically consistent**  

-   
Financial reports become **trustworthyFix: Cash Flow Statement Showing Incorrect Amounts**
  ## **Problems Identified**
  ### **1. Opening Balance Double Counting (“All Time”)**
  - When **period = “All Time”**:
    - `startDate = null`
    - Opening balance query pulls **ALL platform entries**
    - Main cash flow queries also pull **ALL entries**
  👉 Result:
  ```
  Closing Balance = Opening Balance + Net Movement
  ```
  …ends up **double-counting the same data**
  ---
  ### **2.** `opening_balance` **Category Contamination**
  -   
  Found:  

    -   
    249 entries in platform scope  

    -   
    ~46.2M cash_in  

    -   
    ~92.5M cash_out  

  These are **migration artifacts**, not real transactions.
  👉 Impact:
  -   
  Distorts:  

    -   
    Opening balance  

    -   
    Platform totals  

    -   
    Cash flow calculations  

  ---
  ### **3. Custodial Flows Overcounted**
  Current logic:
  ```
  sumAll(walletIn)
  sumAll(walletOut)
  ```
  👉 This incorrectly includes:
  -   
  ROI payouts  

  -   
  Referral bonuses  

  -   
  Rent flows  

  -   
  Proxy investments  

  These are **not deposits/withdrawals**
  ---
  ### **4. Closing Balance Mismatch**
  Because of the above issues:
  -   
  Opening = 0  

  -   
  Net Movement = 64M  

  -   
  Closing = 16M ❌  

  👉 Math doesn’t reconcile
  ---
  # **Fix Plan**
  ## **1. Fix Opening Balance Logic (Critical)**
  ### **File:** `src/hooks/useFinancialStatements.ts`
  ```
  if (!startDate) {
    openingBalance = 0;
  } else {
    // run normal opening balance query
  }
  ```
  👉 Key rule:
  - **“All Time” = no opening balance**  

  -   
  Prevents double counting entirely  

  ---
  ## **2. Exclude** `opening_balance` **Entries (Mandatory)**
  ### **Option A: Query-Level Filter (Recommended)**
  Add to all platform queries:
  ```
  category !== 'opening_balance'
  ```
  ### **Option B: Helper-Level Filter (Safer Central Control)**
  ```
  const filtered = entries.filter(
    (e) => e.category !== 'opening_balance'
  );
  ```
  👉 Apply inside:
  - `sumAll`  

  - `sumBy`  

  ✅ This guarantees:
  -   
  No synthetic data leaks into reports  

  ---
  ## **3. Fix Custodial Flow Classification**
  Replace broad aggregation with **category-specific filtering**:
  ```
  const userDeposits = sumBy(walletIn, [
    'deposit',
    'wallet_deposit',
    'pending_portfolio_topup'
  ]);

  const userWithdrawals = sumBy(walletOut, [
    'wallet_withdrawal'
  ]);
  ```
  👉 Now you’re measuring:
  - **Actual user cash movement**  

  -   
  Not internal system flows  

  ---
  ## **4. Let Closing Balance Self-Correct**
  Once fixes (1–3) are applied:
  ```
  Closing Balance = Opening Balance + Net Cash Movement
  ```
  ✅ Will automatically reconcile correctly  
    
  ✅ No extra fix needed
  ---
  # **Final Outcome**
  After implementation:
  -   
  No more double counting  

  -   
  No synthetic data pollution  

  -   
  Custodial flows reflect **real user activity only**  

  -   
  Cash flow statement becomes **mathematically consistent**  

  -   
  Financial reports become **trustworthy**Fix: Cash Flow Statement Showing Wrong Amounts

## Problems Found (from actual ledger data)

### 1. Opening Balance Double-Count on "All Time"

When period is "All Time", `startDate` is null. The opening balance query fetches ALL platform entries (no date filter applied), AND the main queries also fetch all entries. Result: `closingBalance = openingBalance + netCashMovement` double-counts everything.

**Fix**: When `startDate` is null (All Time), skip the opening balance query and set `openingBalance = 0`.

### 2. "opening_balance" Category Polluting Calculations

There are 249 `opening_balance` entries in platform scope (46.2M in, 92.5M out) — migration artifacts. These contaminate:

- Balance sheet `platformCash` (uses `sumAll`)
- Opening balance calculation

**Fix**: Exclude `opening_balance` category from all aggregations. Add a filter to the main queries or filter in the `sumAll` helper.

### 3. Custodial Flows Way Too Broad

`sumAll(walletIn)` and `sumAll(walletOut)` grab EVERY wallet-scoped entry — including ROI payouts (26M), referral bonuses (2.7M), rent obligations (10.3M), proxy investments (58.9M), etc. These are not "User Deposits" or "User Withdrawals."

**Fix**: Filter custodial flows by actual deposit/withdrawal categories only:

- User Deposits: `deposit`, `wallet_deposit`, `pending_portfolio_topup`
- User Withdrawals: `wallet_withdrawal`

### 4. Closing Balance Math Error

With all the above contamination, the closing balance (USh 16,457,606) doesn't reconcile with opening (0) + net movement (64,222,148).

**Fix**: Resolved automatically once issues 1-3 are fixed.

## Changes

### File: `src/hooks/useFinancialStatements.ts`

1. **Opening balance query**: Return empty array when `startDate` is null (All Time period)
2. **Exclude `opening_balance` category**: Add filter to exclude synthetic entries from all platform queries, or filter them out in `sumAll`/`sumBy` helpers
3. **Custodial flow categories**: Replace `sumAll(walletIn)` with `sumBy(walletIn, ['deposit', 'wallet_deposit', 'pending_portfolio_topup'])` and `sumAll(walletOut)` with `sumBy(walletOut, ['wallet_withdrawal'])`

No other files need changes — this is purely a data query/aggregation fix in the hook.