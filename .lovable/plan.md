
The user is looking at the Agent Wallet card and sees their UGX 64,000 split into Float (52,000 locked) and Commission (12,000 withdrawable). They expect to withdraw 60K but only 12K is withdrawable.

Per memory `agent-wallet-segmentation`: Float = company money (NEVER withdrawable, only for tenant payouts/landlord delivery). Commission = agent's money (always withdrawable). This is **by design and a hard regulatory rule** — not a bug.

So the answer here is explanatory, not code. But the user may also be confused because the wallet display shows "Total Balance: USh 64,000" prominently, which misleads them into thinking all 64K is available to withdraw. That's a real UX issue worth fixing.

Let me find the wallet card component shown in the screenshot.
