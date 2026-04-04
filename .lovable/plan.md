### Fix: "Something went wrong" crash on `/find-a-house` and `/house/:id`

#### **Root Cause**

The error `TypeError: Cannot read properties of undefined (reading 'add')` originates from `HelmetDispatcher.init` in **react-helmet-async**.

Both `FindAHouse.tsx` and `HouseDetail.tsx` use the `<Helmet>` component, but the application is missing a `<HelmetProvider>` at the root level. Since `<Helmet>` depends on this provider, it attempts to call `.add()` on an undefined context, causing the app to crash and fall into `ChunkErrorBoundary`, which displays the generic *"Something went wrong"* message.

---

#### **Fix**

Wrap the application’s root component with `<HelmetProvider>` in `src/App.tsx`.

This is a minimal, one-line structural fix.

---

#### **Files to Update**

- `src/App.tsx`
  - Import `HelmetProvider` from `react-helmet-async`
  - Wrap the top-level component tree with it

---

#### **Impact**

- Resolves the crash on `/find-a-house` (public listings page)
- Resolves the crash on `/house/:id` (house details page)
- No side effects on other pages, as only these routes use `<Helmet>`