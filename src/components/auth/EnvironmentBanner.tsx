import { Laptop, FlaskConical, Globe, ExternalLink } from 'lucide-react';

const GoogleGlyph = () => (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const AppleGlyph = () => (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.62-2.2.44-3.06-.4C4.24 16.7 4.89 10.97 8.82 10.74c1.15.06 1.95.66 2.62.7.99-.2 1.95-.78 3.01-.7 1.28.1 2.24.6 2.87 1.52-2.63 1.58-2.01 5.07.37 6.04-.5 1.3-.93 2.58-1.64 3.98zM12.05 10.67c-.14-2.51 1.88-4.63 4.25-4.67.33 2.85-2.55 4.98-4.25 4.67z" />
  </svg>
);

// Publicly reachable domains where the Lovable OAuth broker (/~oauth/*) is
// served and Google/Apple sign-in can complete.
const PUBLISHED_URL = 'https://welilereceipts-com.lovable.app';
const CUSTOM_URLS = ['https://www.welileapp.com', 'https://welileapp.com'];

type EnvKind = 'local' | 'preview' | 'published' | 'custom';

interface EnvInfo {
  kind: EnvKind;
  label: string;
  /** True when OAuth can complete on the CURRENT origin. */
  oauthWorksHere: boolean;
  /** The URL to use for OAuth (current origin when it works, else a fallback). */
  oauthUrl: string;
  /** Human note shown to the user. */
  note: string;
}

function detectEnv(): EnvInfo {
  const host = window.location.hostname;
  const origin = window.location.origin;

  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local');

  const isPreview =
    host.includes('id-preview--') ||
    host.includes('preview--') ||
    host.endsWith('.lovableproject.com');

  const isCustom = host.endsWith('welileapp.com');
  const isPublished = host.endsWith('.lovable.app') && !isPreview;

  if (isLocal) {
    return {
      kind: 'local',
      label: 'Local development',
      oauthWorksHere: false,
      oauthUrl: PUBLISHED_URL,
      note: "Google/Apple sign-in can't complete here — open the published site to use OAuth.",
    };
  }
  if (isPreview) {
    return {
      kind: 'preview',
      label: 'Preview environment',
      oauthWorksHere: true,
      oauthUrl: origin,
      note: 'OAuth works on this preview domain.',
    };
  }
  if (isCustom) {
    return {
      kind: 'custom',
      label: 'Custom domain',
      oauthWorksHere: true,
      oauthUrl: origin,
      note: 'OAuth works on this custom domain.',
    };
  }
  if (isPublished) {
    return {
      kind: 'published',
      label: 'Published site',
      oauthWorksHere: true,
      oauthUrl: origin,
      note: 'OAuth works on this published domain.',
    };
  }
  // Unknown host — treat conservatively as non-OAuth-capable.
  return {
    kind: 'local',
    label: 'Unrecognized environment',
    oauthWorksHere: false,
    oauthUrl: PUBLISHED_URL,
    note: "OAuth may not complete here — use the published site instead.",
  };
}

const KIND_STYLES: Record<EnvKind, { wrap: string; icon: JSX.Element; dot: string }> = {
  local: {
    wrap: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    icon: <Laptop className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />,
    dot: 'bg-amber-500',
  },
  preview: {
    wrap: 'border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-200',
    icon: <FlaskConical className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />,
    dot: 'bg-blue-500',
  },
  published: {
    wrap: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
    icon: <Globe className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />,
    dot: 'bg-emerald-500',
  },
  custom: {
    wrap: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
    icon: <Globe className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />,
    dot: 'bg-emerald-500',
  },
};

/**
 * Shows which environment the app is currently running in (local dev, preview,
 * published, or custom domain) and links to the correct OAuth URL for that
 * environment. On OAuth-capable domains it points at the current origin; on
 * local dev it links out to the published site where OAuth can complete.
 */
export function EnvironmentBanner() {
  if (typeof window === 'undefined') return null;

  const env = detectEnv();
  const style = KIND_STYLES[env.kind];

  return (
    <div
      role="status"
      className={`mb-4 rounded-xl border p-3 text-left text-xs leading-relaxed ${style.wrap}`}
    >
      <div className="flex items-start gap-2">
        {style.icon}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex items-center gap-2 font-semibold">
            <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
            {env.label}
            <span className="font-normal opacity-70 break-all">· {window.location.host}</span>
          </p>
          <p className="opacity-90">{env.note}</p>
          <a
            href={env.oauthUrl}
            target={env.oauthWorksHere ? '_self' : '_blank'}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2 break-all"
          >
            {env.oauthWorksHere ? 'Sign in with OAuth here' : `Open ${env.oauthUrl}`}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          {!env.oauthWorksHere && (
            <p className="opacity-70">
              Custom domains: {CUSTOM_URLS.join(' · ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default EnvironmentBanner;