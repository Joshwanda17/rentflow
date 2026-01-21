import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Home, 
  Calendar, 
  CheckCircle, 
  Clock, 
  XCircle,
  TrendingUp,
  Wallet,
  AlertCircle,
  User,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, addDays, isBefore, isToday, startOfDay } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface RentRequest {
  id: string;
  rent_amount: number;
  total_repayment: number;
  daily_repayment: number;
  duration_days: number;
  status: string | null;
  created_at: string;
  approved_at: string | null;
  funded_at: string | null;
  disbursed_at: string | null;
  access_fee: number;
  request_fee: number;
  landlord: {
    name: string;
    property_address: string;
  } | null;
  agent: {
    full_name: string;
    phone: string;
  } | null;
}

interface Repayment {
  id: string;
  amount: number;
  payment_date: string;
  rent_request_id: string;
}

interface DayStatus {
  day: number;
  date: Date;
  status: 'paid' | 'missed' | 'due_today' | 'upcoming';
  expected: number;
  paid: number;
}

interface UserRentSectionProps {
  userId: string;
}

export default function UserRentSection({ userId }: UserRentSectionProps) {
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSchedules, setExpandedSchedules] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchRentData();
  }, [userId]);

  const fetchRentData = async () => {
    setLoading(true);
    try {
      // Fetch rent requests with landlord info
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('*, landlord:landlords(name, property_address)')
        .eq('tenant_id', userId)
        .order('created_at', { ascending: false });

      // Fetch repayments
      const { data: payments } = await supabase
        .from('repayments')
        .select('*')
        .eq('tenant_id', userId)
        .order('payment_date', { ascending: false });

      // Fetch agent profiles for requests that have agent_id
      const agentIds = [...new Set((requests || []).map(r => r.agent_id).filter(Boolean))];
      let agentProfiles: Record<string, { full_name: string; phone: string }> = {};
      
      if (agentIds.length > 0) {
        const { data: agents } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', agentIds);
        
        if (agents) {
          agentProfiles = agents.reduce((acc, agent) => {
            acc[agent.id] = { full_name: agent.full_name, phone: agent.phone };
            return acc;
          }, {} as Record<string, { full_name: string; phone: string }>);
        }
      }

      // Merge agent info into requests
      const requestsWithAgents = (requests || []).map(r => ({
        ...r,
        agent: r.agent_id ? agentProfiles[r.agent_id] || null : null
      }));

      setRentRequests(requestsWithAgents as RentRequest[]);
      setRepayments(payments || []);
    } catch (error) {
      console.error('Error fetching rent data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'funded':
        return <Badge className="bg-primary/20 text-primary"><Wallet className="h-3 w-3 mr-1" />Funded</Badge>;
      case 'disbursed':
        return <Badge className="bg-chart-5/20 text-chart-5"><TrendingUp className="h-3 w-3 mr-1" />Active</Badge>;
      case 'completed':
        return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const getStartDate = (request: RentRequest): Date => {
    if (request.disbursed_at) return new Date(request.disbursed_at);
    if (request.funded_at) return new Date(request.funded_at);
    return new Date(request.created_at);
  };

  const generateSchedule = (request: RentRequest, requestPayments: Repayment[]): DayStatus[] => {
    const startDate = startOfDay(getStartDate(request));
    const today = startOfDay(new Date());
    const schedule: DayStatus[] = [];

    // Group payments by date
    const paymentsByDate: Record<string, number> = {};
    requestPayments.forEach(p => {
      const dateKey = format(new Date(p.payment_date), 'yyyy-MM-dd');
      paymentsByDate[dateKey] = (paymentsByDate[dateKey] || 0) + p.amount;
    });

    for (let day = 1; day <= request.duration_days; day++) {
      const date = addDays(startDate, day - 1);
      const dateKey = format(date, 'yyyy-MM-dd');
      const paidAmount = paymentsByDate[dateKey] || 0;

      let status: DayStatus['status'];
      if (paidAmount >= request.daily_repayment) {
        status = 'paid';
      } else if (isToday(date)) {
        status = 'due_today';
      } else if (isBefore(date, today)) {
        status = 'missed';
      } else {
        status = 'upcoming';
      }

      schedule.push({
        day,
        date,
        status,
        expected: request.daily_repayment,
        paid: paidAmount
      });
    }

    return schedule;
  };

  const toggleSchedule = (requestId: string) => {
    setExpandedSchedules(prev => ({
      ...prev,
      [requestId]: !prev[requestId]
    }));
  };

  // Calculate totals
  const activeRequests = rentRequests.filter(r => r.status === 'disbursed' || r.status === 'funded');
  const completedRequests = rentRequests.filter(r => r.status === 'completed');
  
  const totalOwed = activeRequests.reduce((sum, r) => sum + r.total_repayment, 0);
  const totalPaid = repayments.reduce((sum, r) => sum + r.amount, 0);
  const totalRequested = rentRequests.reduce((sum, r) => sum + r.rent_amount, 0);
  const balance = totalOwed - totalPaid;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rent Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Home className="h-3 w-3" />
            Total Requested
          </div>
          <p className="font-semibold text-sm">{formatUGX(totalRequested)}</p>
          <p className="text-xs text-muted-foreground">{rentRequests.length} requests</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <CheckCircle className="h-3 w-3" />
            Total Paid
          </div>
          <p className="font-semibold text-sm text-success">{formatUGX(totalPaid)}</p>
          <p className="text-xs text-muted-foreground">{repayments.length} payments</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            Active Loans
          </div>
          <p className="font-semibold text-sm">{formatUGX(totalOwed)}</p>
          <p className="text-xs text-muted-foreground">{activeRequests.length} active</p>
        </Card>
        <Card className={`p-3 ${balance > 0 ? 'border-warning/50' : 'border-success/50'}`}>
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <AlertCircle className="h-3 w-3" />
            Outstanding
          </div>
          <p className={`font-semibold text-sm ${balance > 0 ? 'text-warning' : 'text-success'}`}>
            {formatUGX(Math.max(0, balance))}
          </p>
          <p className="text-xs text-muted-foreground">{completedRequests.length} completed</p>
        </Card>
      </div>

      {/* Rent Requests List with Full Schedule */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            Rent Request History & Repayment Schedules
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {rentRequests.length === 0 ? (
            <div className="text-center py-6">
              <Home className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">No rent requests yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rentRequests.map((request) => {
                const requestPayments = repayments.filter(r => r.rent_request_id === request.id);
                const paidAmount = requestPayments.reduce((sum, r) => sum + r.amount, 0);
                const progress = request.total_repayment > 0 
                  ? Math.min(100, (paidAmount / request.total_repayment) * 100) 
                  : 0;
                const schedule = generateSchedule(request, requestPayments);
                const missedDays = schedule.filter(d => d.status === 'missed').length;
                const paidDays = schedule.filter(d => d.status === 'paid').length;
                const isExpanded = expandedSchedules[request.id];

                return (
                  <Collapsible key={request.id} open={isExpanded} onOpenChange={() => toggleSchedule(request.id)}>
                    <div className="p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {request.landlord?.property_address || 'Unknown Property'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {request.landlord?.name || 'Unknown Landlord'}
                          </p>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      {/* Agent Info */}
                      {request.agent && (
                        <div className="flex items-center gap-2 text-xs bg-primary/10 rounded-md p-2 mb-2">
                          <User className="h-3 w-3 text-primary" />
                          <span className="text-muted-foreground">Agent:</span>
                          <span className="font-medium">{request.agent.full_name}</span>
                          <span className="text-muted-foreground">({request.agent.phone})</span>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="text-muted-foreground">Rent: </span>
                          <span className="font-medium">{formatUGX(request.rent_amount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Repay: </span>
                          <span className="font-medium">{formatUGX(request.total_repayment)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Daily: </span>
                          <span className="font-medium">{formatUGX(request.daily_repayment)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Days: </span>
                          <span className="font-medium">{request.duration_days}</span>
                        </div>
                      </div>

                      {(request.status === 'disbursed' || request.status === 'funded' || request.status === 'completed') && (
                        <>
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">
                                Paid: {formatUGX(paidAmount)} / {formatUGX(request.total_repayment)}
                              </span>
                              <span className="font-medium">{progress.toFixed(0)}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>

                          {/* Quick Stats */}
                          <div className="flex gap-2 mt-2 text-xs">
                            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                              {paidDays} paid
                            </Badge>
                            {missedDays > 0 && (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                                {missedDays} missed
                              </Badge>
                            )}
                            <Badge variant="outline" className="bg-muted text-muted-foreground">
                              {request.duration_days - paidDays - missedDays} remaining
                            </Badge>
                          </div>

                          {/* Expand/Collapse Schedule Button */}
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-full mt-2 text-xs">
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-3 w-3 mr-1" />
                                  Hide Full Schedule
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3 mr-1" />
                                  View Full Schedule ({request.duration_days} days)
                                </>
                              )}
                            </Button>
                          </CollapsibleTrigger>

                          {/* Full Schedule Table */}
                          <CollapsibleContent>
                            <div className="mt-3 border rounded-md overflow-hidden">
                              <div className="max-h-64 overflow-y-auto">
                                <Table>
                                  <TableHeader className="sticky top-0 bg-muted">
                                    <TableRow>
                                      <TableHead className="text-xs py-2">Day</TableHead>
                                      <TableHead className="text-xs py-2">Date</TableHead>
                                      <TableHead className="text-xs py-2">Status</TableHead>
                                      <TableHead className="text-xs py-2 text-right">Expected</TableHead>
                                      <TableHead className="text-xs py-2 text-right">Paid</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {schedule.map((day) => (
                                      <TableRow key={day.day} className={
                                        day.status === 'paid' ? 'bg-success/5' :
                                        day.status === 'missed' ? 'bg-destructive/5' :
                                        day.status === 'due_today' ? 'bg-warning/10' : ''
                                      }>
                                        <TableCell className="text-xs py-1.5 font-medium">
                                          {day.day}
                                        </TableCell>
                                        <TableCell className="text-xs py-1.5">
                                          {format(day.date, 'MMM d')}
                                        </TableCell>
                                        <TableCell className="text-xs py-1.5">
                                          {day.status === 'paid' && (
                                            <span className="text-success flex items-center gap-1">
                                              <CheckCircle className="h-3 w-3" /> Paid
                                            </span>
                                          )}
                                          {day.status === 'missed' && (
                                            <span className="text-destructive flex items-center gap-1">
                                              <XCircle className="h-3 w-3" /> Missed
                                            </span>
                                          )}
                                          {day.status === 'due_today' && (
                                            <span className="text-warning flex items-center gap-1">
                                              <Clock className="h-3 w-3" /> Due Today
                                            </span>
                                          )}
                                          {day.status === 'upcoming' && (
                                            <span className="text-muted-foreground flex items-center gap-1">
                                              <Calendar className="h-3 w-3" /> Upcoming
                                            </span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs py-1.5 text-right">
                                          {formatUGX(day.expected)}
                                        </TableCell>
                                        <TableCell className="text-xs py-1.5 text-right font-medium">
                                          {day.paid > 0 ? formatUGX(day.paid) : '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </>
                      )}

                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(request.created_at), 'MMM d, yyyy')}
                        {request.disbursed_at && (
                          <span className="ml-2">
                            • Started: {format(new Date(request.disbursed_at), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
