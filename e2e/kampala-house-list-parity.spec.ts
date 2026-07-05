/**
 * End-to-end parity test for the "selecting Kampala" fix.
 *
 * Kampala is stored in the `district` column (region = "Central"), so the search
 * filter was broadened to match region/district/sub-county/village/address. This
 * spec drives the ACTUAL UI — the public "Find a House" page and the tenant
 * "Available Houses" sheet — selects Kampala in the region dropdown, and asserts
 * the rendered house list is exactly the same set the underlying query returns.
 *
 * The "underlying query" is the `find_nearby_houses` RPC the app itself calls;
 * we replay it with the EXACT params the UI sent (captured from the network) and
 * apply the same real-photo filter the marketplace applies, then compare id sets.
 *
 * Run: bunx playwright test e2e/kampala-house-list-parity.spec.ts
 */
import { test, expect, Page, Request } from '@playwright/test';

// Kampala city centre — the geolocation we grant the browser.
const KAMPALA = { latitude: 0.3476, longitude: 32.5825 };
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wirntoujqoyjobfhyelc.supabase.co';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpcm50b3VqcW95am9iZmh5ZWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1NjE1MTYsImV4cCI6MjA4MjEzNzUxNn0.5-zxcRPVxvpxNiXhoo5VHpIuvbtuOLfiI3ph8jPIod8';

type RpcParams = Record<string, unknown>;

/** A house row is shown in the marketplace only if it has at least one real photo. */
function hasRealPhoto(row: { image_urls?: unknown }): boolean {
  const urls = (row as { image_urls?: unknown }).image_urls;
  return Array.isArray(urls) && urls.some((u) => typeof u === 'string' && u.trim().length > 0);
}

/** Capture the params of the first find_nearby_houses request that filters on Kampala. */
function captureKampalaRpcParams(page: Page): { get: () => RpcParams | null } {
  let params: RpcParams | null = null;
  page.on('request', (req: Request) => {
    if (params) return;
    if (!req.url().includes('/rpc/find_nearby_houses')) return;
    try {
      const body = JSON.parse(req.postData() || '{}') as RpcParams;
      if (String(body.region_filter ?? '').toLowerCase() === 'kampala') params = body;
    } catch {
      /* ignore non-JSON */
    }
  });
  return { get: () => params };
}

/** Replay the underlying query fully with the exact params the UI used. */
async function fetchUnderlyingQueryIds(page: Page, baseParams: RpcParams): Promise<Set<string>> {
  const rows = await page.evaluate(
    async ({ url, key, base }) => {
      const out: any[] = [];
      const limit = 200;
      let offset = 0;
      // Page through the whole Kampala result set, ignoring the UI's own paging window.
      for (let i = 0; i < 50; i++) {
        const res = await fetch(`${url}/rest/v1/rpc/find_nearby_houses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
          body: JSON.stringify({ ...base, result_limit: limit, result_offset: offset }),
        });
        const page = (await res.json()) as any[];
        if (!Array.isArray(page) || page.length === 0) break;
        out.push(...page);
        if (page.length < limit) break;
        offset += limit;
      }
      return out;
    },
    { url: SUPABASE_URL, key: SUPABASE_KEY, base: baseParams },
  );
  const ids = new Set<string>();
  for (const r of rows as any[]) {
    if (hasRealPhoto(r) && r?.id) ids.add(String(r.id));
  }
  return ids;
}

/**
 * Scroll a virtualized list to completion, collecting every rendered house id.
 * `scrollStep` scrolls one viewport (window for Find a House, the sheet's own
 * scroll container for the Available Houses sheet).
 */
async function collectRenderedHouseIds(
  page: Page,
  scrollStep: () => Promise<{ atBottom: boolean; hasMore: boolean }>,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let stableRounds = 0;
  for (let i = 0; i < 120; i++) {
    const visible = await page.$$eval('[data-house-id]', (els) =>
      els.map((e) => e.getAttribute('data-house-id')).filter(Boolean) as string[],
    );
    const before = ids.size;
    visible.forEach((id) => ids.add(id));
    const { atBottom, hasMore } = await scrollStep();
    await page.waitForTimeout(350); // let the next page load + virtualizer remount
    // Stop once we've reached the bottom, nothing more is loading, and no new
    // ids have appeared for a couple of rounds.
    if (atBottom && !hasMore && ids.size === before) {
      stableRounds++;
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }
  }
  return ids;
}

/** Open the shadcn region <Select> and choose "Kampala". */
async function selectKampalaRegion(page: Page, root = page.locator('body')) {
  // The region trigger is the combobox showing the current region ("All Regions").
  const trigger = root.getByRole('combobox').filter({ hasText: /All Regions|Region|Central|Kampala/ }).first();
  await trigger.click();
  await page.getByRole('option', { name: 'Kampala', exact: true }).click();
}

test.use({
  geolocation: KAMPALA,
  permissions: ['geolocation'],
  viewport: { width: 1280, height: 1600 },
});

test.describe('Kampala house-list parity: UI == underlying query', () => {
  test('Find a House page', async ({ page }) => {
    const captured = captureKampalaRpcParams(page);
    await page.goto('/find-a-house');

    await selectKampalaRegion(page);

    // Wait for results to paint for the Kampala filter.
    await expect(page.locator('[data-house-id]').first()).toBeVisible({ timeout: 20_000 });

    const uiIds = await collectRenderedHouseIds(page, async () => {
      const before = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      const after = await page.evaluate(() => ({
        y: window.scrollY,
        max: document.documentElement.scrollHeight - window.innerHeight,
      }));
      const hasMore = await page
        .getByText(/houses? available/i)
        .first()
        .innerText()
        .then((t) => t.includes('+'))
        .catch(() => false);
      return { atBottom: after.y <= before + 4 || after.y >= after.max - 4, hasMore };
    });

    const baseParams = captured.get();
    expect(baseParams, 'UI must call find_nearby_houses with region_filter=Kampala').toBeTruthy();
    const queryIds = await fetchUnderlyingQueryIds(page, baseParams!);

    expect(queryIds.size, 'Kampala underlying query must be non-empty').toBeGreaterThan(0);
    expect([...uiIds].sort()).toEqual([...queryIds].sort());
  });

  test('Available Houses sheet', async ({ page }) => {
    const captured = captureKampalaRpcParams(page);
    await page.goto('/__e2e/available-houses');

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 20_000 });

    await selectKampalaRegion(page, sheet);
    await expect(page.locator('[data-house-id]').first()).toBeVisible({ timeout: 20_000 });

    const scroller = sheet.locator('.overflow-y-auto').first();
    const uiIds = await collectRenderedHouseIds(page, async () => {
      const state = await scroller.evaluate((el) => {
        const before = el.scrollTop;
        el.scrollBy(0, el.clientHeight);
        return {
          before,
          after: el.scrollTop,
          max: el.scrollHeight - el.clientHeight,
        };
      });
      const hasMore = await sheet
        .getByText(/houses? available/i)
        .first()
        .innerText()
        .then((t) => t.includes('+'))
        .catch(() => false);
      return { atBottom: state.after <= state.before + 4 || state.after >= state.max - 4, hasMore };
    });

    const baseParams = captured.get();
    expect(baseParams, 'Sheet must call find_nearby_houses with region_filter=Kampala').toBeTruthy();
    const queryIds = await fetchUnderlyingQueryIds(page, baseParams!);

    expect(queryIds.size, 'Kampala underlying query must be non-empty').toBeGreaterThan(0);
    expect([...uiIds].sort()).toEqual([...queryIds].sort());
  });
});
