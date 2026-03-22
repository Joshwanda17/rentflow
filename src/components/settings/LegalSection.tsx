import { useState, lazy, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantAgreement } from '@/hooks/useTenantAgreement';
import { useAgentAgreement } from '@/hooks/useAgentAgreement';
import { useSupporterAgreement } from '@/hooks/useSupporterAgreement';
import type { AppRole } from '@/hooks/useAuth';

const TenantAgreementModal = lazy(() => import('@/components/tenant/agreement').then(m => ({ default: m.TenantAgreementModal })));
const AgentAgreementModal = lazy(() => import('@/components/agent/agreement').then(m => ({ default: m.AgentAgreementModal })));
const SupporterAgreementModal = lazy(() => import('@/components/supporter/agreement').then(m => ({ default: m.SupporterAgreementModal })));

function AgreementRow({ label, accepted, acceptedAt, onView, note }: { label: string; accepted: boolean; acceptedAt?: string | null; onView: () => void; note?: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/30">
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {accepted && acceptedAt ? `Accepted ${new Date(acceptedAt).toLocaleDateString()}` : note || (accepted ? 'Accepted' : 'Not yet accepted')}
          </p>
        </div>
      </div>
      <Button variant={accepted ? "outline" : "default"} size="sm" onClick={onView} className="shrink-0 text-xs h-8">
        {accepted ? 'View' : 'Accept'}
      </Button>
    </div>
  );
}

export default function LegalSection({ roles }: { roles: AppRole[] }) {
  const tenantAgreement = useTenantAgreement();
  const agentAgreement = useAgentAgreement();
  const supporterAgreement = useSupporterAgreement();

  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showSupporterModal, setShowSupporterModal] = useState(false);

  return (
    <>
      <Card className="border-border/40 shadow-md rounded-2xl">
        <CardContent className="pt-5 space-y-3">
          {roles.includes('tenant') && (
            <AgreementRow
              label="Tenant Agreement"
              accepted={tenantAgreement.isAccepted || false}
              acceptedAt={tenantAgreement.acceptance?.accepted_at}
              onView={() => setShowTenantModal(true)}
            />
          )}
          {roles.includes('agent') && (
            <AgreementRow
              label="Agent Agreement"
              accepted={agentAgreement.isAccepted || false}
              acceptedAt={agentAgreement.acceptance?.accepted_at}
              onView={() => setShowAgentModal(true)}
            />
          )}
          {roles.includes('supporter') && (
            <AgreementRow
              label="Supporter Agreement"
              accepted={supporterAgreement.hasAccepted || false}
              acceptedAt={supporterAgreement.acceptance?.accepted_at}
              onView={() => setShowSupporterModal(true)}
              note="Implicitly agreed by using the platform"
            />
          )}
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        {roles.includes('tenant') && showTenantModal && (
          <TenantAgreementModal isOpen={showTenantModal} onClose={() => setShowTenantModal(false)} onAccept={tenantAgreement.acceptAgreement} viewOnly={tenantAgreement.isAccepted || false} />
        )}
        {roles.includes('agent') && showAgentModal && (
          <AgentAgreementModal isOpen={showAgentModal} onClose={() => setShowAgentModal(false)} onAccept={async () => true} viewOnly />
        )}
        {roles.includes('supporter') && showSupporterModal && (
          <SupporterAgreementModal open={showSupporterModal} onOpenChange={setShowSupporterModal} onAccept={supporterAgreement.acceptAgreement} />
        )}
      </Suspense>
    </>
  );
}
