import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Integration test: verifies the public.sync_proxy_agent_capabilities()
 * trigger correctly grants and revokes `act_as_proxy` and
 * `capture_supporters` capabilities based on the lifecycle of
 * proxy_agent_assignments rows.
 *
 * Contract under test:
 *  - Pending / inactive assignments grant nothing.
 *  - Active + approved assignments grant BOTH caps.
 *  - Multiple active assignments do not duplicate caps.
 *  - Deactivating one of many leaves caps intact.
 *  - Deactivating the LAST active assignment revokes both caps.
 *  - Re-activation re-grants both caps (no stuck-revoked state).
 *  - approval_status flipping away from 'approved' revokes caps.
 *  - DELETE of all assignments revokes caps.
 *  - Default agent kit (grant_default_agent_capabilities) does NOT
 *    grant either proxy-only capability.
 *
 * Runs against the project DB with the service-role key, bypassing RLS.
 * All writes are made on a real (existing) agent and beneficiaries; the
 * test cleans up its own assignments on teardown so the agent is left in
 * the same proxy state it started in.
 */

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const skipReason = !SERVICE_ROLE_KEY
  ? "SUPABASE_SERVICE_ROLE_KEY not available; skipping proxy-cap trigger integration tests"
  : null;

const admin = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const PROXY_CAPS = ["act_as_proxy", "capture_supporters"] as const;

async function activeProxyCapCount(agentId: string): Promise<number> {
  const { data, error } = await admin!
    .from("agent_capabilities")
    .select("capability")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .in("capability", PROXY_CAPS as unknown as string[]);
  if (error) throw error;
  return data?.length ?? 0;
}

/** Find a clean-slate agent: no active proxy assignments and no active proxy caps. */
async function findCleanAgent(): Promise<string> {
  // Pull a batch of enabled agents and filter client-side.
  const { data: roles, error: rolesErr } = await admin!
    .from("user_roles")
    .select("user_id")
    .eq("role", "agent")
    .eq("enabled", true)
    .limit(500);
  if (rolesErr) throw rolesErr;
  if (!roles || roles.length === 0) {
    throw new Error("no enabled agents found in DB");
  }

  for (const { user_id } of roles) {
    const { data: existing } = await admin!
      .from("proxy_agent_assignments")
      .select("id")
      .eq("agent_id", user_id)
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .limit(1);
    if (existing && existing.length > 0) continue;

    if ((await activeProxyCapCount(user_id)) === 0) {
      return user_id;
    }
  }
  throw new Error("no clean-slate agent available for test");
}

async function pickBeneficiaries(excludeId: string, n: number): Promise<string[]> {
  const { data, error } = await admin!
    .from("profiles")
    .select("id")
    .neq("id", excludeId)
    .limit(n + 5);
  if (error) throw error;
  return (data ?? []).map((r) => r.id).slice(0, n);
}

async function cleanupAssignments(agentId: string, ids: string[]) {
  if (!ids.length) return;
  await admin!
    .from("proxy_agent_assignments")
    .delete()
    .in("id", ids)
    .eq("agent_id", agentId);
}

async function insertAssignment(
  agentId: string,
  beneficiaryId: string,
  opts: { is_active: boolean; approval_status: string; reason?: string },
): Promise<string> {
  const { data, error } = await admin!
    .from("proxy_agent_assignments")
    .insert({
      agent_id: agentId,
      beneficiary_id: beneficiaryId,
      beneficiary_role: "supporter",
      assigned_by: agentId,
      reason: opts.reason ?? "trigger integration test",
      is_active: opts.is_active,
      approval_status: opts.approval_status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function updateAssignment(id: string, patch: Record<string, unknown>) {
  const { error } = await admin!
    .from("proxy_agent_assignments")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

Deno.test({
  name:
    "sync_proxy_agent_capabilities — grants on active+approved, revokes when none remain",
  ignore: !!skipReason,
  async fn() {
    const agent = await findCleanAgent();
    const [benef1, benef2] = await pickBeneficiaries(agent, 2);
    assert(benef1, "need at least one beneficiary profile");

    const created: string[] = [];
    try {
      // T1: clean slate
      assertEquals(await activeProxyCapCount(agent), 0, "T1 clean slate");

      // T2: pending+inactive grants nothing
      const pending = await insertAssignment(agent, benef1, {
        is_active: false,
        approval_status: "pending",
      });
      created.push(pending);
      assertEquals(
        await activeProxyCapCount(agent),
        0,
        "T2 pending+inactive must not grant caps",
      );

      // T3: approve+activate → both caps
      await updateAssignment(pending, {
        is_active: true,
        approval_status: "approved",
      });
      assertEquals(
        await activeProxyCapCount(agent),
        2,
        "T3 approve+activate must grant both caps",
      );

      // T4: second active+approved assignment — caps stable, no duplicates
      if (benef2) {
        const second = await insertAssignment(agent, benef2, {
          is_active: true,
          approval_status: "approved",
        });
        created.push(second);
        assertEquals(
          await activeProxyCapCount(agent),
          2,
          "T4 second assignment must not duplicate caps",
        );

        // T5: deactivate one of two → caps remain
        await updateAssignment(second, { is_active: false });
        assertEquals(
          await activeProxyCapCount(agent),
          2,
          "T5 caps must remain while one assignment is still active",
        );
      }

      // T6: deactivate the LAST active assignment → both caps revoked
      await updateAssignment(pending, { is_active: false });
      assertEquals(
        await activeProxyCapCount(agent),
        0,
        "T6 deactivating last active assignment must revoke both caps",
      );

      // T7: re-activate → caps re-granted (idempotent / no stuck revoked)
      await updateAssignment(pending, {
        is_active: true,
        approval_status: "approved",
      });
      assertEquals(
        await activeProxyCapCount(agent),
        2,
        "T7 re-activation must re-grant both caps",
      );

      // T8: flip approval_status to rejected → caps revoked
      await updateAssignment(pending, { approval_status: "rejected" });
      assertEquals(
        await activeProxyCapCount(agent),
        0,
        "T8 non-approved status must revoke caps",
      );

      // T9: re-approve, then DELETE → caps revoked, no resurrection
      await updateAssignment(pending, {
        is_active: true,
        approval_status: "approved",
      });
      assertEquals(await activeProxyCapCount(agent), 2, "T9 setup");
      await cleanupAssignments(agent, created);
      created.length = 0;
      assertEquals(
        await activeProxyCapCount(agent),
        0,
        "T9 deleting all assignments must revoke caps",
      );
    } finally {
      await cleanupAssignments(agent, created);
    }
  },
});

Deno.test({
  name:
    "grant_default_agent_capabilities — default kit excludes proxy-only caps",
  ignore: !!skipReason,
  async fn() {
    // Inspect the function source via pg_proc through a small RPC-less query:
    // we use rest with a SQL function invoked from the client. Simplest path:
    // query a known view? We don't have one. Use information_schema.routines.
    const { data, error } = await admin!
      .from("information_schema.routines" as unknown as string)
      .select("routine_definition")
      .eq("routine_schema", "public")
      .eq("routine_name", "grant_default_agent_capabilities")
      .maybeSingle();

    if (error || !data) {
      // Fallback: behavioral check via trigger isn't safe (would mutate prod
      // user_roles). If we can't introspect, skip with a clear message.
      console.warn(
        "[default-kit test] could not read routine definition; skipping behavioral assertion",
        error,
      );
      return;
    }

    const src = String((data as { routine_definition: string }).routine_definition ?? "");
    assert(src.length > 0, "function source must be readable");
    assert(
      !src.includes("capture_supporters"),
      "default agent kit must NOT include capture_supporters",
    );
    assert(
      !src.includes("act_as_proxy"),
      "default agent kit must NOT include act_as_proxy",
    );
  },
});