/**
 * End-to-end style regression test for the iPhone "app refreshed
 * during my OTP" bug.
 *
 * Reproduces the real Martin scenario:
 *  1. An agent opens a payout / collection wizard.
 *  2. The wizard registers itself with `setCriticalFlowActive` so the
 *     mobile cache layer knows a critical flow is in flight.
 *  3. The user enters partial wizard state (OTP digits, notes), then
 *     dips into another app (MoMo USSD, SMS, etc.) — iOS fires
 *     `visibilitychange` (hidden → visible), `pageshow`, `focus`,
 *     `online` in rapid succession when they come back.
 *  4. The wizard MUST still be mounted with its draft state intact.
 *     The cache layer MUST NOT have invalidated React Query or hot-
 *     swapped the service worker.
 *
 * A separate negative-control test confirms that with NO critical
 * flow active, the cache layer DOES invalidate — proving the guard is
 * what protects the wizard, not just a quiet code path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useEffect, useState } from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  setCriticalFlowActive,
  isCriticalFlowActive,
} from "@/lib/criticalFlowGuard";

// Mock supabase so the hook can mount in jsdom
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({})),
    rpc: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    }),
    removeChannel: () => {},
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Pretend this is Martin's iPhone in standalone PWA mode
beforeEach(() => {
  Object.defineProperty(window.navigator, "userAgent", {
    value:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    configurable: true,
  });
  (window.navigator as any).standalone = true;
});

// --- Tiny stand-in for the real payout wizard ------------------------------
// It mirrors the two things that matter for this test: it registers the
// critical-flow guard while open, and it holds local draft state (the
// "OTP" the user is typing) which would be lost if the wizard unmounted.
function PayoutWizard({ open }: { open: boolean }) {
  const [otp, setOtp] = useState("");
  useEffect(() => {
    if (!open) return;
    setCriticalFlowActive("agent-float-payout", true);
    return () => setCriticalFlowActive("agent-float-payout", false);
  }, [open]);
  if (!open) return null;
  return (
    <div data-testid="wizard">
      <input
        data-testid="otp-input"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
      />
      <div data-testid="otp-echo">OTP: {otp}</div>
    </div>
  );
}

async function importCacheHook() {
  const mod = await import("@/hooks/useIOSCacheInvalidation");
  return mod.useIOSCacheInvalidation;
}

function Harness({ open }: { open: boolean }) {
  const [useHook, setHook] =
    useState<null | ((...args: any[]) => any)>(null);
  useEffect(() => {
    importCacheHook().then((h) => setHook(() => h));
  }, []);
  return (
    <>
      {useHook ? <HookProbe useHook={useHook} /> : null}
      <PayoutWizard open={open} />
    </>
  );
}

function HookProbe({ useHook }: { useHook: any }) {
  useHook();
  return null;
}

function fireBackgroundForegroundCycle() {
  // Background
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));

  // Foreground — every event iOS Safari fires in rapid sequence
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(
    new PageTransitionEvent("pageshow", { persisted: true }),
  );
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("online"));
}

describe("iPhone background/foreground during OTP", () => {
  it("preserves wizard state and skips cache invalidation while the wizard is open", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const refetchSpy = vi.spyOn(qc, "refetchQueries");
    const clearSpy = vi.spyOn(qc, "clear");

    const user = userEvent.setup();
    render(
      <QueryClientProvider client={qc}>
        <Harness open={true} />
      </QueryClientProvider>,
    );

    // Wait for the lazy-imported hook to attach its listeners
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Sanity: the guard sees the wizard
    expect(isCriticalFlowActive()).toBe(true);

    // Agent types part of the OTP
    const input = screen.getByTestId("otp-input") as HTMLInputElement;
    await user.type(input, "1234");
    expect(screen.getByTestId("otp-echo").textContent).toBe("OTP: 1234");

    // iPhone background → foreground
    await act(async () => {
      fireBackgroundForegroundCycle();
      await new Promise((r) => setTimeout(r, 50));
    });

    // 1. Wizard is still mounted with its draft state
    expect(screen.getByTestId("wizard")).toBeInTheDocument();
    expect((screen.getByTestId("otp-input") as HTMLInputElement).value).toBe(
      "1234",
    );
    expect(screen.getByTestId("otp-echo").textContent).toBe("OTP: 1234");

    // 2. Cache layer stood down — no invalidate, no refetch, no clear
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(refetchSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it("negative control: with NO critical flow active, the cache layer DOES refetch", async () => {
    // Make sure no leftover flag from a sibling test
    setCriticalFlowActive("agent-float-payout", false);
    setCriticalFlowActive("agent-tenant-collect", false);
    expect(isCriticalFlowActive()).toBe(false);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const refetchSpy = vi.spyOn(qc, "refetchQueries");
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(
      <QueryClientProvider client={qc}>
        <Harness open={false} />
      </QueryClientProvider>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      fireBackgroundForegroundCycle();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Cache layer is allowed to refresh when no critical flow is open.
    // (We don't assert exact counts — only that *some* refresh happened,
    // which is what proves the guard in the first test is what spared
    // the wizard, not just a dormant code path.)
    expect(
      refetchSpy.mock.calls.length + invalidateSpy.mock.calls.length,
    ).toBeGreaterThan(0);
  });
});
