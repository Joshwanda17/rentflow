import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, History } from 'lucide-react';
import { TenantOpsDashboard } from './TenantOpsDashboard';
import { TenantOpsDashboardV2 } from './TenantOpsDashboardV2';
import { GeographicCoveragePanel } from './GeographicCoveragePanel';

const STORAGE_KEY = 'tenant-ops-view-mode';

export function TenantOpsHub() {
  const [mode, setMode] = useState<'v2' | 'classic'>('v2');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'classic' || saved === 'v2') setMode(saved);
  }, []);

  const setAndSave = (m: 'v2' | 'classic') => {
    setMode(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  return (
    <div className="space-y-3">
      <GeographicCoveragePanel />
      <div className="flex items-center justify-end gap-2">
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
    </div>
  );
}
