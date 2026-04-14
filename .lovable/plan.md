

## Plan: Add Search/Filter to Remaining Pipeline Tabs

### Current State
- **Tenants tab** (`RentPipelineQueue`): Already has search by tenant/landlord/agent name ✓
- **Promissory Notes tab** (`PromissoryNotesQueue`): Already has search + status filter ✓
- **Sub-Agents tab** (`SubAgentVerificationQueue`): No search — only status tabs (pending/verified)
- **Landlords tab** (`LandlordsPipeline`): No search at all

### Changes

**1. `src/components/executive/SubAgentVerificationQueue.tsx`**
- Add a search state and a `Search` input field above the list
- Filter records by parent agent name, sub-agent name, or phone number
- Apply search filter alongside the existing status tab filter

**2. `src/components/executive/AgentOpsPipelineHub.tsx` (LandlordsPipeline)**
- Add a search state and `Search` input field above the landlord cards
- Filter by landlord name, phone, or address

### Files
| File | Action |
|------|--------|
| `src/components/executive/SubAgentVerificationQueue.tsx` | Add search input + filter logic |
| `src/components/executive/AgentOpsPipelineHub.tsx` | Add search to `LandlordsPipeline` component |

