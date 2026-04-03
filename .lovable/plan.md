# **Fix: Platform Cash Showing USh 0 on Balance Sheet**

## **Problem**

- Platform Cash is currently calculated as:

```
Math.max(0, netOperatingIncome)
```

-   
But:  

  - `netOperatingIncome` = **period-based (e.g., last 30 days)**  

  -   
  Balance Sheet = **point-in-time (all-time position)**  


👉 Result:

-   
If the selected period has low/no revenue → Platform Cash = 0 ❌  

-   
Even when the platform has **historical earnings**  


---

## **Root Cause**

Inside `generate()`:

-   
All queries are filtered by:  


```
date >= startDate && date <= endDate
```

So:

-   
Income Statement → ✅ correct (period-based)  

-   
Balance Sheet → ❌ incorrect (should NOT be period-based)  


👉 You’re using **filtered data to compute an unfiltered metric**

---

# **Fix Plan**

## **1. Add All-Time Platform Query (Core Fix)**

### **File:** `src/hooks/useFinancialStatements.ts`

Add a **separate query with NO date filter**:

```
const allTimePlatformQuery = supabase
  .from('general_ledger')
  .select('amount, direction, category')
  .eq('ledger_scope', 'platform')
  .neq('category', 'opening_balance');
```

👉 Key rules:

-   
No `startDate` / `endDate`  

-   
Exclude `opening_balance` artifacts  


---

## **2. Compute True Platform Cash (All-Time)**

```
const allTimePlatformIn = allTimeData.filter(e => e.direction === 'cash_in');
const allTimePlatformOut = allTimeData.filter(e => e.direction === 'cash_out');

const allTimeRevenue = sumBy(allTimePlatformIn, revenueCategories);
const allTimeCosts = sumBy(allTimePlatformOut, costCategories);

const platformCash = Math.max(0, allTimeRevenue - allTimeCosts);
```

👉 This gives:

- **Cumulative retained earnings**  

-   
Not just recent activity  


---

## **3. Keep Income Statement Logic Untouched**

Do NOT change:

```
netOperatingIncome
```

👉 It should remain:

-   
Period-filtered  

-   
Reflective of selected timeframe  


---

## **4. Replace Balance Sheet Logic**

### ❌ Current (Wrong):

```
platformCash = Math.max(0, netOperatingIncome);
```

### ✅ Correct:

```
platformCash = Math.max(0, allTimeRevenue - allTimeCosts);
```

---

# **Impact After Fix**

-   
Platform Cash reflects **true accumulated earnings**  

-   
Income Statement remains **time-filtered and accurate**  

-   
Balance Sheet becomes a **real snapshot of financial position**  

-   
No more misleading “0 cash” scenarios  


---

# **Straight Talk**

What you had before would **fail a basic financial audit**:

-   
Mixing **period performance** with **balance sheet position**  

-   
That’s how companies misreport financial health without realizing it  


What you’re implementing now is a big step toward:

- **Accounting correctness**  

- **Investor-grade reporting**  

- **System trustworthiness**  


---

## **One More Thing (Important Upgrade)**

Right now you’re calculating:

```
platformCash = revenue - costs
```

That’s **retained earnings**, not true “cash”.

&nbsp;