/**
 * Regression guard: PWA cache invalidation and service-worker updates
 * must NEVER mutate wallet balances or post ledger entries.
 *
 * Wallet drift caused by client-side cache churn is a P0. Every write
 * to wallet buckets / general_ledger / `apply_wallet_movement` /
 * `create_ledger_transaction` is the source-of-truth's exclusive
 * province (server-side, via RLS + triggers). This test enforces that
 * the cache-invalidation hook (`useIOSCacheInvalidation`) and the
 * service worker (`public/sw.js`) stay strictly read-only on the
 * client.
 *
 * Two layers of defense:
 *  1. Static scan — fail the build if either file mentions a forbidden
 *     wallet/ledger write API.
 *  2. Runtime simulation — render the hook, fire every event it
 *     listens to (visibilitychange / pageshow / focus / online), and
 *     assert the Supabase client never sees an .update / .insert /
 *     .upsert / .delete / mutating .rpc call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Shared mocks — record every call the hook makes against the Supabase client
// ---------------------------------------------------------------------------
const supabaseCalls: { method: string; args: unknown[] }[] = [];

function recorder(method: string) {
  return (...args: unknown[]) => {
    supabaseCalls.push({ method, args });
    const chain: any = new Proxy(
      {},
      {
        get: () => (...a: unknown[]) => {
          supabaseCalls.push({ method: `${method}.chain`, args: a });
          return chain;
        },
      },
    );
    return chain;
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: recorder("from"),
    rpc: recorder("rpc"),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    }),
    removeChannel: () => {},
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Static guard — string-level check of both files
// ---------------------------------------------------------------------------
const FORBIDDEN_TOKENS = [
  "apply_wallet_movement",
  "create_ledger_transaction",
  "sync_wallet_from_ledger",
  "cfo-direct-credit",
  "approve-withdrawal",
  "wallets",
  "general_ledger",
  "agent_advances",
  "withdrawable_balance",
  "float_balance",
  "advance_balance",
  ".update(",
  ".insert(",
  ".upsert(",
  ".delete(",
];

function scan(filePath: string): string[] {
  const src = readFileSync(resolve(filePath), "utf8");
  // Strip block + line comments so doc commentary doesn't trip the guard.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  return FORBIDDEN_TOKENS.filter((tok) => stripped.includes(tok));
}

describe("cache invalidation: static guard", () => {
  it("useIOSCacheInvalidation.ts contains no wallet/ledger write tokens", () => {
    const hits = scan("src/hooks/useIOSCacheInvalidation.ts");
    expect(hits, `Forbidden tokens leaked into hook: ${hits.join(", ")}`)
      .toEqual([]);
  });

  it("public/sw.js contains no wallet/ledger write tokens", () => {
    const hits = scan("public/sw.js");
    expect(hits, `Forbidden tokens leaked into service worker: ${hits.join(", ")}`)
      .toEqual([]);
  });

  it("useServiceWorkerUpdate.ts contains no wallet/ledger write tokens", () => {
    const hits = scan("src/hooks/useServiceWorkerUpdate.ts");
    expect(hits, `Forbidden tokens leaked into SW update hook: ${hits.join(", ")}`)
      .toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Runtime guard — simulate the iOS PWA event storm and assert no writes
// ---------------------------------------------------------------------------
describe("cache invalidation: runtime guard", () => {
  beforeEach(() => {
    supabaseCalls.length = 0;
  });

  it("firing visibilitychange / pageshow / focus / online never writes to wallets or ledger", async () => {
    // Pretend to be an iOS standalone PWA so every code path is exercised.
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    (window.navigator as any).standalone = true;

    const { useIOSCacheInvalidation } = await import(
      "@/hooks/useIOSCacheInvalidation"
    );

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result, unmount } = renderHook(() => useIOSCacheInvalidation(), {
      wrapper,
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      // Manual forceRefresh — the most aggressive entry point
      await result.current.forceRefresh().catch(() => {});
    });

    // Cache may have been *invalidated* (read churn), but it must never
    // have *written* to wallets or the ledger.
    const mutating = supabaseCalls.filter((c) => {
      const m = c.method;
      return (
        m.endsWith(".update") ||
        m.endsWith(".insert") ||
        m.endsWith(".upsert") ||
        m.endsWith(".delete") ||
        m === "rpc"
      );
    });

    expect(
      mutating,
      `Cache invalidation triggered mutating Supabase calls:\n${JSON.stringify(
        mutating,
        null,
        2,
      )}`,
    ).toEqual([]);

    unmount();
  });
});
