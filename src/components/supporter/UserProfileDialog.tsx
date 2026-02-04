import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/UserAvatar';
import { ContactActionsBar } from '@/components/chat/ContactActionsBar';
import { WhatsAppRequestButton } from '@/components/chat/WhatsAppRequestButton';
import { MapPin, Calendar, Home, Building, Users, Phone, Shield, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    name: string;
    avatarUrl?: string;
    type: 'tenant' | 'landlord' | 'agent';
    createdAt?: string;
    phone?: string;
    // Landlord-specific fields
    propertyAddress?: string;
    verified?: boolean;
    readyToReceive?: boolean;
    hasSmartphone?: boolean;
    numberOfHouses?: number;
    desiredRent?: number;
    electricityMeter?: string;
    caretakerName?: string;
    caretakerPhone?: string;
    // Agent-specific fields
    city?: string;
    country?: string;
    tenantCount?: number;
    // Tenant-specific fields
    hasRentRequest?: boolean;
  } | null;
}

export function UserProfileDialog({ open, onOpenChange, user }: UserProfileDialogProps) {
  if (!user) return null;

  const getRoleBadge = () => {
    switch (user.type) {
      case 'tenant':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
            🏠 Tenant
          </Badge>
        );
      case 'landlord':
        return (
          <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/30">
            🏢 Landlord
          </Badge>
        );
      case 'agent':
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            🤝 Agent
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="pb-0">
          <div className="flex flex-col items-center gap-3 pt-2">
            <UserAvatar 
              fullName={user.name} 
              avatarUrl={user.avatarUrl} 
              size="lg" 
            />
            <div className="text-center">
              <DialogTitle className="text-lg">{user.name}</DialogTitle>
              <div className="flex justify-center mt-2">
                {getRoleBadge()}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Contact Actions - Always show but phone will use WhatsApp request system */}
          <div className="flex justify-center">
            {user.type === 'landlord' ? (
              <div className="flex items-center gap-2">
                <WhatsAppRequestButton
                  targetUserId={user.id}
                  targetName={user.name}
                  targetPhone={user.phone}
                  size="default"
                  variant="outline"
                  showLabel
                />
              </div>
            ) : (
              <ContactActionsBar
                userId={user.id}
                userName={user.name}
                // Phone intentionally not passed to hide direct calling
                showLabels
              />
            )}
          </div>

          {/* User Info */}
          <div className="space-y-3 bg-muted/30 rounded-lg p-3">
            {/* Joined date */}
            {user.createdAt && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Joined</span>
                <span className="ml-auto font-medium">
                  {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                </span>
              </div>
            )}

            {/* Landlord-specific info */}
            {user.type === 'landlord' && (
              <>
                {user.propertyAddress && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">Property</span>
                    <span className="ml-auto font-medium text-right max-w-[160px]">
                      {user.propertyAddress}
                    </span>
                  </div>
                )}
                {user.numberOfHouses && user.numberOfHouses > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Houses</span>
                    <span className="ml-auto font-medium">{user.numberOfHouses}</span>
                  </div>
                )}
                {user.verified !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Verified</span>
                    <span className="ml-auto">
                      {user.verified ? (
                        <Badge className="bg-success/10 text-success border-success/30 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                      )}
                    </span>
                  </div>
                )}
                {user.readyToReceive !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Ready to Receive</span>
                    <span className="ml-auto">
                      {user.readyToReceive ? (
                        <Badge className="bg-success/10 text-success border-success/30 text-xs">Yes</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">No</Badge>
                      )}
                    </span>
                  </div>
                )}
                {user.hasSmartphone !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Has Smartphone</span>
                    <span className="ml-auto">
                      {user.hasSmartphone ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">Yes</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">No</Badge>
                      )}
                    </span>
                  </div>
                )}
                {user.caretakerName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Caretaker</span>
                    <span className="ml-auto font-medium">{user.caretakerName}</span>
                  </div>
                )}
              </>
            )}

            {/* Agent-specific info */}
            {user.type === 'agent' && (
              <>
                {(user.city || user.country) && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Location</span>
                    <span className="ml-auto font-medium">
                      {[user.city, user.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {user.tenantCount !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Tenants Referred</span>
                    <span className="ml-auto font-medium">{user.tenantCount}</span>
                  </div>
                )}
              </>
            )}

            {/* Tenant-specific info */}
            {user.type === 'tenant' && (
              <>
                {user.hasRentRequest !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Rent Request</span>
                    <span className="ml-auto">
                      {user.hasRentRequest ? (
                        <Badge className="bg-success/10 text-success border-success/30 text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">None</Badge>
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Privacy notice */}
          <p className="text-xs text-muted-foreground text-center">
            Phone numbers are hidden for privacy. Use in-app chat or request WhatsApp access.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
