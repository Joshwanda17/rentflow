import { AlertCircle } from 'lucide-react';

// Publicly reachable domains where the Lovable OAuth broker (/~oauth/*) is
// served. On any other host (local dev, sandbox) Google/Apple sign-in cannot
// complete because the broker path returns 404.
const PUBLISHED_URLS = [
  'https://welilereceipts-com.lovable.app',
  'https://www.welileapp.com',
  'https://welileapp.com',
];

function isOAuthCapableHost(hostname: string) {
  // Real Lovable-served hosts: preview subdomain, *.lovable.app, custom domain.
  return (
    hostname.includes('id-preview--') ||
    hostname.includes('preview--') ||
    hostname.endsWith('.lovable.app') ||
    hostname.endsWith('welileapp.com')
  );
}

/**
 * Warns, on local/dev hosts only, that Google/Apple OAuth can only complete on
 * a published or custom domain — listing the exact URLs to use instead.
 * Renders nothing on real (OAuth-capable) domains.
 */
export function OAuthDomainNotice() {
  if (typeof window === 'undefined') return null;
  if (isOAuthCapableHost(window.location.hostname)) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-left text-xs leading-relaxed text-amber-900 dark:text-amber-200"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1.5">
          <p className="font-semibold">
            Google &amp; Apple sign-in won't work on this local/dev address.
          </p>
          <p>
            OAuth can only complete on a published or custom domain. Open one of
            these to sign in with Google or Apple:
          </p>
          <ul className="space-y-0.5">
            {PUBLISHED_URLS.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  className="font-medium underline underline-offset-2 break-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-amber-800/80 dark:text-amber-200/70">
            On this address, use phone or email &amp; password instead.
          </p>
        </div>
      </div>
    </div>
  );
}

export default OAuthDomainNotice;