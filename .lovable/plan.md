# Fix Sunueli Alex's Outstanding Balance

## Investigation Results

**Tenant:** Sunueli Alex (`3b293a8d-6046-429b-8295-0eb121e88577`)
**Rent Request:** `3fae669e-1336-4cfd-a401-aa49f88d238a`


| Field           | Current Value | Expected    |
| --------------- | ------------- | ----------- |
| total_repayment | 816,005       | 816,005     |
| amount_repaid   | 81,606        | **310,309** |
| outstanding     | 734,399       | **505,696** |


The system only recorded 6 repayments (81,606 total), but the reference system shows 310,309 should have been repaid — a gap of **228,703** in unrecorded repayments.

## Data Repair Plan

Execute a database migration with three statements:

1. **Update `rent_requests.amount_repaid**` to `310,309` (so outstanding = 816,005 − 310,309 = **505,696**)
2. **Insert an audit log** documenting this manual correction with metadata showing before/after values
3. No code changes needed — this is a data-only fix. IT SHOULD BE A PERMANENT FIX 

## SQL to Execute

```sql
UPDATE rent_requests 
SET amount_repaid = 310309 
WHERE id = '3fae669e-1336-4cfd-a401-aa49f88d238a';

INSERT INTO audit_logs (action_type, user_id, table_name, record_id, metadata)
VALUES (
  'manual_data_repair_amount_repaid',
  '3b293a8d-6046-429b-8295-0eb121e88577',
  'rent_requests',
  '3fae669e-1336-4cfd-a401-aa49f88d238a',
  '{"reason":"Outstanding balance correction per reference system","before":{"amount_repaid":81606,"outstanding":734399},"after":{"amount_repaid":310309,"outstanding":505696}}'
);
```