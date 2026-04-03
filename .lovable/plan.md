# **Fix: Income Statement Not Updating on Date Selection**

## **Problem**

When a user selects a different period (**Today, 7 Days, 30 Days, etc.**):

- The filter updates ✔
- The Income Statement **does NOT refresh automatically** ✗
- Users must manually click **“Regenerate Statements”**

---

## **Root Cause**

Inside `useFinancialStatements.ts`:

- `updatePeriod()` only calls:
  ```
  setFilters(...)
  ```
-   
But it **never triggers** `generate()`  


Additionally:

-   
There is **no** `useEffect` **watching** `filters`  

-   
React state updates are **asynchronous**, so even if you call `generate()` immediately, it may use stale filters  


---

## **Fix Plan**

---

## **1. Auto-Regenerate on Period Change (Critical Fix)**

### **File:** `src/hooks/useFinancialStatements.ts`

### **Fix Strategy**

-   
Build the **new filters object manually**  

-   
Pass it directly into `generate(newFilters)`  

-   
Do NOT rely on state being updated instantly  


### **Updated Logic**

```
const updatePeriod = (period: string) => {
  const newFilters = {
    ...filters,
    period,
    // include any derived date ranges here if applicable
  };

  setFilters(newFilters);

  // Immediately regenerate with correct filters
  generate(newFilters);
};
```

### **Why This Works**

-   
Avoids React batching delay  

-   
Ensures `generate()` uses the **correct, updated filters**  

-   
Eliminates dependency on state timing  


---

## **2. Auto-Generate on Initial Load**

### **File:** `src/components/manager/FinancialStatementsPanel.tsx`

### **Fix Strategy**

Trigger data generation when the component mounts.

```
useEffect(() => {
  generate();
}, []);
```

---

## **Optional (Better Architecture – Recommended)**

If you want a more **React-clean approach**, you can also do this:

```
useEffect(() => {
  generate(filters);
}, [filters]);
```

### **But be careful:**

-   
This can cause **double calls** if `updatePeriod` also calls `generate()`  

-   
Choose **ONE approach**, not both  


👉 Best practice for your case right now:

-   
Stick with **manual trigger inside** `updatePeriod`  


---

## **Impact After Fix**

-   
Changing period → **instant refresh of Income Statement**  

-   
No more “Regenerate” button dependency  

-   
Data loads automatically on page open  

-   
UX becomes **smooth and predictable**