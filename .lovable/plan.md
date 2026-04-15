

# Fix Service Centre Submit Button — Spinning Forever

## Problem
The submit button spins indefinitely because phone camera photos (often 5-10MB) are uploaded raw to storage over slow mobile networks. The `supabase.storage.upload()` call hangs without any timeout or progress indicator, making it appear frozen.

## Solution

### 1. Compress photos before upload
Use the existing Canvas API image optimization pattern (already used elsewhere in the platform) to resize and compress photos to max 1200px width, WebP/JPEG format, ~80% quality. This reduces file size from 5-10MB to ~100-300KB.

### 2. Add upload timeout
Wrap the storage upload in a `Promise.race` with a 30-second timeout so the button never spins forever. If it times out, show a clear error message.

### 3. Add progress feedback
Replace the generic spinner with step-by-step status text:
- "Compressing photo..." → "Uploading..." → "Saving..." → Done
This gives users on slow connections confidence that something is happening.

### 4. Add retry guidance on failure
If upload fails, show a toast with actionable advice: "Upload failed. Check your connection and try again."

## Files to Edit
- **`src/components/agent/ServiceCentreSubmissionForm.tsx`** — Add image compression (Canvas API resize to 1200px, JPEG 0.8 quality), upload timeout wrapper, and step-by-step status text in the submit button.

## Technical Details
- Reuse the platform's established Canvas API pattern: `drawImage` → `toBlob('image/jpeg', 0.8)` with max 1200px dimension
- Timeout: `Promise.race([upload, new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out')), 30000))])`
- Status states: `'compressing' | 'uploading' | 'saving' | null` displayed in the button label

