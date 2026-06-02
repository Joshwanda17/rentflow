import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Map, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Manager-only card to configure a custom Google Maps browser API key.
 * Used so the map works on custom domains (e.g. welilereceipts.com) that the
 * Lovable-managed key does not authorize. The key is a referrer-restricted
 * public browser key, so it is safe to store and serve to the client.
 */
export function MapKeySettingsCard() {
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('map_config')
        .select('browser_api_key')
        .limit(1)
        .maybeSingle();
      if (!active) return;
      const k = data?.browser_api_key ?? '';
      setValue(k);
      setInitial(k);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const trimmed = value.trim();
    const { error } = await supabase
      .from('map_config')
      .update({ browser_api_key: trimmed || null, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', true);
    setSaving(false);
    if (error) {
      toast.error('Could not save key', { description: error.message });
      return;
    }
    setInitial(trimmed);
    toast.success(trimmed ? 'Custom Maps key saved' : 'Custom Maps key cleared', {
      description: 'Reload the app to apply the change.',
    });
  };

  return (
    <Card className="border-border/40 rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-primary" />
          <div>
            <CardTitle className="text-sm">Google Maps Key (Custom Domain)</CardTitle>
            <CardDescription className="text-xs">
              Paste your own Google Maps <span className="font-medium">browser</span> API key so the map works on welilereceipts.com. Leave empty to use the default Lovable key.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="maps-key" className="text-xs">API key</Label>
              <Input
                id="maps-key"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="AIza…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
            <div className="rounded-lg bg-muted/40 border border-border/40 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
              In Google Cloud, enable the <span className="font-medium text-foreground">Maps JavaScript API</span> and add these HTTP referrers to the key:
              <code className="block mt-1 text-foreground">https://welilereceipts.com/*</code>
              <code className="block text-foreground">https://*.welilereceipts.com/*</code>
              <a
                href="https://console.cloud.google.com/google/maps-apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 text-primary hover:underline"
              >
                Open Google Cloud credentials <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <Button onClick={save} disabled={saving || value.trim() === initial.trim()} size="sm" className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save key'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default MapKeySettingsCard;