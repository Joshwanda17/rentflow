import { useNavigate, useSearchParams } from 'react-router-dom';
import { roleToSlug } from '@/lib/roleRoutes';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download } from 'lucide-react';
import { CEODashboard } from '@/components/executive/CEODashboard';
import { CTODashboard } from '@/components/executive/CTODashboard';
import { CMODashboard } from '@/components/executive/CMODashboard';
import { AgentOpsDashboard } from '@/components/executive/AgentOpsDashboard';
import { TenantOpsDashboard } from '@/components/executive/TenantOpsDashboard';
import { LandlordOpsDashboard } from '@/components/executive/LandlordOpsDashboard';
import { PartnersOpsDashboard } from '@/components/executive/PartnersOpsDashboard';
import { CRMDashboard } from '@/components/executive/CRMDashboard';

const dashboards: Record<string, { title: string; component: React.FC }> = {
  ceo: { title: 'CEO Dashboard', component: CEODashboard },
  cto: { title: 'CTO Dashboard', component: CTODashboard },
  cmo: { title: 'CMO Dashboard', component: CMODashboard },
  'agent-ops': { title: 'Agent Operations', component: AgentOpsDashboard },
  'tenant-ops': { title: 'Tenant Operations', component: TenantOpsDashboard },
  'landlord-ops': { title: 'Landlord Operations', component: LandlordOpsDashboard },
  'partners-ops': { title: 'Partners Operations', component: PartnersOpsDashboard },
  crm: { title: 'CRM Dashboard', component: CRMDashboard },
};

export default function ExecutiveHub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'ceo';
  const current = dashboards[tab] || dashboards.ceo;
  const DashboardComponent = current.component;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/tenant')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate">{current.title}</h1>
            <p className="text-xs text-muted-foreground">Executive & Operations Hub</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={async () => {
              const res = await fetch('/EXECUTIVE_HUB_GUIDE.md');
              const text = await res.text();
              const blob = new Blob([text], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'Executive_Hub_Guide.md';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Guide</span>
          </Button>
        </div>
      </header>
      <div className="max-w-7xl mx-auto p-4">
        <DashboardComponent />
      </div>
    </div>
  );
}
