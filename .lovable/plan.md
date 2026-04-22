

## Re-label "Landlord Float" so the source is unambiguous

### Correct mental model (locked)
`agent_landlord_float.balance` = **CFO-disbursed MoMo float** sent to the agent so they can pay landlords via mobile money on Welile's behalf. It is **company money in the agent's hands**, not tenant collections, not the agent's earnings.

### Single change — copy only, on `AgentLandlordFloatCard.tsx`

Update the card body so an agent reading it knows in 2 seconds: *Welile gave me this money; I must spend it on landlord MoMo payouts.*

| Element | Now | Change to |
|---|---|---|
| Top label | `LANDLORD FLOAT` | `LANDLORD PAYOUT FLOAT` |
| Empty-state title | `Pay Landlord via MoMo` | `Pay Landlord via MoMo` *(unchanged)* |
| Subtext (with balance) | `Ring-fenced for landlord payouts — not your money` | `Sent by Welile CFO · spend only on landlord MoMo payouts` |
| Subtext (no balance) | `Withdraw from float → Pay landlord → Upload receipt + GPS` | `CFO will fund this when a landlord payout is due. Pay landlord → Upload receipt + GPS` |

Everything else (the Pay button, Recovery / Status / History strip, balance number, query keys, hooks) stays exactly as-is.

### Files touched
- `src/components/agent/AgentLandlordFloatCard.tsx` — text-only changes to 3 strings.

### Not changing
- No other "Float" surface (Wallet 3-bucket model, WithdrawFlow, AgentFloatBalanceCard, DepositFlow, Top-Up dialog) is touched. Those refer to `wallets.float_balance` and are a separate concept handled elsewhere.
- No backend, hook, schema, or query change.
- No new info line, no second balance shown.

### Acceptance
On `/dashboard` for an agent, the card reads:
> **LANDLORD PAYOUT FLOAT**
> USh 0
> *Sent by Welile CFO · spend only on landlord MoMo payouts*
> [Pay →]   Recovery · Status · History

