import { test, expect, devices } from '@playwright/test';

/**
 * Visual regression: the shared EntityDetailSheet (landlord profile) must
 * always paint ABOVE the find-house / rent-request Dialog on mobile.
 *
 * Regression guard for the z-index fix where the sheet (z-[160]/overlay
 * z-[155]) outranks the dialog (z-[150]/overlay z-[140]).
 *
 * We render the dedicated dev-only harness at /__e2e/landlord-sheet-stacking
 * so the snapshot is deterministic (no live data / network).
 *
 * First run creates the baseline:
 *   bunx playwright test landlord-sheet-stacking.visual --update-snapshots
 */

const MOBILE_VIEWPORTS = [
  { name: 'iphone-12', ...devices['iPhone 12'].viewport },
  { name: 'pixel-5', ...devices['Pixel 5'].viewport },
  { name: 'small-360', width: 360, height: 740 },
];

for (const vp of MOBILE_VIEWPORTS) {
  test(`landlord sheet stacks above find-house dialog — ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/__e2e/landlord-sheet-stacking');

    // The bottom sheet (Radix dialog role) carries the landlord title.
    const sheet = page.getByRole('dialog').filter({ hasText: 'Jane Landlord' });
    await expect(sheet).toBeVisible();
    // Sheet content (full-screen on mobile) must be on top — its title visible.
    await expect(sheet.getByText('Jane Landlord')).toBeVisible();
    await expect(sheet.getByText('UGX 300,000')).toBeVisible();
    // The Close affordance only renders in the full-screen mobile branch.
    await expect(sheet.getByRole('button', { name: /close profile/i })).toBeVisible();

    // Settle animations before snapshotting.
    await page.waitForTimeout(400);

    await expect(page).toHaveScreenshot(`landlord-sheet-over-dialog-${vp.name}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });
}