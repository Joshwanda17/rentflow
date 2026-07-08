import { Laptop, FlaskConical, Globe, ExternalLink } from 'lucide-react';

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