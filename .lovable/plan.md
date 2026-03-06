## Plan: Reconcile Tenant Balances & Revise Agent Commission

Based on the audit findings, here's what needs to be done:

### 1. Clarifications Needed

Before making changes, several discrepancies need your input:

- **Kayemba Henry (235,968) & Magoma Adam (266,040)**: System shows both as fully repaid. Are these new/upcoming obligations not yet in the system?
- **Ottai Abraham (768,000)**: Not registered. Need full details (phone, property) to create profile and rent request with weekly deduction schedule.
- **Mutamba Rodgers**: Exclude from auto-deductions -- this means pausing his subscription or marking inactive. Confirm approach.
- **Kiggundu Akram's commission**: Currently 5%. What should it be revised to?

### 2. Data Corrections (once clarified)

- Update `amount_repaid` on relevant rent requests if figures are stale
- Register Ottai Abraham and create rent request (768,000) with weekly deduction flag
- Pause Mutamba Rodgers' auto-charge cycle
- Adjust agent commission rate for Akram (requires code change to the commission calculation trigger or a per-agent rate override)

### 3. Technical Implementation

- **Commission revision**: The current system applies a flat 5% commission via the `credit_agent_management_fee` trigger. To revise per-agent, we'd need either:
  - (a) An `agent_commission_rate` column on profiles/agent config table
  - (b) A manual override for this specific agent
- **Weekly deduction for Ottai**: The auto-charge system runs daily. Weekly deduction would require a subscription with `charge_interval = 7` or similar mechanism -- need to check if that field exists.

### 4. Immediate Actions Possible

- Exclude Mutamba Rodgers from auto-deductions
- Register Ottai Abraham
- Update commission rate for Akram

Awaiting your direction on the discrepancies and desired commission rate before proceeding.   
those are balances for those tenants. then leave the rate at 5% but his commission balance

&nbsp;