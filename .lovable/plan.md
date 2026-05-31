I found enough evidence to prepare the PDF diagnosis before applying another patch.

Key findings to document in the PDF:

1. The current `/index` page is not the welcome page.
   - `App.tsx` has a route for `/`, but not `/index`.
   - `/index` is being caught by the generic `/:code` short-link route, then `TrackedRedirect.tsx` returns the 404 page when `index` is not a valid short link.
   - That explains the 404 screenshot and makes `/index` a misleading test route.

2. Pull-to-refresh is probably not the active cause on the welcome/auth entry pages anymore.
   - `App.tsx` bypasses the `<PullToRefresh>` wrapper entirely for `/`, `/index`, `/auth`, and `/welcome`.
   - So if `/welcome` and `/auth` still feel locked, the root cause is outside the PullToRefresh hook.

3. The likely real scroll-lock source is global/mobile scroll CSS, not the hook.
   - `index.html` sets `body { overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch }`.
   - `src/critical.css` later sets `body { overscroll-behavior: none; overflow-y: auto; min-height: 100dvh; }`.
   - This globally suppresses browser overscroll/bounce behavior on every page. In Android Chrome/PWA/iframe contexts, that can make edge scrolling feel stuck, especially when combined with full-screen/min-height layouts.

4. The Auth page has a second layout-specific scroll risk.
   - `Auth.tsx` uses `min-h-screen flex items-center justify-center p-4` for the whole page.
   - When the auth form becomes taller than the mobile viewport, centered flex layouts can place overflow above/below the viewport and make the page feel unscrollable or partially unreachable.

5. The Welcome page is scrollable in desktop/mobile browser simulation after using programmatic scroll, but the full-page CSS still remains unsafe for real Android touch scrolling.
   - The screenshot after scroll shows the Welcome page moved, so the DOM can scroll.
   - The problem is likely touch/overscroll behavior on real mobile/PWA/preview, not missing content height.

Plan for the PDF:

- Generate a concise PDF report with:
  - The real cause ranking: global overscroll CSS first, Auth flex-centering second, `/index` routing confusion third.
  - Code references and line numbers.
  - Why previous PullToRefresh patches did not solve it.
  - The safest solution proposal, without applying it yet.
- Visually QA every PDF page by converting it to images and inspecting for clipping/overlap before delivering it.

Proposed solution after the PDF is approved:

- Remove global scroll suppression from `body`/`html` and keep native document scrolling as the default.
- Limit overscroll containment only to true internal scroll containers/modals/sheets, not the app shell.
- Change Auth root layout from centered full-screen flex to a natural document-flow layout like `min-h-dvh overflow-y-auto py-safe px-4`, with centered content only when it fits.
- Add a real `/index` redirect to `/welcome` or stop using `/index` as a test route.
- Then verify on `/welcome`, `/auth`, `/`, and `/index` with mobile viewport diagnostics and scroll-height checks.