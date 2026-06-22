import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, History, MapPin } from 'lucide-react';
import { TenantOpsDashboard } from './TenantOpsDashboard';
import { TenantOpsDashboardV2 } from './TenantOpsDashboardV2';
import { AgentInactiveAlertBanner } from '@/components/ops/AgentInactiveAlertBanner';
import { BehaviorDrawer } from '@/components/ops/BehaviorDrawer';
import { TenantPhoneDuplicatePanel } from '@/components/ops/TenantPhoneDuplicatePanel';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'tenant-ops-view-mode';

export function TenantOpsHub() {
  const [mode, setMode] = useState<'v2' | 'classic'>('v2');
  const [opsUserId, setOpsUserId] = useState<string | null>(null);
  const [behaviorTenantId, setBehaviorTenantId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'classic' || saved === 'v2') setMode(saved);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setOpsUserId(data.user?.id ?? null));
  }, []);

  const setAndSave = (m: 'v2' | 'classic') => {
    setMode(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  return (
    <div className="space-y-3">
      <AgentInactiveAlertBanner opsUserId={opsUserId} onOpenBehavior={setBehaviorTenantId} />

      <TenantPhoneDuplicatePanel />

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/executive-hub?tab=locations')}
          className="gap-1.5 mr-auto"
        >
          <MapPin className="h-3.5 w-3.5" /> Manage Locations
        </Button>
        <Button
          variant={mode === 'v2' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAndSave('v2')}
          className="gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" /> New
        </Button>
        <Button
          variant={mode === 'classic' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAndSave('classic')}
          className="gap-1.5"
        >
          <History className="h-3.5 w-3.5" /> Classic
        </Button>
      </div>
      {mode === 'v2' ? <TenantOpsDashboardV2 /> : <TenantOpsDashboard />}

      <BehaviorDrawer
        tenantId={behaviorTenantId}
        onOpenChange={(open) => { if (!open) setBehaviorTenantId(null); }}
      />
    </div>
  );
}
