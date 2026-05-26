# Mobile UI & Interaction Fixes (May 26, 2026)

This document outlines the changes made to fix button unresponsiveness, UI event locking, and touch interaction bugs on both iOS and Android devices, specifically targeting the Agent "Allocate Payment" flow.

## 1. Radix UI Nested Modal Event Lock (`AgentTenantCollectDialog.tsx`)

**The Problem:**
When opening a `Dialog` (the payment allocation popup) on top of an active `Sheet` (the tenant list side-panel), Radix UI aggressively adds `pointer-events: none` to the document body to lock user focus. On mobile touchscreens (iOS Safari and Android Chrome), this lock can bleed into the new popup, rendering all buttons inside it (like "Review" or "Confirm") completely unclickable (dead taps).

**The Solution:**
Explicitly force pointer events to be enabled on the dialog content and override the Radix interaction locks so the popup cannot be silenced by the parent sheet.

**The Changes in `src/components/agent/AgentTenantCollectDialog.tsx`:**
* Added the `pointer-events-auto` utility class to the `<DialogContent>` component.
* Attached `onInteractOutside={(e) => e.preventDefault()}` to bypass auto-close bugs.
* Attached `onPointerDownOutside={(e) => e.preventDefault()}` to stabilize the nested portal.

## 2. CSS Stacking Context on Mobile (`AgentTenantsSheet.tsx`)

**The Problem:**
The "Collect Payment" button inside the tenant sheet was sitting in a scrollable view without a strict z-index. On mobile screens, transparent container bounds, sticky footer backgrounds, or iOS safe-area paddings can invisibly overlap the button's hit-box, swallowing the user's tap.

**The Solution:**
Elevate the button explicitly within the CSS stacking context so it always remains the topmost tap target.

**The Changes in `src/components/agent/AgentTenantsSheet.tsx`:**
* Added `relative` and `z-20` to the **Collect Payment** `<button>` className.
* Added `cursor-pointer` to force older versions of iOS Safari to recognize the element as a strict tap target.

## 3. DOM Nesting / Hydration Fix (`AgentTenantsSheet.tsx`)

**The Problem:**
The outer clickable row for each tenant was implemented as a `<button>` element. However, when expanded, this row contained other interactive buttons (like Call, WhatsApp, PDF). Browsers strictly forbid putting a `<button>` inside another `<button>`. When this happens, mobile browsers will often aggressively eject the nested buttons from the DOM or silently break their event listeners.

**The Solution:**
Convert the outer container to an accessible semantic div.

**The Changes in `src/components/agent/AgentTenantsSheet.tsx`:**
* Changed the outer `<button>` wrapping the tenant row to a `<div role="button" tabIndex={0}>`.
* Retained the `onClick` handler and added an `onKeyDown` handler to preserve keyboard accessibility for desktop users.
