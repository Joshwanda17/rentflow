import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Loader2, Save, RotateCcw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CONFIG_KEY = 'momo_sender_signup_sms';

export interface MomoSignupSmsTemplate {
  enabled: boolean;
  thank_you_text: string;
  signup_prompt: string;
  signup_link: string;
  address: string;
  website: string;
  support_email: string;
}

const DEFAULTS: MomoSignupSmsTemplate = {
  enabled: true,
  thank_you_text: 'Thank you for sending {amount} via {provider}.',
  signup_prompt: 'Open your free Welile Wallet with any phone number here:',
  signup_link: 'https://welilereceipts.com/auth?signup=1',
  address: 'Welile HQ, P.O. Box 167564, Palm Lane, Kabaale, Entebbe - Uganda.',
  website: 'welile.com',
  support_email: 'info@welile.com',
};

/** Live preview of the exact SMS body the edge function assembles. */
export function buildPreview(t: MomoSignupSmsTemplate): string {
  const thankYou = (t.thank_you_text || '')
    .replace(/\{amount\}/gi, 'UGX 9,999')
    .replace(/\{provider\}/gi, 'MTN MoMo');
  return [
    `WELILE: ${thankYou}`.trim(),
    `${t.signup_prompt} ${t.signup_link}`.trim(),
    (t.address || '').trim(),
    [t.support_email, t.website].filter(Boolean).join(' | ').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Editor for the thank-you SMS sent to anyone who pays Welile via MTN/Airtel
 * Money. Stored in system_config so wording can change without a redeploy.
 */
export function MomoSignupSmsTemplatePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tpl, setTpl] = useState<MomoSignupSmsTemplate>(DEFAULTS);
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', CONFIG_KEY)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error('Could not load template', { description: error.message });
      } else if (data?.value) {
        const v = data.value as Partial<MomoSignupSmsTemplate>;
        setTpl({
          enabled: v.enabled !== false,
          thank_you_text: v.thank_you_text ?? DEFAULTS.thank_you_text,
          signup_prompt: v.signup_prompt ?? DEFAULTS.signup_prompt,
          signup_link: v.signup_link ?? DEFAULTS.signup_link,
          address: v.address ?? DEFAULTS.address,
          website: v.website ?? DEFAULTS.website,
          support_email: v.support_email ?? DEFAULTS.support_email,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(() => buildPreview(tpl), [tpl]);
  const segments = Math.max(1, Math.ceil(preview.length / 160));

  const set = <K extends keyof MomoSignupSmsTemplate>(key: K, value: MomoSignupSmsTemplate[K]) =>
    setTpl((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    const value = {
      enabled: tpl.enabled,
      thank_you_text: tpl.thank_you_text,
      signup_prompt: tpl.signup_prompt,
      signup_link: tpl.signup_link,
      address: tpl.address,
      website: tpl.website,
      support_email: tpl.support_email,
    };
    const { error } = await supabase
      .from('system_config')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', CONFIG_KEY);
    setSaving(false);
    if (error) {
      toast.error('Save failed', { description: error.message });
    } else {
      toast.success('SMS template saved', { description: 'New senders will receive the updated message.' });
    }
  };

  const sendTest = async () => {
    const phone = testPhone.trim();
    if (!/\d{9,}/.test(phone.replace(/\D/g, ''))) {
      toast.error('Enter a valid phone number', { description: 'e.g. 0777123456 or +256777123456' });
      return;
    }
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-test-send', {
        body: { phone, message: preview },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Test SMS sent', { description: `Delivered to ${data.formattedPhone ?? phone}. Check the phone.` });
      } else {
        toast.error('Test SMS not delivered', {
          description: data?.reason || data?.recipients?.[0]?.status || 'The SMS gateway rejected the message.',
        });
      }
    } catch (e) {
      toast.error('Could not send test SMS', { description: (e as Error).message });
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading template…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-primary" />
            MoMo Thank-You SMS Template
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sent automatically to anyone who pays Welile via MTN MoMo or Airtel Money, inviting them
            to open a free wallet. Edit the wording here — changes apply instantly, no redeploy needed.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Send these messages</Label>
              <p className="text-xs text-muted-foreground">Turn off to pause the thank-you SMS entirely.</p>
            </div>
            <Switch checked={tpl.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thank_you_text">Thank-you text</Label>
            <Textarea
              id="thank_you_text"
              value={tpl.thank_you_text}
              onChange={(e) => set('thank_you_text', e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Use <code>{'{amount}'}</code> and <code>{'{provider}'}</code> as placeholders — they are
              replaced with the real amount (e.g. UGX 9,999) and channel (MTN MoMo / Airtel Money).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup_prompt">Signup prompt</Label>
            <Input
              id="signup_prompt"
              value={tpl.signup_prompt}
              onChange={(e) => set('signup_prompt', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup_link">Signup link</Label>
            <Input
              id="signup_link"
              value={tpl.signup_link}
              onChange={(e) => set('signup_link', e.target.value)}
              inputMode="url"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Physical address</Label>
            <Textarea
              id="address"
              value={tpl.address}
              onChange={(e) => set('address', e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support_email">Support email</Label>
              <Input
                id="support_email"
                value={tpl.support_email}
                onChange={(e) => set('support_email', e.target.value)}
                inputMode="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={tpl.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save template
            </Button>
            <Button variant="outline" onClick={() => setTpl(DEFAULTS)} disabled={saving}>
              <RotateCcw className="h-4 w-4" /> Reset to default
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live preview</CardTitle>
          <p className="text-xs text-muted-foreground">
            Example with a UGX 9,999 MTN MoMo payment. {preview.length} characters · {segments} SMS
            {segments > 1 ? ' parts' : ' part'}.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {preview}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
