

# Add Welile Service Centre Images with Download Buttons

## What Changes

Add a new "Service Centre Materials" card section to the Agent Commission Benefits page, displaying two uploaded images (Welile Logo and Welile Service Centre Poster) with download buttons for each.

## Implementation

### 1. Copy uploaded images to `src/assets/`
- `user-uploads://WELILE_LOGO.jpeg` → `src/assets/welile-logo.jpeg`
- `user-uploads://REQUEST_RENT_HERE.jpeg` → `src/assets/welile-service-centre-poster.jpeg`

### 2. Update `src/pages/AgentCommissionBenefits.tsx`
- Import `Download` icon from lucide-react
- Import both images from `@/assets/`
- Add a new Card section (e.g. "Service Centre Materials") with:
  - Each image displayed in a rounded container at full width
  - Label beneath each: "Welile Logo" and "Welile Service Centre Poster"
  - A "Download" button under each image that triggers a high-quality download using an anchor tag with `download` attribute
- Place this section at the top of the cards (before commission details) so agents see it prominently

### Files Modified
- **Copy**: 2 images into `src/assets/`
- **Edit**: `src/pages/AgentCommissionBenefits.tsx`

