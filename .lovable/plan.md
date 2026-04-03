

## Tenant Registration Review & Edit

### What This Solves
After approving a rent request, Tenant Ops staff currently cannot review or correct the full registration data submitted by agents (landlord details, LC1 chairperson, utility meters, house info, location). This feature adds a comprehensive "Registered Info" view with inline editing.

### Approach
Extend the existing `TenantDetailPanel` with a new expandable section that displays all agent-submitted data from `rent_requests`, `landlords`, `lc1_chairpersons`, and `profiles`. Each field group is editable with save + audit logging.

### Changes

**1. New component: `TenantRegistrationReview.tsx`**

A card-based detail view that loads and displays:
- **Tenant Profile**: full_name, phone, email, city, country, national_id, mobile_money_number, mobile_money_provider
- **Landlord Info** (from `landlords` via `rent_requests.landlord_id`): name, phone, property_address, bank_name, account_number, mobile_money_number, caretaker_name, caretaker_phone, electricity_meter_number, water_meter_number
- **LC1 Chairperson** (from `lc1_chairpersons` via `rent_requests.lc1_id`): name, phone, village
- **Rent Request Details**: house_category, tenant_water_meter, tenant_electricity_meter, request_city, request_country, house_image_urls (thumbnail gallery)

Each section has an "Edit" pencil icon. Clicking it toggles inline edit mode with Input fields. A "Save" button validates (min 10-char audit reason required), updates the relevant table, and logs to `audit_logs`.

**2. Add nav card to `TenantOpsDashboard.tsx`**
- New nav card: "Review Registration" with a `FileSearch` icon
- New `ActiveView` value: `'registration-review'`
- This view shows a searchable list of tenants (reusing existing `TenantOverviewList` pattern) — clicking a tenant opens their full registration review

**3. Integrate into `TenantDetailPanel.tsx`**
- Add a "View Registration" button in the profile card that navigates to the registration review for that tenant
- This provides two entry points: from the nav grid or from an individual tenant detail

**4. Editable fields and table mapping**

| Field Group | Table | Editable Fields |
|---|---|---|
| Tenant Profile | `profiles` | full_name, phone, city, country, national_id, mobile_money_number, mobile_money_provider |
| Landlord | `landlords` | name, phone, property_address, bank_name, account_number, mobile_money_number, caretaker_name, caretaker_phone, electricity_meter_number, water_meter_number |
| LC1 Chairperson | `lc1_chairpersons` | name, phone, village |
| Request Metadata | `rent_requests` | house_category, tenant_water_meter, tenant_electricity_meter |

**5. Audit compliance**
- Every edit requires a 10-character reason (consistent with existing pattern)
- Insert into `audit_logs` with `action_type: 'tenant_registration_edited'`, recording old and new values in metadata
- Toast confirmation on save

### Files Changed
| File | Change |
|---|---|
| `src/components/executive/TenantRegistrationReview.tsx` | **New** — full registration viewer/editor |
| `src/components/executive/TenantOpsDashboard.tsx` | Add nav card + route for registration review |
| `src/components/executive/TenantDetailPanel.tsx` | Add "View Registration" button |

No database changes needed — all tables and columns already exist.

