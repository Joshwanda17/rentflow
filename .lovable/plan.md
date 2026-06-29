# Camera-only house photos, 3–14 range

## Goal

When an agent lists an empty house, photos must be **taken with the camera only** (no gallery upload, no "Use Existing Photos"), require a **minimum of 3** and allow a **maximum of 14**, and the **Next button is disabled** until at least 3 photos are captured.

## Changes

### 1. `src/components/agent/HouseImageUploader.tsx`

- Add a `cameraOnly?: boolean` prop (default `false`).
- When `cameraOnly` is true:
  - Render only the **Take Photo** button. remove "Upload from Gallery" button, the "Use Existing Photos" button, and the gallery/existing dialogs.
- Add a `minImages?: number` prop (default `0`) used only for the helper count label.
- Update the helper caption to reflect the rule, e.g. `Take 3–14 photos with your camera · max 5MB each`.
- Keep existing camera capture, optimization, preview strip, remove, and failed-retry logic unchanged.

### 2. `src/components/agent/ListEmptyHouseDialog.tsx`

- Pass `maxImages={14}`, `minImages={3}`, and `cameraOnly` to `<HouseImageUploader />`.
- **Validation** (`validateStep`, step 2): require `images.length >= 3` (message: "Take at least 3 photos of the house"). Also keep the same minimum in `handleSubmit` and in the preflight gate (`preflightGates`), replacing the current "At least one photo" gate with "At least 3 photos".
- **Next button** (step navigation): disable the Next button when on the photo step (`step === 2`) and `images.length < 3`, so agents can't advance without enough photos.
- Update the photo-step heading/error copy from "at least one photo" to "at least 3 photos".

## Notes / scope

- This is scoped to the agent **List Empty House** flow (the screen shown). The shared `HouseImageUploader` gains optional props, so other callers (`EditHouseListingDialog`, ops `ListingPhotoUploadDialog`) keep their current behavior unless we later opt them in.
- No backend/database changes; storage upload path is unchanged.

## Technical detail

- The Next button at the bottom is the generic wizard button; it will get `disabled={step === 2 && images.length < 3}` in addition to existing logic, and `goNext`/`validateStep` enforce the 3-photo minimum as a backstop.