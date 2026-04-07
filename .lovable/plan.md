

# Fix: Make Agent Advance Detail Page Scrollable

## Problem
The root container on `src/pages/AgentAdvanceDetail.tsx` (line 76) uses `min-h-screen` but lacks overflow scrolling, making the page static when content exceeds the viewport.

## Change

**File: `src/pages/AgentAdvanceDetail.tsx`** — Line 76

Change:
```tsx
<div className="min-h-screen bg-background">
```
To:
```tsx
<div className="min-h-screen bg-background overflow-y-auto h-screen">
```

This matches the same scrollability pattern applied to the admin dashboard.

