import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FunderVisitDialog } from './FunderVisitDialog';
import { FunderPortfolioCard } from './FunderPortfolioCard';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import {
  Users, MapPin, MessageSquare, Loader2, Phone,
  Send, Eye, Calendar, Clock, HandCoins, Wallet,
} from 'lucide-react';

interface LinkedFunder {
  id: string;
  beneficiary_id: string;
  beneficiary_role: string;
  reason: string;
  created_at: string;
  beneficiary: {
    id: string;
    full_name: string;
    phone: string;
  } | null;
}

interface FunderStats {
  totalInvested: number;
  totalROI: number;
  activeCount: number;
  walletBalance: number;
}

interface FunderVisit {
  id: string;
  visit_type: string;
  location_name: string | null;
  notes: string | null;
  created_at: string;
  latitude: number;
  longitude: number;
}

export function FunderManagementSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [funders, setFunders] = useState<LinkedFunder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFunder, setSelectedFunder] = useState<LinkedFunder | null>(null);
  const [funderStats, setFunderStats] = useState<Record<string, FunderStats>>({});
  const [funderVisits, setFunderVisits] = useState<FunderVisit[]>([]);
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [sendingSMS, setSendingSMS] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (open && user) fetchFunders();
  }, [open, user]);

  const fetchFunders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('proxy_agent_assignments')
        .select('id, beneficiary_id, beneficiary_role, reason, created_at, beneficiary:beneficiary_id(id, full_name, phone)')
        .eq('agent_id', user.id)
        .eq('is_active', true)
        .eq('beneficiary_role', 'supporter')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFunders((data as any) || []);

      // Fetch stats for each funder
      if (data && data.length > 0) {
        const statsMap: Record<string, FunderStats> = {};
        for (const f of data) {
          const bid = (f as any).beneficiary?.id;
          if (!bid) continue;
          
          const [portfoliosRes, walletRes] = await Promise.all([
            supabase
              .from('investor_portfolios')
              .select('investment_amount, total_roi_earned, status')
              .eq('investor_id', bid)
              .in('status', ['active', 'matured']),
            supabase
              .from('wallets')
              .select('balance')
              .eq('user_id', bid)
              .maybeSingle(),
          ]);

          const portfolios = portfoliosRes.data || [];
          statsMap[bid] = {
            totalInvested: portfolios.reduce((s: number, p: any) => s + (p.investment_amount || 0), 0),
            totalROI: portfolios.reduce((s: number, p: any) => s + (p.total_roi_earned || 0), 0),
            activeCount: portfolios.filter((p: any) => p.status === 'active').length,
            walletBalance: walletRes.data?.balance || 0,
          };
        }
        setFunderStats(statsMap);
      }
    } catch (err: any) {
      console.error('Error fetching funders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVisits = async (funderId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('funder_visits')
      .select('id, visit_type, location_name, notes, created_at, latitude, longitude')
      .eq('agent_id', user.id)
      .eq('funder_id', funderId)
      .order('created_at', { ascending: false })
      .limit(20);
    setFunderVisits((data as any) || []);
  };

  const handleSelectFunder = (f: LinkedFunder) => {
    setSelectedFunder(f);
    setTab('overview');
    if (f.beneficiary?.id) fetchVisits(f.beneficiary.id);
  };

  const handleSendStatement = async (funder: LinkedFunder) => {
    if (!funder.beneficiary || !user) return;
    setSendingSMS(funder.beneficiary.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-funder-statement', {
        body: { funder_id: funder.beneficiary.id, agent_id: user.id },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: '📱 Statement sent!', description: `SMS sent to ${funder.beneficiary.full_name}` });
      } else {
        toast({ title: 'SMS may not have delivered', description: 'Check with the funder', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSendingSMS(null);
    }
  };

  const visitTypeLabel: Record<string, string> = {
    routine: '📋 Routine',
    collection: '💰 Collection',
    statement_delivery: '📄 Statement',
    dispute_resolution: '⚠️ Dispute',
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-2xl p-0">
          <SheetHeader className="p-4 pb-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <HandCoins className="h-5 w-5 text-primary" />
              My Funders (No Smartphone)
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(92vh-60px)]">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : funders.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No funders assigned</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ask your manager to link you as proxy for a no-smartphone funder
                </p>
              </div>
            ) : !selectedFunder ? (
              /* Funder List */
              <div className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {funders.length} funder{funders.length !== 1 ? 's' : ''} assigned to you
                </p>
                {funders.map(f => {
                  const stats = f.beneficiary?.id ? funderStats[f.beneficiary.id] : null;
                  return (
                    <Card
                      key={f.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors active:scale-[0.98]"
                      onClick={() => handleSelectFunder(f)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">{f.beneficiary?.full_name || 'Funder'}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0">💼 Funder</Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{f.beneficiary?.phone}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {stats && (
                              <>
                                <p className="text-xs font-bold">{formatUGX(stats.totalInvested)}</p>
                                <p className="text-[10px] text-success">+{formatUGX(stats.totalROI)}</p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-1.5 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1 flex-1"
                            onClick={(e) => { e.stopPropagation(); handleSendStatement(f); }}
                            disabled={sendingSMS === f.beneficiary?.id}
                          >
                            {sendingSMS === f.beneficiary?.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            SMS Statement
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1 flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFunder(f);
                              setVisitDialogOpen(true);
                            }}
                          >
                            <MapPin className="h-3 w-3" />
                            Log Visit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              /* Funder Detail View */
              <div className="p-4 space-y-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs -ml-2"
                  onClick={() => setSelectedFunder(null)}
                >
                  ← All Funders
                </Button>

                {selectedFunder.beneficiary && funderStats[selectedFunder.beneficiary.id] && (
                  <FunderPortfolioCard
                    funder={selectedFunder.beneficiary}
                    stats={funderStats[selectedFunder.beneficiary.id]}
                  />
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex-col gap-1.5 text-xs"
                    onClick={() => handleSendStatement(selectedFunder)}
                    disabled={sendingSMS === selectedFunder.beneficiary?.id}
                  >
                    {sendingSMS === selectedFunder.beneficiary?.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <MessageSquare className="h-5 w-5 text-primary" />
                    )}
                    Send SMS
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex-col gap-1.5 text-xs"
                    onClick={() => setVisitDialogOpen(true)}
                  >
                    <MapPin className="h-5 w-5 text-success" />
                    Log Visit
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex-col gap-1.5 text-xs"
                    onClick={() => {
                      if (selectedFunder.beneficiary?.phone) {
                        window.location.href = `tel:${selectedFunder.beneficiary.phone}`;
                      }
                    }}
                  >
                    <Phone className="h-5 w-5 text-warning" />
                    Call
                  </Button>
                </div>

                {/* Tabs: Overview / Visits */}
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="overview" className="flex-1 text-xs gap-1">
                      <Eye className="h-3 w-3" /> Overview
                    </TabsTrigger>
                    <TabsTrigger value="visits" className="flex-1 text-xs gap-1">
                      <Calendar className="h-3 w-3" /> Visits
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-3 space-y-3">
                    <Card>
                      <CardContent className="p-3">
                        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5 text-primary" /> What They Can Do via USSD
                        </h4>
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <p>📞 Dial the Welile shortcode to:</p>
                          <div className="pl-4 space-y-1">
                            <p>1️⃣ Check investment balance & returns</p>
                            <p>2️⃣ View last return payment</p>
                            <p>3️⃣ Check wallet balance</p>
                            <p>4️⃣ Request help / report issues</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-3">
                        <h4 className="text-xs font-semibold mb-2">📋 Your Responsibilities</h4>
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <p>✅ Collect physical cash & deposit to their wallet</p>
                          <p>✅ Invest collected funds on their behalf</p>
                          <p>✅ Send SMS statements regularly</p>
                          <p>✅ Log visits with GPS for accountability</p>
                          <p>✅ Process withdrawal requests (needs 4-stage approval)</p>
                          <p>⚠️ All proxy actions are audited & flagged</p>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="visits" className="mt-3 space-y-2">
                    {funderVisits.length === 0 ? (
                      <div className="text-center py-8">
                        <MapPin className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">No visits logged yet</p>
                        <Button
                          size="sm"
                          className="mt-3 gap-1.5"
                          onClick={() => setVisitDialogOpen(true)}
                        >
                          <MapPin className="h-3.5 w-3.5" /> Log First Visit
                        </Button>
                      </div>
                    ) : (
                      funderVisits.map(v => (
                        <Card key={v.id}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {visitTypeLabel[v.visit_type] || v.visit_type}
                                </Badge>
                                {v.location_name && (
                                  <span className="text-xs text-muted-foreground">{v.location_name}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {format(new Date(v.created_at), 'MMM d, HH:mm')}
                              </div>
                            </div>
                            {v.notes && (
                              <p className="text-xs text-muted-foreground mt-1.5">{v.notes}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              📍 {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}
                            </p>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <FunderVisitDialog
        open={visitDialogOpen}
        onOpenChange={setVisitDialogOpen}
        funder={selectedFunder?.beneficiary || null}
        onSuccess={() => {
          if (selectedFunder?.beneficiary?.id) fetchVisits(selectedFunder.beneficiary.id);
        }}
      />
    </>
  );
}
