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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FunderPortfolioCard } from './FunderPortfolioCard';
import { AgentDepositDialog } from './AgentDepositDialog';
import { formatUGX } from '@/lib/rentCalculations';
import { usePhoneDuplicateCheck } from '@/hooks/usePhoneDuplicateCheck';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';
import { format } from 'date-fns';
import {
  Users, MessageSquare, Loader2, Phone, Send, Eye, HandCoins, Wallet, UserPlus, AlertCircle, Banknote,
  Home, TrendingUp, Calendar, CircleDot,
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

interface FunderPortfolio {
  id: string;
  account_name: string | null;
  portfolio_code: string;
  investment_amount: number;
  total_roi_earned: number;
  roi_percentage: number;
  status: string;
  duration_months: number;
  maturity_date: string | null;
  next_roi_date: string | null;
  created_at: string;
}

export function FunderManagementSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [funders, setFunders] = useState<LinkedFunder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFunder, setSelectedFunder] = useState<LinkedFunder | null>(null);
  const [funderStats, setFunderStats] = useState<Record<string, FunderStats>>({});
  const [funderPortfolios, setFunderPortfolios] = useState<FunderPortfolio[]>([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(false);
  const [sendingSMS, setSendingSMS] = useState<string | null>(null);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositPhone, setDepositPhone] = useState('');

  // Register dialog state
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regNotes, setRegNotes] = useState('');
  const [registering, setRegistering] = useState(false);
  const { isDuplicate, isChecking, duplicateMessage } = usePhoneDuplicateCheck(regPhone);

  useEffect(() => {
    if (open && user) fetchFunders();
  }, [open, user]);

  // Fetch individual portfolios when a funder is selected
  useEffect(() => {
    if (!selectedFunder?.beneficiary?.id) {
      setFunderPortfolios([]);
      return;
    }
    const fetchPortfolios = async () => {
      setLoadingPortfolios(true);
      try {
        const { data } = await supabase
          .from('investor_portfolios')
          .select('id, account_name, portfolio_code, investment_amount, total_roi_earned, roi_percentage, status, duration_months, maturity_date, next_roi_date, created_at')
          .eq('investor_id', selectedFunder.beneficiary!.id)
          .order('created_at', { ascending: false });
        setFunderPortfolios(data || []);
      } catch (err) {
        console.error('Error fetching funder portfolios:', err);
      } finally {
        setLoadingPortfolios(false);
      }
    };
    fetchPortfolios();
  }, [selectedFunder?.beneficiary?.id]);

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

  const handleRegister = async () => {
    if (!user || !regName.trim() || !regPhone.trim()) return;
    if (isDuplicate) {
      toast({ title: 'Duplicate phone', description: duplicateMessage || 'This number is already registered', variant: 'destructive' });
      return;
    }
    setRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-proxy-funder', {
        body: { full_name: regName.trim(), phone: regPhone.trim(), agent_id: user.id, notes: regNotes.trim() || undefined },
      });
      if (error) {
        const msg = await extractFromErrorObject(error);
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast({ title: '✅ Funder registered!', description: `${data.full_name} has been added to your funders` });
      setRegisterOpen(false);
      setRegName('');
      setRegPhone('');
      setRegNotes('');
      fetchFunders();
    } catch (err: any) {
      toast({ title: 'Registration failed', description: err.message, variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-2xl p-0">
          <SheetHeader className="p-4 pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-lg">
                <HandCoins className="h-5 w-5 text-primary" />
                My Funders
              </SheetTitle>
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setRegisterOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Add Funder
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(92vh-60px)]">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : funders.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No funders yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Register a funder who doesn't have a smartphone
                </p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setRegisterOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Register First Funder
                </Button>
              </div>
            ) : !selectedFunder ? (
              <div className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {funders.length} funder{funders.length !== 1 ? 's' : ''} managed by you
                </p>
                {funders.map(f => {
                  const stats = f.beneficiary?.id ? funderStats[f.beneficiary.id] : null;
                  return (
                    <Card
                      key={f.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors active:scale-[0.98]"
                      onClick={() => setSelectedFunder(f)}
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
                              if (f.beneficiary?.phone) window.location.href = `tel:${f.beneficiary.phone}`;
                            }}
                          >
                            <Phone className="h-3 w-3" /> Call
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs -ml-2" onClick={() => setSelectedFunder(null)}>
                  ← All Funders
                </Button>

                {selectedFunder.beneficiary && funderStats[selectedFunder.beneficiary.id] && (
                  <FunderPortfolioCard
                    funder={selectedFunder.beneficiary}
                    stats={funderStats[selectedFunder.beneficiary.id]}
                  />
                )}

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
                    onClick={() => {
                      if (selectedFunder.beneficiary?.phone) {
                        setDepositPhone(selectedFunder.beneficiary.phone);
                        setDepositDialogOpen(true);
                      }
                    }}
                  >
                    <Banknote className="h-5 w-5 text-success" />
                    Deposit
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex-col gap-1.5 text-xs"
                    onClick={() => {
                      if (selectedFunder.beneficiary?.phone) window.location.href = `tel:${selectedFunder.beneficiary.phone}`;
                    }}
                  >
                    <Phone className="h-5 w-5 text-warning" />
                    Call
                  </Button>
                </div>

                {/* Individual Portfolio Details */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5">
                    <Home className="h-3.5 w-3.5 text-primary" />
                    Portfolio Accounts ({funderPortfolios.length})
                  </h4>
                  {loadingPortfolios ? (
                    <div className="space-y-2">
                      {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
                    </div>
                  ) : funderPortfolios.length === 0 ? (
                    <Card>
                      <CardContent className="p-4 text-center">
                        <CircleDot className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">No portfolios yet</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Invest on their behalf to create one</p>
                      </CardContent>
                    </Card>
                  ) : (
                    funderPortfolios.map(p => {
                      const statusColor = p.status === 'active' ? 'bg-success/15 text-success' :
                        p.status === 'matured' ? 'bg-primary/15 text-primary' :
                        p.status === 'pending_approval' ? 'bg-warning/15 text-warning' :
                        'bg-muted text-muted-foreground';
                      return (
                        <Card key={p.id} className="border border-border/60">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">
                                  {p.account_name || p.portfolio_code}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-mono">{p.portfolio_code}</p>
                              </div>
                              <Badge className={`text-[10px] shrink-0 border-0 ${statusColor}`}>
                                {p.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-lg bg-muted/40 p-2">
                                <p className="text-[10px] text-muted-foreground">Invested</p>
                                <p className="text-xs font-bold">{formatUGX(p.investment_amount)}</p>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-2">
                                <p className="text-[10px] text-muted-foreground">ROI Earned</p>
                                <p className="text-xs font-bold text-success">{formatUGX(p.total_roi_earned)}</p>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-2">
                                <p className="text-[10px] text-muted-foreground">Rate</p>
                                <p className="text-xs font-bold">{p.roi_percentage}%</p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {p.duration_months}mo term
                              </span>
                              {p.maturity_date && (
                                <span>Matures: {format(new Date(p.maturity_date), 'dd MMM yyyy')}</span>
                              )}
                              {p.next_roi_date && !p.maturity_date && (
                                <span>Next ROI: {format(new Date(p.next_roi_date), 'dd MMM')}</span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>

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
                      <p>✅ Process withdrawal requests (needs approval)</p>
                      <p>⚠️ All proxy actions are audited & flagged</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Register Funder Dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Register No-Smartphone Funder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full Name *</Label>
              <Input
                placeholder="e.g. John Mukasa"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <Label>Phone Number *</Label>
              <Input
                placeholder="e.g. 0704825473"
                value={regPhone}
                onChange={e => setRegPhone(e.target.value)}
                type="tel"
                maxLength={15}
              />
              {isChecking && <p className="text-[10px] text-muted-foreground mt-1">Checking...</p>}
              {isDuplicate && (
                <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {duplicateMessage}
                </p>
              )}
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                placeholder="e.g. My uncle, lives in Kampala"
                value={regNotes}
                onChange={e => setRegNotes(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5 text-[10px] text-muted-foreground">
              <p>📱 This person will be able to check their balance via USSD and receive SMS statements.</p>
              <p className="mt-1">🔒 All actions you take on their behalf are audited.</p>
            </div>
            <Button
              className="w-full"
              onClick={handleRegister}
              disabled={registering || !regName.trim() || !regPhone.trim() || isDuplicate || isChecking}
            >
              {registering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Register Funder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deposit on behalf of funder */}
      <AgentDepositDialog
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
        prefillPhone={depositPhone}
        onSuccess={() => {
          fetchFunders();
        }}
      />
    </>
  );
}
