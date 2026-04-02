

# Fix: "Edge Function returned a non-2xx status code" on Wallet Operation Approval

## Root Cause

Two issues working together:

1. **Role restriction too narrow**: The `approve-wallet-operation` edge function only allows the `manager` role (line 44-56). But the `PendingWalletOperationsWidget` is also rendered on the COO dashboard and Financial Ops page — users with `coo`, `cfo`, `cto`, or `super_admin` roles see the Approve/Reject buttons but get a 403 when clicking them.

2. **Error message not extracted**: The client code does `if (error) throw error` then `toast.error(e.message)`. The SDK wraps non-2xx responses in `FunctionsHttpError` where `.message` is the generic "Edge Function returned a non-2xx status code". The actual backend message ("Only managers can approve wallet operations") is buried in `.context`. The project already has `extractEdgeFunctionError` utility but it's not used here.

## Changes

### 1. Edge function: Allow executive roles to approve (approve-wallet-operation/index.ts)

Expand the role check from only `manager` to also allow `coo`, `cfo`, `cto`, and `super_admin`. Replace the single-role query with a check against multiple allowed roles.

### 2. Client: Use extractEdgeFunctionError (PendingWalletOperationsWidget.tsx)

In both `handleAction` and `handleBulkApprove`, replace:
```ts
if (error) throw error;
// catch: toast.error(e.message || ...)
```
with:
```ts
if (error) {
  const msg = await extractFromErrorObject(error);
  toast.error(msg);
  return;
}
```

Import `extractFromErrorObject` from `@/lib/extractEdgeFunctionError`.

### 3. Client: Same fix in ApprovalQueue.tsx

Apply the same error extraction pattern to the wallet ops approval path in `ApprovalQueue.tsx`.

## Files Modified
- `supabase/functions/approve-wallet-operation/index.ts` — expand role check
- `src/components/manager/PendingWalletOperationsWidget.tsx` — use extractFromErrorObject
- `src/components/financial-ops/ApprovalQueue.tsx` — use extractFromErrorObject

