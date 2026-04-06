

# Fix Disciplinary "Issue Action" Button and Record Display

## Problem
The "Issue Action" button in the disciplinary form does not save records. The database table is empty, confirming inserts never succeed. RLS policies and foreign keys are correctly configured, so the issue is in the frontend code.

## Root Cause Analysis
After investigation, the RLS policies, table schema, foreign keys, and user roles all check out. The most likely cause is that the Supabase client insert silently returns an error that gets swallowed, or the button click event is not properly reaching the mutation. The `as any` type cast on `action_type` may also mask a type issue.

## Plan

### 1. Add robust error logging to the save mutation
**File: `src/components/hr/HRDisciplinary.tsx`**
- Add `console.error` logging in the `mutationFn` to capture the exact Supabase error
- Log the full payload before insert for debugging
- Ensure the error object's `message`, `details`, `hint`, and `code` fields are all captured in the toast

### 2. Fix potential `action_type` enum casting issue
**File: `src/components/hr/HRDisciplinary.tsx`**
- Remove the `as any` cast on `action_type` — instead, properly type the payload to match the `Database["public"]["Enums"]["disciplinary_action_type"]` type
- This ensures the value sent to Supabase exactly matches what the database enum expects

### 3. Add a `type="button"` to the Issue Action button
**File: `src/components/hr/HRDisciplinary.tsx`**
- Add explicit `type="button"` to prevent any implicit form submission behavior that could interfere with the `onClick` handler
- This is a common issue when buttons are inside Dialog components

### 4. Ensure records display immediately after insert
**File: `src/components/hr/HRDisciplinary.tsx`**
- After `invalidateQueries`, also call `refetchQueries` to force an immediate re-fetch
- Add a loading state on the table while refetching so the user sees feedback

### Files Changed
- `src/components/hr/HRDisciplinary.tsx` — fix mutation, button type, error logging, and refetch behavior

