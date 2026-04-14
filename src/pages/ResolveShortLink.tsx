import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function ResolveShortLink() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) { setError(true); return; }

    (async () => {
      const { data, error: err } = await supabase
        .from('short_links')
        .select('target_path, target_params')
        .eq('code', code)
        .maybeSingle();

      if (err || !data) { setError(true); return; }

      const params = new URLSearchParams();
      const tp = data.target_params as Record<string, string>;
      Object.entries(tp).forEach(([k, v]) => params.set(k, v));

      const fullUrl = `${data.target_path}?${params.toString()}`;
      window.location.replace(`${window.location.origin}${fullUrl}`);
    })();
  }, [code]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Link not found</p>
          <p className="text-sm text-muted-foreground">This link may have expired or is invalid.</p>
          <button onClick={() => navigate('/auth')} className="text-primary underline text-sm">Go to sign up</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
