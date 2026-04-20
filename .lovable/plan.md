
User wants me to simulate/test the agent → landlord float payout flow end-to-end. This is a testing task — needs default mode (curl edge functions, read DB, deploy if needed). Plan it concisely.

Approach: I'll pick a real agent that has float, find a real landlord/tenant pairing, then drive the 3 edge functions in sequence using `supabase--curl_edge_functions` and `supabase--read_query` to verify each state change.
