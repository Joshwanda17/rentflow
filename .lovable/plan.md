

# Fix `log_system_event` Function Signature Mismatch

## Problem

The `reject-withdrawal` edge function (and likely others) fails with:
```
function public.log_system_event(system_event_type, uuid, unknown, text, jsonb) does not exist
```

The database function expects `p_related_entity_id` as `UUID`, but PostgREST/RPC passes it as `TEXT`. PostgreSQL can't resolve the implicit cast, causing a "function does not exist" error.

## Fix

Run a single migration to recreate the `log_system_event` function with `p_related_entity_id` typed as `TEXT` instead of `UUID`, and cast it to UUID internally before inserting into `system_events`. This makes the function compatible with all callers (edge functions via RPC and database triggers).

### Migration SQL

```sql
CREATE OR REPLACE FUNCTION public.log_system_event(
  p_event_type system_event_type,
  p_user_id UUID,
  p_related_entity_type TEXT DEFAULT NULL,
  p_related_entity_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.system_events (event_type, user_id, related_entity_type, related_entity_id, metadata)
  VALUES (p_event_type, p_user_id, p_related_entity_type, p_related_entity_id::UUID, p_metadata)
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;
```

### Files Modified
- **Database migration only** — no code file changes needed

