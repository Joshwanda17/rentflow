import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Crown, Cpu, Megaphone, Users, Home, Shield, HeartHandshake, MessageSquare } from 'lucide-react';
import { CEODashboard } from '@/components/executive/CEODashboard';
import { CTODashboard } from '@/components/executive/CTODashboard';
import { CMODashboard } from '@/components/executive/CMODashboard';
import { AgentOpsDashboard } from '@/components/executive/AgentOpsDashboard';
import { TenantOpsDashboard } from '@/components/executive/TenantOpsDashboard';
import { LandlordOpsDashboard } from '@/components/executive/LandlordOpsDashboard';
import { PartnersOpsDashboard } from '@/components/executive/PartnersOpsDashboard';
import { CRMDashboard } from '@/components/executive/CRMDashboard';

const tabs = [
  { id: 'ceo', label: 'CEO', icon: Crown, group: 'Executive' },
  { id: 'cto', label: 'CTO', icon: Cpu, group: 'Executive' },
  { id: 'cmo', label: 'CMO', icon: Megaphone, group: 'Executive' },
  { id: 'agent-ops', label: 'Agent Ops', icon: Users, group: 'Department' },
  { id: 'tenant-ops', label: 'Tenant Ops', icon: Home, group: 'Department' },
  { id: 'landlord-ops', label: 'Landlord Ops', icon: Home, group: 'Department' },
  { id: 'partners-ops', label: 'Partners Ops', icon: Shield, group: 'Department' },
  { id: 'crm', label: 'CRM', icon: MessageSquare, group: 'Department' },
];

export default function ExecutiveHub() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('ceo');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">Executive & Operations Hub</h1>
            <p className="text-xs text-muted-foreground">Role-based dashboards & reports</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Scrollable tab strip */}
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <TabsList className="inline-flex h-auto p-1 bg-muted/50 rounded-xl gap-1 min-w-max">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap min-h-[44px]"
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Dashboard Content */}
          <div className="mt-4">
            <TabsContent value="ceo"><CEODashboard /></TabsContent>
            <TabsContent value="cto"><CTODashboard /></TabsContent>
            <TabsContent value="cmo"><CMODashboard /></TabsContent>
            <TabsContent value="agent-ops"><AgentOpsDashboard /></TabsContent>
            <TabsContent value="tenant-ops"><TenantOpsDashboard /></TabsContent>
            <TabsContent value="landlord-ops"><LandlordOpsDashboard /></TabsContent>
            <TabsContent value="partners-ops"><PartnersOpsDashboard /></TabsContent>
            <TabsContent value="crm"><CRMDashboard /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
