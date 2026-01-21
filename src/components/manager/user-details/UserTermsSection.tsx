import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Calendar, 
  CheckCircle, 
  XCircle,
  Smartphone,
  Globe,
  Shield
} from 'lucide-react';
import { format } from 'date-fns';

interface TenantAgreement {
  id: string;
  tenant_id: string;
  agreement_version: string;
  status: string;
  accepted_at: string;
  device_info: string | null;
  ip_address: string | null;
  created_at: string;
}

interface SupporterAgreement {
  id: string;
  supporter_id: string;
  agreement_version: string;
  status: string;
  accepted_at: string;
  device_info: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AgentAgreement {
  id: string;
  agent_id: string;
  agreement_version: string;
  status: string;
  accepted_at: string;
  device_info: string | null;
  ip_address: string | null;
  created_at: string;
}

interface UserTermsSectionProps {
  userId: string;
  userRoles: string[];
}

export default function UserTermsSection({ userId, userRoles }: UserTermsSectionProps) {
  const [tenantAgreement, setTenantAgreement] = useState<TenantAgreement | null>(null);
  const [supporterAgreement, setSupporterAgreement] = useState<SupporterAgreement | null>(null);
  const [agentAgreement, setAgentAgreement] = useState<AgentAgreement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgreements();
  }, [userId, userRoles]);

  const fetchAgreements = async () => {
    setLoading(true);
    try {
      // Fetch tenant agreement if user has tenant role
      let tenantData: TenantAgreement | null = null;
      if (userRoles.includes('tenant')) {
        const { data } = await supabase
          .from('tenant_agreement_acceptance')
          .select('*')
          .eq('tenant_id', userId)
          .order('accepted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        tenantData = data;
      }

      // Fetch supporter agreement if user has supporter role
      let supporterData: SupporterAgreement | null = null;
      if (userRoles.includes('supporter')) {
        const { data } = await supabase
          .from('supporter_agreement_acceptance')
          .select('*')
          .eq('supporter_id', userId)
          .order('accepted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        supporterData = data;
      }

      // Fetch agent agreement if user has agent role
      let agentData: AgentAgreement | null = null;
      if (userRoles.includes('agent')) {
        const { data } = await supabase
          .from('agent_agreement_acceptance')
          .select('*')
          .eq('agent_id', userId)
          .order('accepted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        agentData = data;
      }

      setTenantAgreement(tenantData);
      setSupporterAgreement(supporterData);
      setAgentAgreement(agentData);
    } catch (error) {
      console.error('Error fetching agreements:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'accepted') {
      return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
    }
    return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Not Accepted</Badge>;
  };

  const parseDeviceInfo = (deviceInfo: string | null) => {
    if (!deviceInfo) return 'Unknown device';
    try {
      // Try to extract meaningful info from user agent or device string
      if (deviceInfo.includes('Mobile')) return 'Mobile Device';
      if (deviceInfo.includes('Android')) return 'Android Device';
      if (deviceInfo.includes('iPhone') || deviceInfo.includes('iOS')) return 'iPhone/iOS';
      if (deviceInfo.includes('Windows')) return 'Windows PC';
      if (deviceInfo.includes('Mac')) return 'Mac';
      return deviceInfo.length > 50 ? deviceInfo.substring(0, 50) + '...' : deviceInfo;
    } catch {
      return deviceInfo;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const hasTenantRole = userRoles.includes('tenant');
  const hasSupporterRole = userRoles.includes('supporter');
  const hasAgentRole = userRoles.includes('agent');
  const noRelevantRoles = !hasTenantRole && !hasSupporterRole && !hasAgentRole;

  if (noRelevantRoles) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            No agreement requirements for this user's roles
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Agreements are required for Tenant, Supporter, and Agent roles
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {hasTenantRole && (
          <Card className={`p-3 ${tenantAgreement?.status === 'accepted' ? 'border-success/50' : 'border-warning/50'}`}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Shield className="h-3 w-3" />
              Tenant Agreement
            </div>
            {tenantAgreement?.status === 'accepted' ? (
              <>
                <div className="flex items-center gap-1 text-success">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-semibold text-sm">Accepted</span>
                </div>
                <p className="text-xs text-muted-foreground">v{tenantAgreement.agreement_version}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 text-warning">
                  <XCircle className="h-4 w-4" />
                  <span className="font-semibold text-sm">Not Accepted</span>
                </div>
                <p className="text-xs text-muted-foreground">Pending</p>
              </>
            )}
          </Card>
        )}
        {hasSupporterRole && (
          <Card className={`p-3 ${supporterAgreement?.status === 'accepted' ? 'border-success/50' : 'border-warning/50'}`}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Shield className="h-3 w-3" />
              Supporter Agreement
            </div>
            {supporterAgreement?.status === 'accepted' ? (
              <>
                <div className="flex items-center gap-1 text-success">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-semibold text-sm">Accepted</span>
                </div>
                <p className="text-xs text-muted-foreground">v{supporterAgreement.agreement_version}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 text-warning">
                  <XCircle className="h-4 w-4" />
                  <span className="font-semibold text-sm">Not Accepted</span>
                </div>
                <p className="text-xs text-muted-foreground">Pending</p>
              </>
            )}
          </Card>
        )}
        {hasAgentRole && (
          <Card className={`p-3 ${agentAgreement?.status === 'accepted' ? 'border-success/50' : 'border-warning/50'}`}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Shield className="h-3 w-3" />
              Agent Agreement
            </div>
            {agentAgreement?.status === 'accepted' ? (
              <>
                <div className="flex items-center gap-1 text-success">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-semibold text-sm">Accepted</span>
                </div>
                <p className="text-xs text-muted-foreground">v{agentAgreement.agreement_version}</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 text-warning">
                  <XCircle className="h-4 w-4" />
                  <span className="font-semibold text-sm">Not Accepted</span>
                </div>
                <p className="text-xs text-muted-foreground">Pending</p>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Tenant Agreement Details */}
      {hasTenantRole && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Tenant Terms & Conditions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {tenantAgreement ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {getStatusBadge(tenantAgreement.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">v{tenantAgreement.agreement_version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Accepted
                  </span>
                  <span className="text-sm font-medium">
                    {format(new Date(tenantAgreement.accepted_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
                {tenantAgreement.device_info && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Smartphone className="h-3 w-3" /> Device
                    </span>
                    <span className="text-sm font-medium text-right truncate max-w-[150px]">
                      {parseDeviceInfo(tenantAgreement.device_info)}
                    </span>
                  </div>
                )}
                {tenantAgreement.ip_address && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" /> IP Address
                    </span>
                    <span className="text-sm font-medium font-mono">
                      {tenantAgreement.ip_address}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <XCircle className="h-8 w-8 mx-auto text-warning mb-2" />
                <p className="text-sm text-muted-foreground">
                  Tenant has not accepted the agreement yet
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Supporter Agreement Details */}
      {hasSupporterRole && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-success" />
              Supporter Terms & Conditions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {supporterAgreement ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {getStatusBadge(supporterAgreement.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">v{supporterAgreement.agreement_version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Accepted
                  </span>
                  <span className="text-sm font-medium">
                    {format(new Date(supporterAgreement.accepted_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
                {supporterAgreement.device_info && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Smartphone className="h-3 w-3" /> Device
                    </span>
                    <span className="text-sm font-medium text-right truncate max-w-[150px]">
                      {parseDeviceInfo(supporterAgreement.device_info)}
                    </span>
                  </div>
                )}
                {supporterAgreement.ip_address && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" /> IP Address
                    </span>
                    <span className="text-sm font-medium font-mono">
                      {supporterAgreement.ip_address}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <XCircle className="h-8 w-8 mx-auto text-warning mb-2" />
                <p className="text-sm text-muted-foreground">
                  Supporter has not accepted the agreement yet
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
