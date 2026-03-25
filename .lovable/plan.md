

## Hide PWA Install Prompt for Authenticated Users

### Problem
The "Get the Welile App" PWA install prompt shows to authenticated users, which is bad UX — they're already using the app.

### Change

**File: `src/components/DeferredExtras.tsx`**

- Import `useAuth` hook
- Gate the `PWAInstallPrompt` render: only show it when `!user` (unauthenticated visitors)

```tsx
const { user } = useAuth();
// ...
{shouldShowGlobalPrompts && !user && <PWAInstallPrompt />}
```

This is a one-line conditional change plus one import. Authenticated users will never see the install nag; unauthenticated visitors on `/welcome` or `/auth` still get it.

