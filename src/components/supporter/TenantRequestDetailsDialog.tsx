import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  User, MapPin, Phone, Building, Calendar, Clock, 
  CheckCircle2, XCircle, AlertCircle, Shield, 
  Wallet, TrendingUp, CreditCard, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { format } from 'date-fns';

interface TenantRequestDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  onPayLandlord: (request: RentRequestDetails) => void;
}

interface RentRequestDetails {
  id: string;
  rent_amount: number;
  duration_days: number;
  access_fee: number;
  request_fee: number;
  total_repayment: number;
  daily_repayment: number;
  status: string;
  created_at: string;
  agent_verified: boolean;
  agent_verified_at: string | null;
  manager_verified: boolean;
  manager_verified_at: string | null;
  tenant: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
  };
  landlord: {
    id: string;
    name: string;
    phone: string;
    mobile_money_number: string | null;
    property_address: string;
    verified: boolean;
    ready_to_receive: boolean;
  };
  lc1: {
    name: string;
    phone: string;
    village: string;
  };
  agent?: {
    full_name: string;
    phone: string;
  };
}

export function TenantRequestDetailsDialog({ 
  open, 
  onOpenChange, 
  requestId,
  onPayLandlord 
}: TenantRequestDetailsDialogProps) {
  const [request, setRequest] = useState<RentRequestDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && requestId) {
      fetchRequestDetails();
    }
  }, [open, requestId]);

  const fetchRequestDetails = async () => {
    if (!requestId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('rent_requests')
      .select(`
        id, rent_amount, duration_days, access_fee, request_fee, 
        total_repayment, daily_repayment, status, created_at,
        agent_verified, agent_verified_at, manager_verified, manager_verified_at,
        tenant:profiles!rent_requests_tenant_id_fkey(id, full_name, phone, email),
        landlord:landlords!rent_requests_landlord_id_fkey(id, name, phone, mobile_money_number, property_address, verified, ready_to_receive),
        lc1:lc1_chairpersons!rent_requests_lc1_id_fkey(name, phone, village),
        agent:profiles!rent_requests_agent_id_fkey(full_name, phone)
      `)
      .eq('id', requestId)
      .single();

    if (data && !error) {
      setRequest(data as unknown as RentRequestDetails);
    }
    setLoading(false);
  };

  const getVerificationStatus = () => {
    if (!request) return { level: 0, message: '', color: '' };
    
    const agentVerified = request.agent_verified;
    const managerVerified = request.manager_verified;
    const landlordVerified = request.landlord?.verified;
    const landlordReady = request.landlord?.ready_to_receive;

    if (landlordReady && managerVerified && agentVerified) {
      return { 
        level: 4, 
        message: 'Landlord Ready to Receive Payment', 
        color: 'bg-success text-success-foreground' 
      };
    }
    if (managerVerified && agentVerified && landlordVerified) {
      return { 
        level: 3, 
        message: 'All Verifications Complete', 
        color: 'bg-success/80 text-white' 
      };
    }
    if (managerVerified && agentVerified) {
      return { 
        level: 2, 
        message: 'Awaiting Landlord Verification', 
        color: 'bg-warning text-warning-foreground' 
      };
    }
    if (agentVerified) {
      return { 
        level: 1, 
        message: 'Agent Verified - Awaiting Manager', 
        color: 'bg-primary/80 text-white' 
      };
    }
    return { 
      level: 0, 
      message: 'Pending Verification', 
      color: 'bg-muted text-muted-foreground' 
    };
  };

  const reward = request ? calculateSupporterReward(Number(request.rent_amount)) : 0;
  const verificationStatus = getVerificationStatus();
  const canPayLandlord = verificationStatus.level >= 4;

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-lg font-bold">Rent Request Details</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] px-4 pb-4">
          <div className="space-y-4">
            {/* Verification Status Banner */}
            <Card className={`border-0 ${verificationStatus.color}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <Shield className="h-5 w-5" />
                <div>
                  <p className="font-bold text-sm">{verificationStatus.message}</p>
                  <p className="text-xs opacity-80">
                    {canPayLandlord 
                      ? 'You can now pay the landlord directly'
                      : 'Payment will be enabled once all verifications are complete'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Amount Summary */}
            <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-success/5">
              <CardContent className="p-4">
                <div className="text-center mb-3">
                  <p className="text-xs text-muted-foreground">Rent Amount Requested</p>
                  <p className="text-2xl font-black text-primary">{formatUGX(Number(request.rent_amount))}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded-lg bg-success/10 text-center">
                    <TrendingUp className="h-4 w-4 text-success mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Your Reward (15%)</p>
                    <p className="font-bold text-success">{formatUGX(reward)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10 text-center">
                    <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-bold text-primary">{request.duration_days} Days</p>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  💡 Payment goes directly to the verified landlord
                </p>
              </CardContent>
            </Card>

            {/* Verification Steps */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Verification Progress
              </h3>
              <div className="space-y-2">
                <VerificationStep
                  label="Agent Verification"
                  verified={request.agent_verified}
                  verifiedAt={request.agent_verified_at}
                  description={request.agent?.full_name ? `By ${request.agent.full_name}` : undefined}
                />
                <VerificationStep
                  label="Manager Verification"
                  verified={request.manager_verified}
                  verifiedAt={request.manager_verified_at}
                  description="Platform approval"
                />
                <VerificationStep
                  label="Landlord Verified"
                  verified={request.landlord?.verified}
                  description="Landlord identity confirmed"
                />
                <VerificationStep
                  label="Ready to Receive"
                  verified={request.landlord?.ready_to_receive}
                  description="Landlord can receive payment"
                />
              </div>
            </div>

            <Separator />

            {/* Tenant Info */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Tenant Information
              </h3>
              <Card className="border-0 bg-muted/30">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{request.tenant?.full_name || 'Anonymous'}</span>
                  </div>
                  {request.tenant?.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{request.tenant.phone}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Landlord Info */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" />
                Landlord Information
              </h3>
              <Card className={`border-0 ${request.landlord?.ready_to_receive ? 'bg-success/10 border border-success/30' : 'bg-muted/30'}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{request.landlord?.name}</span>
                    </div>
                    {request.landlord?.verified && (
                      <Badge variant="outline" className="bg-success/20 text-success border-success/30 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{request.landlord?.phone}</span>
                  </div>
                  {request.landlord?.mobile_money_number && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" />
                      <span>MoMo: {request.landlord.mobile_money_number}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 mt-0.5" />
                    <span>{request.landlord?.property_address}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* LC1 Info */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                LC1 Chairperson (Reference)
              </h3>
              <Card className="border-0 bg-muted/30">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{request.lc1?.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{request.lc1?.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{request.lc1?.village}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Request Timeline */}
            <div>
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Request Timeline
              </h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Requested: {format(new Date(request.created_at), 'PPp')}</p>
                <p>Duration: {request.duration_days} days repayment period</p>
                <p>Daily repayment by tenant: {formatUGX(Number(request.daily_repayment))}</p>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-2">
              {canPayLandlord ? (
                <Button 
                  className="w-full h-12 font-bold text-base bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 shadow-lg"
                  onClick={() => onPayLandlord(request)}
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  Pay Landlord {formatUGX(Number(request.rent_amount))}
                </Button>
              ) : (
                <Button disabled className="w-full h-12 font-bold text-base" variant="outline">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Awaiting Verifications
                </Button>
              )}
              <p className="text-xs text-center text-muted-foreground mt-2">
                {canPayLandlord 
                  ? 'Pay via MTN or Airtel Mobile Money and submit proof'
                  : 'All verifications must be complete before you can pay'
                }
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function VerificationStep({ 
  label, 
  verified, 
  verifiedAt, 
  description 
}: { 
  label: string; 
  verified?: boolean; 
  verifiedAt?: string | null;
  description?: string;
}) {
  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg ${verified ? 'bg-success/10' : 'bg-muted/30'}`}>
      {verified ? (
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
      ) : (
        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${verified ? 'text-success' : 'text-muted-foreground'}`}>
          {label}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
      </div>
      {verified && verifiedAt && (
        <span className="text-xs text-muted-foreground shrink-0">
          {format(new Date(verifiedAt), 'MMM d')}
        </span>
      )}
    </div>
  );
}
