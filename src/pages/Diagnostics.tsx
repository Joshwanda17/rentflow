import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Smartphone,
  HardDrive,
  Boxes,
  ServerCog,
  ClipboardCopy,
  Download,
  Send,
  LinkIcon,
  Activity,
} from "lucide-react";
import {
  hardRecover,
  purgeCachesAndServiceWorkers,
  getRecoveryAttempts,
  MAX_RECOVERY_ATTEMPTS,
} from "@/lib/hardRecovery";
import { supabase } from "@/integrations/supabase/client";

type Status = "ok" | "warn" | "bad" | "info";

interface EnvInfo {
  isIOS: boolean;
  isSafari: boolean;
  isStandalone: boolean;
  inIframe: boolean;
  isPreviewHost: boolean;
  online: boolean;
  userAgent: string;
}

interface SwInfo {
  supported: boolean;
  registrations: {
    scope: string;
    scriptURL: string | null;
    active: string | null;
    waiting: boolean;
    installing: boolean;
  }[];
  controller: string | null;
}

interface CacheInfo {
  supported: boolean;
  caches: { name: string; entries: number }[];
}

interface ShellInfo {
  loadedScripts: string[];
  networkScripts: string[];
  stale: boolean | null;
  error: string | null;
}

interface TelemetryRow {
  id: string;
  created_at: string;
  event_type: string;
  chunk_mismatch: boolean | null;
  reload_attempts: number | null;
  sw_cleared: boolean | null;
  cache_cleared: boolean | null;
  is_ios: boolean | null;
  is_safari: boolean | null;
  is_standalone: boolean | null;
  ios_version: string | null;
  safari_version: string | null;
  user_agent: string | null;
}

function detectEnv(): EnvInfo {
  const ua = navigator.userAgent || "";
  const host = window.location.hostname;
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  return {
    isIOS: /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream,
    isSafari: /^((?!chrome|android|crios|fxios).)*safari/i.test(ua),
    isStandalone:
      (window.navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches,
    inIframe,
    isPreviewHost:
      host.includes("id-preview--") ||
      host.includes("preview--") ||
      host.endsWith(".lovableproject.com"),
    online: navigator.onLine,
    userAgent: ua,
  };
}

async function readServiceWorkers(): Promise<SwInfo> {
  if (!("serviceWorker" in navigator)) {
    return { supported: false, registrations: [], controller: null };
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    return {
      supported: true,
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrations: regs.map((r) => ({
        scope: r.scope,
        scriptURL: r.active?.scriptURL ?? r.installing?.scriptURL ?? null,
        active: r.active?.state ?? null,
        waiting: !!r.waiting,
        installing: !!r.installing,
      })),
    };
  } catch {
    return { supported: true, registrations: [], controller: null };
  }
}

async function readCaches(): Promise<CacheInfo> {
  if (!("caches" in window)) return { supported: false, caches: [] };
  try {
    const keys = await caches.keys();
    const detail = await Promise.all(
      keys.map(async (name) => {
        try {
          const c = await caches.open(name);
          const reqs = await c.keys();
          return { name, entries: reqs.length };
        } catch {
          return { name, entries: -1 };
        }
      })
    );
    return { supported: true, caches: detail };
  } catch {
    return { supported: true, caches: [] };
  }
}

// Extract hashed asset filenames (e.g. index-a1b2c3d4.js) from an HTML string.
function extractAssetRefs(html: string): string[] {
  const refs = new Set<string>();
  const re = /\/assets\/[A-Za-z0-9._-]+\.(?:m?js|css)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) refs.add(m[0]);
  return Array.from(refs).sort();
}

function loadedAssetRefs(): string[] {
  const refs = new Set<string>();
  document.querySelectorAll("script[src]").forEach((el) => {
    const src = el.getAttribute("src") || "";
    const idx = src.indexOf("/assets/");
    if (idx >= 0) refs.add(src.slice(idx).split("?")[0]);
  });
  document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => {
    const href = el.getAttribute("href") || "";
    const idx = href.indexOf("/assets/");
    if (idx >= 0) refs.add(href.slice(idx).split("?")[0]);
  });
  return Array.from(refs).sort();
}

async function readShell(): Promise<ShellInfo> {
  const loaded = loadedAssetRefs();
  try {
    // Force a fresh network fetch of the deployed index.html, bypassing caches.
    const res = await fetch(`/index.html?_diag=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
    const html = await res.text();
    const networkScripts = extractAssetRefs(html);

    // The shell is "stale" if the entry module currently running is NOT
    // referenced by the freshly-fetched index.html (i.e. a deploy rotated it).
    const networkJs = networkScripts.filter((s) => /\.m?js$/.test(s));
    const loadedJs = loaded.filter((s) => /\.m?js$/.test(s));
    let stale: boolean | null = null;
    if (networkJs.length && loadedJs.length) {
      // Compare entry chunk presence — if none of the loaded entry scripts
      // appear in the live index.html, the running shell is stale.
      stale = !loadedJs.some((s) => networkJs.includes(s));
    }
    return { loadedScripts: loaded, networkScripts, stale, error: null };
  } catch (e) {
    return {
      loadedScripts: loaded,
      networkScripts: [],
      stale: null,
      error: String((e as any)?.message || e),
    };
  }
}

function StatusPill({ status, children }: { status: Status; children: ReactNode }) {
  const map: Record<Status, { cls: string; Icon: typeof CheckCircle2 }> = {
    ok: { cls: "bg-green-500/15 text-green-600 dark:text-green-400", Icon: CheckCircle2 },
    warn: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", Icon: AlertTriangle },
    bad: { cls: "bg-destructive/15 text-destructive", Icon: XCircle },
    info: { cls: "bg-muted text-muted-foreground", Icon: CheckCircle2 },
  };
  const { cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ServerCog;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Diagnostics() {
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [sw, setSw] = useState<SwInfo | null>(null);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [shell, setShell] = useState<ShellInfo | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ link: string; emailQueued: boolean } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const reportRef = useRef<string>("");
  const [telemetry, setTelemetry] = useState<TelemetryRow[] | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setEnv(detectEnv());
    setAttempts(getRecoveryAttempts());
    const [swr, cr, sh] = await Promise.all([readServiceWorkers(), readCaches(), readShell()]);
    setSw(swr);
    setCacheInfo(cr);
    setShell(sh);
    setLoading(false);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const loadTelemetry = useCallback(async () => {
    setTelemetryLoading(true);
    try {
      const { data, error } = await supabase
        .from("update_failure_events")
        .select(
          "id,created_at,event_type,chunk_mismatch,reload_attempts,sw_cleared,cache_cleared,is_ios,is_safari,is_standalone,ios_version,safari_version,user_agent"
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setTelemetry((data as TelemetryRow[]) ?? []);
    } catch {
      setTelemetry([]);
    } finally {
      setTelemetryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTelemetry();
  }, [loadTelemetry]);

  const onPurge = async () => {
    setBusy(true);
    await purgeCachesAndServiceWorkers();
    await run();
    setBusy(false);
  };

  const generateReport = useCallback((): string => {
    const ts = new Date().toISOString();
    const loc = window.location.href;

    const lines: string[] = [];
    lines.push("========================================");
    lines.push("  Welile App Diagnostics Report");
    lines.push("========================================");
    lines.push(`Generated: ${ts}`);
    lines.push(`URL:       ${loc}`);
    lines.push("");

    lines.push("--- Verdict ---");
    if (shell?.stale === true) {
      lines.push("STALE SHELL — loaded chunks are no longer in live deploy");
    } else if (shell?.stale === false) {
      lines.push("OK — loaded shell matches live deploy");
    } else if (shell?.error) {
      lines.push(`UNCERTAIN — shell check failed: ${shell.error}`);
    } else {
      lines.push("UNKNOWN — shell check result unavailable");
    }
    lines.push(`Recovery attempts: ${attempts}/${MAX_RECOVERY_ATTEMPTS}`);
    lines.push("");

    lines.push("--- Chunk Mismatch ---");
    if (shell) {
      lines.push(`Stale: ${shell.stale === true ? "YES" : shell.stale === false ? "NO" : "N/A"}`);
      lines.push(`Error: ${shell.error || "none"}`);
      lines.push("Loaded assets:");
      shell.loadedScripts.forEach((s) => lines.push(`  - ${s}`));
      lines.push("Live deploy assets:");
      shell.networkScripts.forEach((s) => lines.push(`  - ${s}`));
    } else {
      lines.push("Shell data not yet loaded.");
    }
    lines.push("");

    lines.push("--- Environment ---");
    if (env) {
      lines.push(`iOS:        ${env.isIOS ? "Yes" : "No"}`);
      lines.push(`Safari:     ${env.isSafari ? "Yes" : "No"}`);
      lines.push(`Standalone: ${env.isStandalone ? "Yes" : "No"}`);
      lines.push(`Iframe:     ${env.inIframe ? "Yes" : "No"}`);
      lines.push(`Preview:    ${env.isPreviewHost ? "Yes" : "No"}`);
      lines.push(`Online:     ${env.online ? "Yes" : "No"}`);
      lines.push(`User-Agent: ${env.userAgent}`);
    }
    lines.push("");

    lines.push("--- Service Worker ---");
    if (sw) {
      lines.push(`Supported:   ${sw.supported ? "Yes" : "No"}`);
      lines.push(`Controller:  ${sw.controller ?? "none"}`);
      lines.push(`Registered:  ${sw.registrations.length}`);
      sw.registrations.forEach((r, i) => {
        lines.push(`  [${i}] scope=${r.scope}`);
        lines.push(`        script=${r.scriptURL}`);
        lines.push(`        state=${r.active ?? "—"} waiting=${r.waiting} installing=${r.installing}`);
      });
    }
    lines.push("");

    lines.push("--- Cache Storage ---");
    if (cacheInfo) {
      lines.push(`Supported: ${cacheInfo.supported ? "Yes" : "No"}`);
      lines.push(`Buckets:   ${cacheInfo.caches.length}`);
      cacheInfo.caches.forEach((c) => {
        lines.push(`  - ${c.name}: ${c.entries < 0 ? "?" : c.entries} entries`);
      });
    }
    lines.push("");
    lines.push("--- End of Report ---");

    return lines.join("\n");
  }, [shell, env, sw, cacheInfo, attempts]);

  const copyReport = async () => {
    const report = generateReport();
    reportRef.current = report;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadReport = () => {
    const report = generateReport();
    reportRef.current = report;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `welile-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sendToSupport = async () => {
    setSending(true);
    setSendError(null);
    setSendResult(null);
    const report = generateReport();
    reportRef.current = report;
    try {
      const { data, error } = await supabase.functions.invoke("submit-diagnostics-report", {
        body: {
          report,
          origin: window.location.origin,
          metadata: {
            stale: shell?.stale ?? null,
            attempts,
            isIOS: env?.isIOS ?? null,
            isStandalone: env?.isStandalone ?? null,
            userAgent: env?.userAgent ?? null,
          },
        },
      });
      if (error) throw error;
      if (!data?.supportLink) throw new Error("No support link returned");
      setSendResult({ link: data.supportLink, emailQueued: !!data.emailQueued });
    } catch (e: any) {
      setSendError(e?.message || "Could not send report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!sendResult?.link) return;
    try {
      await navigator.clipboard.writeText(sendResult.link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = sendResult.link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shellStatus: Status =
    shell?.stale === true ? "bad" : shell?.stale === false ? "ok" : "warn";
  const swStatus: Status = !sw?.supported
    ? "info"
    : sw.registrations.length === 0
    ? "info"
    : sw.registrations.some((r) => r.waiting)
    ? "warn"
    : "ok";
  const cacheStatus: Status = !cacheInfo?.supported
    ? "info"
    : cacheInfo.caches.length === 0
    ? "ok"
    : "warn";

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">App Diagnostics</h1>
            <p className="text-sm text-muted-foreground">
              Stale shell, chunk hashes & cache state
            </p>
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-run
          </button>
        </header>

        {/* Verdict */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Verdict:</span>
            {shell?.stale === true ? (
              <StatusPill status="bad">Stale shell — old chunks referenced</StatusPill>
            ) : shell?.stale === false ? (
              <StatusPill status="ok">Shell is up to date</StatusPill>
            ) : (
              <StatusPill status="warn">Could not confirm shell freshness</StatusPill>
            )}
            {attempts > 0 && (
              <StatusPill status={attempts >= MAX_RECOVERY_ATTEMPTS ? "bad" : "warn"}>
                {attempts}/{MAX_RECOVERY_ATTEMPTS} recovery attempts
              </StatusPill>
            )}
          </div>
          {shell?.stale === true && (
            <p className="mt-2 text-xs text-muted-foreground">
              The running HTML shell references chunk hashes that are no longer in
              the live deploy. This is the classic iPhone "Updating…" loop cause.
              Tap <strong>Hard reload</strong> below to fetch a fresh shell.
            </p>
          )}
        </div>

        {/* Environment */}
        <Section title="Environment" icon={Smartphone}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row k="iOS device" v={env?.isIOS ? "Yes" : "No"} />
            <Row k="Safari" v={env?.isSafari ? "Yes" : "No"} />
            <Row k="Standalone (PWA)" v={env?.isStandalone ? "Yes" : "No"} />
            <Row k="In iframe / preview" v={env?.inIframe || env?.isPreviewHost ? "Yes" : "No"} />
            <Row k="Online" v={env?.online ? "Yes" : "No"} />
          </dl>
          {env?.userAgent && (
            <p className="mt-3 break-words rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
              {env.userAgent}
            </p>
          )}
        </Section>

        {/* Shell / chunk hashes */}
        <Section title="Shell & chunk hashes" icon={Boxes}>
          <div className="mb-2">
            <StatusPill status={shellStatus}>
              {shell?.stale === true
                ? "Mismatch detected"
                : shell?.stale === false
                ? "Loaded shell matches live deploy"
                : shell?.error
                ? "Network check failed"
                : "Unknown"}
            </StatusPill>
          </div>
          {shell?.error && (
            <p className="mb-2 text-xs text-destructive">Fetch error: {shell.error}</p>
          )}
          <Detail label="Currently loaded assets" items={shell?.loadedScripts ?? []} />
          <Detail label="Live deploy references" items={shell?.networkScripts ?? []} />
        </Section>

        {/* Service worker */}
        <Section title="Service worker" icon={ServerCog}>
          <div className="mb-2">
            <StatusPill status={swStatus}>
              {!sw?.supported
                ? "Not supported"
                : sw.registrations.length === 0
                ? "None registered"
                : sw.registrations.some((r) => r.waiting)
                ? "Update waiting"
                : "Active"}
            </StatusPill>
          </div>
          <dl className="grid grid-cols-1 gap-y-2 text-sm">
            <Row k="Controller" v={sw?.controller ?? "none"} mono />
            <Row k="Registrations" v={String(sw?.registrations.length ?? 0)} />
          </dl>
          {sw?.registrations.map((r, i) => (
            <div key={i} className="mt-2 rounded bg-muted/40 p-2 text-[11px] font-mono text-muted-foreground">
              <div>scope: {r.scope}</div>
              <div>script: {r.scriptURL}</div>
              <div>
                state: {r.active ?? "—"}
                {r.waiting ? " • waiting" : ""}
                {r.installing ? " • installing" : ""}
              </div>
            </div>
          ))}
        </Section>

        {/* Caches */}
        <Section title="Cache storage" icon={HardDrive}>
          <div className="mb-2">
            <StatusPill status={cacheStatus}>
              {!cacheInfo?.supported
                ? "Not supported"
                : cacheInfo.caches.length === 0
                ? "Empty"
                : `${cacheInfo.caches.length} cache(s)`}
            </StatusPill>
          </div>
          {cacheInfo?.caches.map((c) => (
            <div key={c.name} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
              <span className="break-all font-mono text-xs">{c.name}</span>
              <span className="text-muted-foreground">{c.entries < 0 ? "?" : c.entries} entries</span>
            </div>
          ))}
        </Section>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => hardRecover()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" /> Hard reload (bust cache)
          </button>
          <button
            onClick={onPurge}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-muted px-6 py-3 text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
            Clear caches & SW (no reload)
          </button>
        </div>

        {/* Report */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Support report</h2>

        </div>

        {/* Update-failure telemetry (managers only — RLS returns rows only to them) */}
        <Section title="Update-failure telemetry" icon={Activity}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Last 50 stuck-device signals (SW/cache cleared, chunk mismatch, reload
              attempts, iOS/Safari version). Visible to managers only.
            </p>
            <button
              onClick={loadTelemetry}
              disabled={telemetryLoading}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80 disabled:opacity-50"
            >
              {telemetryLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
          </div>
          {telemetry === null || telemetryLoading ? (
            <p className="text-xs text-muted-foreground/60">Loading…</p>
          ) : telemetry.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">
              No telemetry yet (or you don't have manager access to view it).
            </p>
          ) : (
            <div className="space-y-2">
              {telemetry.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-primary/15 px-2 py-0.5 font-medium text-primary">
                      {t.event_type}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </span>
                    {t.chunk_mismatch && (
                      <span className="rounded bg-destructive/15 px-2 py-0.5 text-destructive">
                        chunk mismatch
                      </span>
                    )}
                    {t.sw_cleared && (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                        SW cleared
                      </span>
                    )}
                    {t.cache_cleared && (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                        cache cleared
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
                    <span>reloads: {t.reload_attempts ?? "—"}</span>
                    <span>
                      {t.is_ios ? `iOS ${t.ios_version ?? "?"}` : "non-iOS"}
                      {t.is_safari ? ` • Safari ${t.safari_version ?? "?"}` : ""}
                      {t.is_standalone ? " • PWA" : ""}
                    </span>
                  </div>
                  {t.user_agent && (
                    <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground/70">
                      {t.user_agent}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Report (continued) */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Generate a full diagnostic report you can paste into a support ticket or download as a .txt file.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={copyReport}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium hover:bg-muted/80"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            <button
              onClick={downloadReport}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium hover:bg-muted/80"
            >
              <Download className="h-4 w-4" />
              Download .txt
            </button>
          </div>

          <button
            onClick={sendToSupport}
            disabled={sending}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending to support…" : "Send report to support"}
          </button>

          {sendError && (
            <p className="mt-2 text-xs text-destructive">{sendError}</p>
          )}

          {sendResult && (
            <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {sendResult.emailQueued
                  ? "Sent to support and one-time link created"
                  : "One-time link created (email pending — share the link below)"}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <a
                  href={sendResult.link}
                  className="flex-1 break-all font-mono text-[11px] text-primary underline"
                >
                  {sendResult.link}
                </a>
                <button
                  onClick={copyLink}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-medium hover:bg-muted/80"
                >
                  {linkCopied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <ClipboardCopy className="h-3 w-3" />}
                  {linkCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">This link expires in 7 days.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`text-right ${mono ? "break-all font-mono text-xs" : "font-medium"}`}>{v}</dd>
    </div>
  );
}

function Detail({ label, items }: { label: string; items: string[] }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {label} ({items.length})
      </summary>
      <ul className="mt-1 space-y-0.5">
        {items.length === 0 && <li className="text-xs text-muted-foreground/60">none found</li>}
        {items.map((s) => (
          <li key={s} className="break-all font-mono text-[11px] text-muted-foreground">
            {s}
          </li>
        ))}
      </ul>
    </details>
  );
}
