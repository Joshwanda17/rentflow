import { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useShareCardTheme,
  SHARE_CARD_THEME_PRESETS,
  type ShareCardTheme,
} from '@/hooks/useShareCardTheme';
import { Palette, Check, RotateCcw, ShieldCheck, Image as ImageIcon, Loader2, Eye } from 'lucide-react';
import welileLogoUrl from '@/assets/welile-logo.png';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Agent-facing settings card for customizing the WhatsApp share artwork
 * (Rent Access Limit PNG / certificate). Stored client-side per device.
 *
 * Logo is non-configurable on purpose: the official Welile logo is always
 * embedded automatically so branding stays consistent across all agents.
 */
export default function ShareCardThemeSettings() {
  const { theme, setTheme, reset, resolved } = useShareCardTheme();
  const [previewing, setPreviewing] = useState(false);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  // Live PNG preview — regenerates whenever the active theme changes.
  useEffect(() => {
    let cancelled = false;
    setLivePreviewLoading(true);

    (async () => {
      try {
        const { generateRentAccessLimitPng } = await import('@/lib/rentAccessLimitPdf');
        const blob = await generateRentAccessLimitPng({
          tenantName: 'Sample Tenant',
          tenantPhone: '+256 700 000 000',
          aiId: 'WAI-PREVIEW-0001',
          monthlyRent: 350000,
          result: {
            limit: 4_200_000,
            base: 4_200_000,
            netAdjustmentPct: 0.15,
            paidDays: 18,
            missedDays: 2,
            trackedDays: 20,
            paidToday: true,
            todayChange: 21000,
          } as any,
          shareUrl: 'https://welilereceipts.com/limit/sample',
        });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        // Revoke previous URL to avoid leaks
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setLivePreviewUrl(url);
      } catch {
        /* preview is best-effort */
      } finally {
        if (!cancelled) setLivePreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [theme.preset, theme.customStops?.[0], theme.customStops?.[1], theme.customStops?.[2]]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const presetEntries = useMemo(
    () => Object.entries(SHARE_CARD_THEME_PRESETS) as [
      Exclude<ShareCardTheme['preset'], 'custom'>,
      typeof SHARE_CARD_THEME_PRESETS[keyof typeof SHARE_CARD_THEME_PRESETS],
    ][],
    [],
  );

  const handleSelect = (preset: ShareCardTheme['preset']) => {
    setTheme({ preset });
    toast.success('Theme saved', { description: 'Next share card will use this look.' });
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const { generateRentAccessLimitPng } = await import('@/lib/rentAccessLimitPdf');
      const blob = await generateRentAccessLimitPng({
        tenantName: 'Sample Tenant',
        tenantPhone: '+256 700 000 000',
        aiId: 'WAI-PREVIEW-0001',
        monthlyRent: 350000,
        result: {
          limit: 4_200_000,
          base: 4_200_000,
          netAdjustmentPct: 0.15,
          paidDays: 18,
          missedDays: 2,
          trackedDays: 20,
          paidToday: true,
          todayChange: 21000,
        } as any,
        shareUrl: 'https://welilereceipts.com/limit/sample',
      });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err: any) {
      toast.error('Preview failed', { description: err?.message ?? 'Try again.' });
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Card className="border-border/40 rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <CardTitle className="text-sm">Share Card Theme</CardTitle>
            <CardDescription className="text-xs">
              Pick the colours used on the Rent Access Limit you send to tenants on WhatsApp.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Logo lock-in notice */}
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="h-10 w-10 rounded-lg bg-white border border-border flex items-center justify-center shrink-0 overflow-hidden">
            <img src={welileLogoUrl} alt="Welile logo" className="h-7 w-7 object-contain" />
          </div>
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Welile logo always included
            </p>
            <p className="text-muted-foreground leading-snug">
              The official logo is added automatically so every share looks on-brand.
            </p>
          </div>
        </div>

        {/* Live PNG preview — updates instantly on theme change */}
        <div className="rounded-xl border border-border/50 overflow-hidden bg-muted/30">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-background/60">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Eye className="h-3.5 w-3.5 text-primary" />
              Live preview
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {livePreviewLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating…
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Up to date
                </>
              )}
            </div>
          </div>
          <div className="relative aspect-[4/5] w-full bg-background flex items-center justify-center">
            {livePreviewUrl ? (
              <img
                src={livePreviewUrl}
                alt="Live preview of WhatsApp share card"
                className={cn(
                  'h-full w-full object-contain transition-opacity duration-200',
                  livePreviewLoading && 'opacity-60',
                )}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Generating preview…
              </div>
            )}
          </div>
          <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border/50 bg-background/60">
            Sample tenant data. Real shares use each tenant's actual name, phone & limit.
          </p>
        </div>

        {/* Preset grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {presetEntries.map(([id, meta]) => {
            const active = theme.preset === id;
            const [a, b, c] = meta.resolved.gradient;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                aria-pressed={active}
                aria-label={`Use ${meta.label} theme`}
                className={cn(
                  'group relative rounded-xl overflow-hidden border-2 text-left transition-all active:scale-[0.98]',
                  active
                    ? 'border-primary ring-2 ring-primary/30 shadow-md'
                    : 'border-border/50 hover:border-border',
                )}
              >
                {/* Color preview */}
                <div
                  className="h-16 w-full"
                  style={{
                    background: `linear-gradient(135deg, ${a} 0%, ${b} 55%, ${c} 100%)`,
                  }}
                  aria-hidden
                />
                {/* Mini logo chip on the swatch — proves logo will appear */}
                <div className="absolute top-1.5 left-1.5 h-5 w-5 rounded bg-white/95 flex items-center justify-center">
                  <img src={welileLogoUrl} alt="" className="h-3.5 w-3.5 object-contain" aria-hidden />
                </div>
                {active && (
                  <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                    <Check className="h-3 w-3" />
                  </div>
                )}
                <div className="px-2.5 py-2 bg-background">
                  <p className="text-xs font-bold text-foreground leading-tight">{meta.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                    {meta.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Currently active strip */}
        <div className="rounded-xl border border-border/50 p-2.5 flex items-center gap-2.5">
          <div
            className="h-8 w-12 rounded-md shrink-0 border border-border/50"
            style={{
              background: `linear-gradient(135deg, ${resolved.gradient[0]} 0%, ${resolved.gradient[1]} 55%, ${resolved.gradient[2]} 100%)`,
            }}
            aria-hidden
          />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-foreground">
              Active:{' '}
              {theme.preset === 'custom'
                ? 'Custom'
                : SHARE_CARD_THEME_PRESETS[theme.preset].label}
            </p>
            <p className="text-muted-foreground">Saved on this device.</p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={previewing}
            className="h-10 rounded-xl gap-1.5 text-xs"
          >
            {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            Preview card
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              toast.success('Reset to Welile Purple');
            }}
            className="h-10 rounded-xl gap-1.5 text-xs text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
