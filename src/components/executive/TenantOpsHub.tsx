import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, History, MapPin, Home, BarChart3 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TenantOpsDashboard } from './TenantOpsDashboard';
import { TenantOpsDashboardV2 } from './TenantOpsDashboardV2';
import { TenantOpsGeoCommandCenter } from './tenant-ops/TenantOpsGeoCommandCenter';
import { AgentInactiveAlertBanner } from '@/components/ops/AgentInactiveAlertBanner';
import { BehaviorDrawer } from '@/components/ops/BehaviorDrawer';
import { TenantPhoneDuplicatePanel } from '@/components/ops/TenantPhoneDuplicatePanel';
import { WelileHomesAdminPanel } from '@/components/ops/WelileHomesAdminPanel';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'tenant-ops-view-mode';

type Mode = 'analytics' | 'v2' | 'classic';

export function TenantOpsHub() {
  const [mode, setMode] = useState<Mode>('analytics');
  const [opsUserId, setOpsUserId] = useState<string | null>(null);
  const [behaviorTenantId, setBehaviorTenantId] = useState<string | null>(null);
  const [welileHomesOpen, setWelileHomesOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'classic' || saved === 'v2' || saved === 'analytics') setMode(saved);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setOpsUserId(data.user?.id ?? null));
  }, []);

  const setAndSave = (m: Mode) => {
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
          variant="outline"
          size="sm"
          onClick={() => setWelileHomesOpen(true)}
          className="gap-1.5"
        >
          <Home className="h-3.5 w-3.5" /> Welile Homes
        </Button>
        <Button
          variant={mode === 'analytics' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAndSave('analytics')}
          className="gap-1.5"
        >
          <BarChart3 className="h-3.5 w-3.5" /> Analytics
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
      {mode === 'analytics' ? (
        <TenantOpsGeoCommandCenter />
      ) : mode === 'v2' ? (
        <TenantOpsDashboardV2 />
      ) : (
        <>
          {/* Classic view enhancement: the same live hierarchical insight band
              sits above the legacy operational tools. */}
          <TenantOpsGeoCommandCenter />
          <TenantOpsDashboard />
        </>
      )}

      <BehaviorDrawer
        tenantId={behaviorTenantId}
        onOpenChange={(open) => { if (!open) setBehaviorTenantId(null); }}
      />

      <Sheet open={welileHomesOpen} onOpenChange={setWelileHomesOpen}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Home className="h-5 w-5 text-primary" /> Welile Homes — Agent-Managed Tenants</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <WelileHomesAdminPanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
