/**
 * Returns the public-facing origin for share/referral links.
 * When running on the Lovable preview domain, returns the custom domain
 * so shared links don't require Lovable authentication.
 */
export function getPublicOrigin(): string {
  const hostname = window.location.hostname;
  const isPreview = hostname.includes('lovable.app') || hostname.includes('lovableproject.com');
  return isPreview ? 'https://welilereceipts.com' : window.location.origin;
}
