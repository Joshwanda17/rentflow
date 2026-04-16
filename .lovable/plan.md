

# Enhanced Photo Upload for Property Listings

## Problem
Agents can only take new photos during listing creation. They cannot reuse older gallery photos or pull existing images from other listings at the same location, causing friction especially in low-connectivity areas.

## What Changes

### 1. Split "Add Photos" into Three Options
**File:** `src/components/agent/HouseImageUploader.tsx`

Replace the single "Add Photos" button with three distinct buttons stacked vertically:

- **Take Photo** — Opens camera directly (`capture="environment"`, no `multiple`)
- **Upload from Gallery** — Opens file picker without `capture` attribute (allows multi-select from device gallery, including older photos)
- **Use Existing Photos** — Opens a modal showing images from other `house_listings` at the same region/village/district

Currently the single `<input capture="environment">` forces camera on mobile. Splitting into two inputs (one with `capture`, one without) gives agents both options.

### 2. Create "Existing Property Photos" Picker Modal
**New file:** `src/components/agent/ExistingPropertyPhotosDialog.tsx`

- Accepts `region` and `village` props from the listing form
- Queries `house_listings` table for listings matching the same region + village/district that have `image_urls`
- Displays a grid of selectable thumbnails grouped by listing title
- Agent taps to select, then confirms
- Selected images are fetched as blobs, converted to `HouseImageFile` objects, and passed back via `onSelect` callback
- Shows a confirmation prompt: "Please confirm these photos accurately represent the current state of the property"

### 3. Pass Location Context to HouseImageUploader
**File:** `src/components/agent/ListEmptyHouseDialog.tsx`

- Pass `region`, `district`, and `village` from the form state down to `HouseImageUploader` so it can power the "Use Existing Photos" query

### 4. Freshness Validation
**File:** `src/components/agent/HouseImageUploader.tsx`

- When images are added via "Use Existing Photos", tag them with `source: 'existing'`
- If all images come from existing sources, show an amber warning: "At least one recent photo is recommended for verification"
- Non-blocking — agent can proceed but is prompted

## Technical Details

**Files created:**
- `src/components/agent/ExistingPropertyPhotosDialog.tsx`

**Files modified:**
- `src/components/agent/HouseImageUploader.tsx` — split into 3 buttons, add `region/district/village` props, add freshness warning
- `src/components/agent/ListEmptyHouseDialog.tsx` — pass location props to uploader

**Database query for existing photos:**
```sql
SELECT id, title, image_urls FROM house_listings
WHERE region = :region AND village = :village
  AND image_urls IS NOT NULL
  AND array_length(image_urls, 1) > 0
LIMIT 20
```

No database migrations needed — reads existing `house_listings.image_urls` column.

