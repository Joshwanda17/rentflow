import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Check, X, Clock, Loader2, Phone, Bell } from 'lucide-react';
import { useWhatsAppRequests } from '@/hooks/useWhatsAppRequests';
import { getWhatsAppLink } from '@/lib/phoneUtils';
import { formatDistanceToNow } from 'date-fns';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface WhatsAppRequestsSheetProps {
  trigger?: React.ReactNode;
}

export function WhatsAppRequestsSheet({ trigger }: WhatsAppRequestsSheetProps) {
  const { 
    incomingRequests, 
    outgoingRequests, 
    respondToRequest,
    pendingIncomingCount,
    loading 
  } = useWhatsAppRequests();
  
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const handleRespond = async (requestId: string, approve: boolean) => {
    setRespondingId(requestId);
    hapticTap();
    
    const success = await respondToRequest(requestId, approve);
    if (success) {
      hapticSuccess();
    }
    
    setRespondingId(null);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="relative">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            {pendingIncomingCount > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-[10px]"
              >
                {pendingIncomingCount}
              </Badge>
            )}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            WhatsApp Requests
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="incoming" className="mt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="incoming" className="relative">
              Incoming
              {pendingIncomingCount > 0 && (
                <Badge className="ml-2 h-5 px-1.5 bg-destructive text-[10px]">
                  {pendingIncomingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="outgoing">My Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="incoming" className="mt-4">
            <ScrollArea className="h-[calc(100vh-200px)]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : incomingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No incoming requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incomingRequests.map((request) => (
                    <div 
                      key={request.id}
                      className={cn(
                        "p-4 rounded-lg border",
                        request.status === 'pending' && "bg-primary/5 border-primary/20",
                        request.status === 'approved' && "bg-success/5 border-success/20",
                        request.status === 'rejected' && "bg-muted/50 border-muted"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={request.requester?.avatar_url || undefined} />
                          <AvatarFallback>
                            {getInitials(request.requester?.full_name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {request.requester?.full_name || 'Unknown User'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                          </p>
                          {request.message && (
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              "{request.message}"
                            </p>
                          )}
                        </div>

                        <Badge 
                          variant="outline"
                          className={cn(
                            request.status === 'pending' && "text-warning border-warning/30",
                            request.status === 'approved' && "text-success border-success/30",
                            request.status === 'rejected' && "text-muted-foreground"
                          )}
                        >
                          {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                          {request.status === 'approved' && <Check className="h-3 w-3 mr-1" />}
                          {request.status === 'rejected' && <X className="h-3 w-3 mr-1" />}
                          {request.status}
                        </Badge>
                      </div>

                      {request.status === 'pending' && (
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            className="flex-1 bg-success hover:bg-success/90"
                            onClick={() => handleRespond(request.id, true)}
                            disabled={respondingId === request.id}
                          >
                            {respondingId === request.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleRespond(request.id, false)}
                            disabled={respondingId === request.id}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="outgoing" className="mt-4">
            <ScrollArea className="h-[calc(100vh-200px)]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : outgoingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No outgoing requests</p>
                  <p className="text-sm mt-1">Tap the WhatsApp icon on a user to send a request</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {outgoingRequests.map((request) => (
                    <div 
                      key={request.id}
                      className={cn(
                        "p-4 rounded-lg border",
                        request.status === 'pending' && "bg-warning/5 border-warning/20",
                        request.status === 'approved' && "bg-success/5 border-success/20",
                        request.status === 'rejected' && "bg-muted/50 border-muted"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={request.target?.avatar_url || undefined} />
                          <AvatarFallback>
                            {getInitials(request.target?.full_name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {request.target?.full_name || 'Unknown User'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                          </p>
                        </div>

                        <Badge 
                          variant="outline"
                          className={cn(
                            request.status === 'pending' && "text-warning border-warning/30",
                            request.status === 'approved' && "text-success border-success/30",
                            request.status === 'rejected' && "text-muted-foreground"
                          )}
                        >
                          {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                          {request.status === 'approved' && <Check className="h-3 w-3 mr-1" />}
                          {request.status === 'rejected' && <X className="h-3 w-3 mr-1" />}
                          {request.status}
                        </Badge>
                      </div>

                      {request.status === 'approved' && request.target?.phone && (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            className="w-full bg-[#25D366] hover:bg-[#20BD5A] text-white"
                            onClick={() => window.open(getWhatsAppLink(request.target!.phone), '_blank')}
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Open WhatsApp
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
