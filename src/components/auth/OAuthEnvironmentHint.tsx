import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Copy, Check } from 'lucide-react';

/**
 * Detects browser environments where Google OAuth popups commonly fail and
 * shows targeted guidance so the user can switch to a supported browser
 * before tapping "Continue with Google".
 *
 * Cases handled:
 *  - In-app browsers (WhatsApp, Facebook, Instagram, TikTok, Snapchat,
 *    LinkedIn, Line, Messenger, Twitter, WeChat) — Google blocks OAuth in
 *    these WebViews entirely.
 *  - iOS Safari — cross-site tracking prevention can silently drop the
 *    OAuth popup, so we surface a soft nudge to try again / disable it.
 */
type Env = 'in_app' | 'ios_safari' | null;

function detectEnv(): { env: Env; appName?: string } {
  if (typeof navigator === 'undefined') return { env: null };
  const ua = navigator.userAgent || '';

  const inApp: Array<[RegExp, string]> = [
    [/FBAN|FBAV|FB_IAB|FB4A/i, 'Facebook'],
    [/Instagram/i, 'Instagram'],
    [/WhatsApp/i, 'WhatsApp'],
    [/Messenger|MessengerLite/i, 'Messenger'],
    [/TikTok|Musical_ly|BytedanceWebview/i, 'TikTok'],
    [/Snapchat/i, 'Snapchat'],
    [/LinkedInApp/i, 'LinkedIn'],
    [/Line\//i, 'Line'],
    [/Twitter/i, 'Twitter/X'],
    [/MicroMessenger/i, 'WeChat'],
  ];
  for (const [re, name] of inApp) {
    if (re.test(ua)) return { env: 'in_app', appName: name };
  }

  // iOS Safari (not Chrome/Firefox/Edge/Opera on iOS, which use different UA tokens).
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  if (isIOS && isSafari) return { env: 'ios_safari' };

  return { env: null };
}

export function OAuthEnvironmentHint() {
  const [state, setState] = useState<{ env: Env; appName?: string }>({ env: null });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setState(detectEnv());
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!state.env) return null;

  if (state.env === 'in_app') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 p-3 text-xs text-amber-900 dark:text-amber-100 space-y-2"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">
              Google sign-in doesn't work inside {state.appName ?? 'this app'}.
            </p>
            <p className="leading-relaxed">
              Google blocks logins from in-app browsers. Tap the <span className="font-semibold">⋯ menu</span> at the top and choose
              <span className="font-semibold"> "Open in Chrome"</span> (Android) or
              <span className="font-semibold"> "Open in Safari"</span> (iPhone), then try again.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 font-medium hover:bg-amber-200/70 dark:hover:bg-amber-900/60 transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Link copied' : 'Copy page link'}
        </button>
      </div>
    );
  }

  // iOS Safari — softer nudge
  return (
    <div
      role="note"
      className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2"
    >
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <p className="leading-relaxed">
        On iPhone Safari, if the Google popup doesn't open, tap
        <span className="font-semibold"> AA → Website Settings</span> and disable
        <span className="font-semibold"> "Block Pop-ups"</span>, or turn off
        <span className="font-semibold"> "Prevent Cross-Site Tracking"</span> in Settings → Safari, then try again.
      </p>
    </div>
  );
}