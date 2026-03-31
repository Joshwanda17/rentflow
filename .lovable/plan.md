

## Plan: Delete Account 0743331870 (sunueli alex)

**What**: Delete the duplicate account for sunueli alex (phone 0743331870, ID `c0266492-7184-4fae-95cb-4e3ad230d0f8`), keeping the account with phone 0755114078.

**Account summary**:
- **To delete**: `c0266492-7184-4fae-95cb-4e3ad230d0f8` — sunueli alex, 0743331870, has roles (tenant, agent, landlord, supporter) but no portfolios, no wallet transactions
- **To keep**: `3b293a8d-6046-429b-8295-0eb121e88577` — Sunueli Alex, 0755114078

**Steps**:
1. Call the existing `delete-user` edge function with `user_id = c0266492-7184-4fae-95cb-4e3ad230d0f8` — this handles the full cleanup sequence (pre-cleanup of FK refs → auth user deletion → related data cleanup → profile deletion)
2. Since the account has no portfolios or wallet transactions, the deletion should be straightforward with no data loss concerns

**Technical detail**: The edge function requires a manager-authenticated call. I will invoke it via the edge function curl tool with the service role.

