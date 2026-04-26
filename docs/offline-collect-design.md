# Offline-Capable Agent Collections — Design Doc

**Status:** Draft for review (no code written yet)
**Owner:** Agent Operations + CFO sign-off required before build
**Scope target:** Field collection agents working in zero-data areas

---

## 1. Goals (what must work offline)

| Capability | Offline? | Notes |
|---|---|---|
| App opens from home screen with no data | Required | PWA shell |
| Agent's tenant list loads | Required | Read-only cache, last-synced |
| Per-tenant detail (rent due, balance, contact, history) | Required | Read-only cache |
| **"Collect Cash" button captures a collection** | **Required** | Saved to local queue; syncs when online |
| Receipt is generated for the tenant on the spot | Required | Local receipt number; provisional until synced |
| Float balance display | Read-only | Last-known value with "as of [time]" timestamp |
| Float approval (Financial Ops) | Online only | Per requirement — never offline |
| Float top-up requests by agent | Online only | Pipeline lives on server |
| Landlord payouts / withdrawals | Online only | Multi-stage approval, GPS verification |
| SMS to tenant | Sent at sync time | Server-side via Inngest |
| Wallet/ledger writes | Online only | DB enforces; happens at sync |
| Manager / CFO / Ops dashboards | Online only | Out of scope |

---

## 2. Hard constraints from existing platform rules

These are non-negotiable and shape the design:

1. **Wallet writes are locked at the DB.** `enforce_wallet_ledger_only` trigger blocks all wallet bucket UPDATEs unless `wallet.sync_authorized=true` is set inside an authorized session. A phone cannot debit a wallet directly. The server is the only writer, full stop.
2. **`apply_wallet_movement` is the sole writer.** Per project memory. Offline collection cannot bypass this.
3. **Ledger integrity.** `create_ledger_transaction` enforces double-entry (`SUM(cash_in) == SUM(cash_out)`). All ledger writes happen server-side.
4. **SMS is server-side.** Inngest queue dispatches tenant + agent SMS. Phones do not send SMS directly.
5. **Strict ledger category allowlist.** Offline drafts must carry an allowed category.

**Implication:** "Offline collection" really means **"offline capture + receipt + queue"**. The actual money movement (wallet float debit, ledger entry, SMS dispatch) always happens server-side, just delayed until the device reconnects.

This is a feature, not a limitation — it preserves financial correctness and audit integrity.

---

## 3. User experience offline

### Agent opens app with zero data
1. App loads from PWA cache (HTML/JS/CSS).
2. Banner at top: "Offline — last synced 2h ago".
3. Dashboard renders with cached data: float balance (read-only, with timestamp), tenant list, recent collections, pending sync count.
4. **Collect Cash button is enabled** (different visual state — outlined instead of solid, with a small cloud-off icon).

### Agent taps Collect Cash
1. Tenant picker opens — uses cached tenant list.
2. Standard collection form: amount, payment method (cash only offline), notes, GPS captured automatically.
3. On submit:
   - Generates a **client-side UUID** (`draft_id`) — this becomes the idempotency key.
   - Generates a **provisional receipt number**: `OFFL-{agent_short_id}-{local_counter}` (e.g. `OFFL-A47-00012`).
   - Saves to IndexedDB (`offline_collection_drafts` store).
   - Shows a receipt screen marked **"PROVISIONAL — awaiting sync"** that the agent can show the tenant or screenshot.
   - Tenant balance display in the cached view is updated optimistically (with a small "pending" badge).
   - Pending sync counter increments.

### Agent comes back online
1. App detects connectivity (`navigator.onLine` + heartbeat ping to a lightweight edge function).
2. Banner switches to "Syncing 3 collections…".
3. Drafts submit one-by-one to the new edge function `submit-offline-collection`.
4. For each draft, server returns one of:
   - `accepted` → draft removed from queue, real receipt number stored, real SMS dispatched, optimistic balance reconciled.
   - `rejected_duplicate` → draft removed silently (already submitted earlier).
   - `rejected_validation` (tenant invalid, amount invalid, agent suspended, etc.) → draft moved to **"Needs attention"** list with reason; toast + escalation row created.
   - `rejected_no_float` → see Section 5 (float policy).
5. Banner switches to "All synced — last synced just now".

### Agent never reconnects within 24h
- Draft auto-flagged `stale_unsynced` locally.
- On next sync, server creates an `agent_escalations` row (table exists) for manager review even if the draft is otherwise valid.
- Why: stale offline collections are a fraud signal and an audit concern.

---

## 4. Data model

### Client-side (IndexedDB)
```
stores:
  cached_tenants:        keyed by tenant_id, value = full tenant snapshot + cached_at
  cached_float:          singleton { balance, limit, cached_at }
  cached_recent_collections: last 50 entries
  offline_drafts:        keyed by draft_id (UUID v4)
    {
      draft_id, agent_id, tenant_id, amount, payment_method,
      notes, gps_lat, gps_lng, gps_accuracy,
      provisional_receipt_no, captured_at,
      status: 'queued' | 'syncing' | 'rejected' | 'needs_attention',
      attempts, last_error, last_attempted_at
    }
  sync_meta:             singleton { last_full_sync_at, agent_id, schema_version }
```

### Server-side (new tables)

**`offline_collection_drafts`** (audit trail of every offline submission, even rejected ones):
- `draft_id` UUID PRIMARY KEY (the client UUID — enforces idempotency)
- `agent_id`, `tenant_id`, `amount`, `payment_method`
- `captured_at` (when the agent pressed Collect, NOT when synced)
- `synced_at`, `provisional_receipt_no`
- `gps_lat`, `gps_lng`, `gps_accuracy`
- `status` ENUM: `accepted` | `rejected_duplicate` | `rejected_validation` | `rejected_no_float` | `flagged_stale`
- `rejection_reason`
- `linked_collection_id` (if accepted, points to `agent_collections.id`)
- `linked_escalation_id` (if flagged)

RLS: agent reads own; Agent Ops reads all; Financial Ops reads all.

**Indexes:** `(agent_id, captured_at desc)`, `(status)`, `(synced_at)`.

### Schema additions to existing tables

- `agent_collections.draft_id UUID NULL UNIQUE` — links a real collection back to its offline draft (null for online collections). The unique constraint is the second layer of idempotency.
- `agent_collections.was_offline BOOLEAN DEFAULT false` — for reporting.
- `agent_collections.captured_at TIMESTAMPTZ` — true field timestamp (vs `created_at` which is sync time).

---

## 5. Float policy (per your requirement)

You said: **"agents side… should work offline, but float approval on financial ops should require internet."**

That means:
- **Float top-up requests:** online only. The agent cannot submit a top-up request offline.
- **Float balance check at capture time:** the offline app shows the **last-known float**. It does NOT decrement it locally during offline capture. The server validates float at sync time.
- **What if server float is exhausted at sync?**
  - `rejected_no_float` is returned.
  - Draft moves to "Needs attention" with the message: *"Float was exhausted before this collection synced. Top up float and resubmit."*
  - The agent has the cash physically. They MUST hold it and contact Operations.
  - An `agent_escalations` row is auto-created (severity: `high`).
  - Daily report to Agent Ops + CFO of `rejected_no_float` events.

**Recommended guardrails (CFO sign-off needed):**

| Guardrail | Default | Configurable? |
|---|---|---|
| Per-collection cap offline | UGX 500,000 | Per-agent override |
| Daily offline collection cap | UGX 2,000,000 | Per-agent override |
| Max offline drafts queued at once | 20 | Hard-coded |
| Stale draft escalation threshold | 24 hours | Hard-coded |
| GPS required offline | Yes | Yes (CFO can disable per agent) |

These caps are **client-enforced** with a server-side hard ceiling. They reduce blast radius if an agent's phone is lost/stolen or the agent acts in bad faith.

---

## 6. Idempotency & duplicate prevention (the critical part)

Three layers stop double-collection:

1. **Client UUID (`draft_id`):** generated once at capture time, persisted in IndexedDB, sent on every retry.
2. **DB unique constraint** on `offline_collection_drafts.draft_id` and `agent_collections.draft_id`.
3. **Edge function `submit-offline-collection`:** wraps insert in a transaction. If `draft_id` already exists → returns the prior result instead of double-inserting.

Edge function pseudocode:
```ts
// pseudo, not for production
const existing = await db.from('offline_collection_drafts')
  .select('*').eq('draft_id', body.draft_id).maybeSingle();
if (existing) return { result: existing.status, ...existing };

// validate: tenant exists, agent active, amount valid, GPS plausible
// validate: server-side float available
// call apply_wallet_movement -> create_ledger_transaction -> enqueue Inngest SMS
// insert into offline_collection_drafts (status: accepted)
//   AND agent_collections (with draft_id, was_offline=true, captured_at)
// return { result: 'accepted', collection_id, real_receipt_no }
```

---

## 7. Receipt strategy

**Provisional receipt (offline):**
- Format: `OFFL-{agent3char}-{counter5digit}` (e.g. `OFFL-A47-00012`)
- Counter is per-agent, persisted in IndexedDB, monotonic.
- Receipt screen displays: "PROVISIONAL — sync pending" watermark, amount, tenant name, captured_at, GPS coords, agent name + ID.
- Agent can screenshot or show on screen. (No printer in scope.)

**Final receipt (post-sync):**
- Server assigns the canonical receipt number (existing logic).
- App replaces the provisional receipt with the final one in the local cache.
- Tenant SMS goes out at sync time, citing the **captured_at** timestamp ("Payment received on 26 Apr 14:32").

**Reconciliation report (Agent Ops):**
- Daily report mapping `provisional_receipt_no` -> final `agent_collections.id` for every offline draft.
- Flags: provisional receipts that never synced after 24h, mismatched amounts (none expected — but defensive), stale escalations.

---

## 8. Sync engine details

- **Trigger:** `online` event, app foreground, manual "Sync now" button, periodic 30s heartbeat while online.
- **Order:** drafts synced oldest-first (FIFO by `captured_at`).
- **Backoff:** exponential on transient errors (network, 5xx). 1s -> 2s -> 4s -> ... -> 60s max.
- **Concurrency:** one draft at a time per agent (avoid race conditions on float).
- **Atomicity:** each draft is independent; one failure doesn't block the queue (it's marked `needs_attention` and the queue moves on).
- **Cache refresh:** after queue drains, app fetches latest float + tenant list + recent collections to refresh the read-only cache.

---

## 9. PWA shell rules (Lovable-specific)

Per platform PWA rules:
- `vite-plugin-pwa` with `devOptions.enabled = false` (don't break the editor preview).
- Service worker registration **guarded against iframes and Lovable preview hosts** (preview won't register the SW).
- `/~oauth` excluded from `navigateFallbackDenylist`.
- Manifest with `display: standalone`, app icons (512/192/180), proper `start_url`.
- Static assets cached. **Supabase API calls NOT cached** (always go to network or fail).
- IndexedDB used for offline data, not the SW cache (cleaner separation, easier to audit).

---

## 10. Security considerations

| Risk | Mitigation |
|---|---|
| Lost/stolen phone with queued drafts | Drafts encrypted at rest in IndexedDB using a key derived from the agent's session + a server-issued device key. App requires PIN unlock on cold start (existing inactivity-lock pattern). |
| Agent collects cash, never syncs, pockets money | 24h stale draft -> mandatory escalation. Daily Agent Ops report. Per-agent daily cap limits exposure. |
| Replay attack (reused draft_id) | DB unique constraint + idempotent edge function returns prior result, no double-credit possible. |
| Tampered draft (agent edits IndexedDB to bump amount) | GPS + captured_at + signed device JWT bundled with each draft submission. Server can detect altered timestamps. **Note:** full tamper-proofing requires native app (Capacitor) — PWA can be reverse-engineered. Document this risk for CFO. |
| Two devices, same agent | Server-side enforcement: only the most recent active device's drafts accepted. Older device's drafts rejected with `rejected_device_invalidated`. |
| Float exhausted between capture and sync | `rejected_no_float` -> mandatory escalation, agent holds cash physically. |

**The tamper risk is the one that warrants Capacitor.** A web PWA's IndexedDB is inspectable. If the CFO is uncomfortable with that, we wrap the PWA in Capacitor and use native secure storage.

---

## 11. What's explicitly OUT of scope

- Offline landlord payouts
- Offline float top-up requests
- Offline tenant onboarding/registration
- Offline agent-to-agent transfers
- Manager/Ops/CFO dashboards working offline
- Native push notifications (PWA only — limited)
- Offline edits/reversals of synced collections

---

## 12. Phased build plan

| Phase | Scope | Risk | Estimate |
|---|---|---|---|
| **0 (this doc)** | Design + CFO sign-off on float caps & escalation rules | None | — |
| **1** | PWA shell + read-only cache (tenant list, float, recent collections). Collect button **disabled offline**. | Low | 1 day |
| **2** | DB schema (`offline_collection_drafts` + columns on `agent_collections`), edge function `submit-offline-collection` with idempotency, RLS, unit tests. | Medium | 1.5 days |
| **3** | Client-side: IndexedDB store, draft capture flow, provisional receipt screen, sync engine, "Pending sync" UI. | Medium | 2 days |
| **4** | Stale draft escalation, "Needs attention" list, manager reconciliation report, CFO daily summary. | Medium | 1 day |
| **5** | (Optional) Capacitor wrapper + secure storage for tamper resistance. | Low (additive) | 1 day |

**Total Phases 1–4: ~5.5 days of focused work.** Phase 5 is recommended but can ship later.

---

## 13. Open questions for CFO / Ops sign-off

1. **Per-collection offline cap:** UGX 500K — acceptable?
2. **Daily offline cap per agent:** UGX 2M — acceptable?
3. **Max queued drafts:** 20 — acceptable?
4. **Stale escalation threshold:** 24h — should it be shorter (12h)? Longer?
5. **`rejected_no_float` policy:** Agent holds cash and waits for top-up, OR is the cash automatically reclassified as a "personal float advance" the agent owes? (Affects ledger flow.)
6. **Tamper resistance:** PWA-only acceptable, or do we need Capacitor for production?
7. **Multi-device:** Force single-device-per-agent, or allow multiple but reconcile on server?
8. **Receipt SMS timing:** Send at sync time with `captured_at` reference, or send a "we received your payment record, confirmation pending" SMS to the tenant first, then a final one on sync?

---

## 14. Recommendation

**Build Phase 1 first** as a standalone deliverable. It solves the "app won't open" problem with zero financial risk.

Get CFO sign-off on Section 13 questions **before** building Phases 2–4.

Phase 5 (Capacitor) should be on the roadmap regardless, because the tamper risk is real for any meaningful offline-write feature.

---

*End of design doc. No code changes have been made.*
