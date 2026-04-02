import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Log a system event via the log_system_event RPC.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function logSystemEvent(
  adminClient: SupabaseClient,
  eventType: string,
  userId: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await adminClient.rpc("log_system_event", {
      p_event_type: eventType,
      p_user_id: userId,
      p_related_entity_type: entityType ?? null,
      p_related_entity_id: entityId ?? null,
      p_metadata: metadata ?? {},
    });
  } catch (err) {
    console.error(`[eventLogger] Failed to log ${eventType}:`, err);
  }
}
