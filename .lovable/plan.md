

# Fix: `/cfo` Route Returns 404

## Problem
The previous change set the Agent Advances back button to `navigate('/cfo')`, but no route exists at `/cfo`. The correct route is `/cfo-dashboard` (legacy) or `/cfo/dashboard`.

## Change

**File: `src/pages/AgentAdvances.tsx`**

Change the back button navigation from `navigate('/cfo')` to `navigate('/cfo-dashboard')`.

