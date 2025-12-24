import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertTriangle, Bell, BellRing, Check, Plus, Settings, Trash2, 
  TrendingUp, TrendingDown, RefreshCw
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface Threshold {
  id: string;
  metric_name: string;
  threshold_value: number;
  comparison_type: string;
  enabled: boolean;
  notification_message: string | null;
  created_at: string;
}

interface Alert {
  id: string;
  threshold_id: string | null;
  metric_name: string;
  current_value: number;
  threshold_value: number;
  triggered_at: string;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

const AVAILABLE_METRICS = [
  { value: 'daily_deposits', label: 'Daily Deposits', description: 'Total deposits in a day' },
  { value: 'daily_withdrawals', label: 'Daily Withdrawals', description: 'Total withdrawals in a day' },
  { value: 'daily_rent_requests', label: 'Daily Rent Requests', description: 'Number of rent requests per day' },
  { value: 'pending_repayments', label: 'Pending Repayments', description: 'Total pending repayment amount' },
  { value: 'low_wallet_balance', label: 'Low Wallet Balances', description: 'Users with wallet balance below threshold' },
  { value: 'daily_platform_fees', label: 'Daily Platform Fees', description: 'Platform fees collected in a day' },
  { value: 'daily_agent_earnings', label: 'Daily Agent Earnings', description: 'Total agent earnings in a day' },
  { value: 'net_flow', label: 'Net Money Flow', description: 'Deposits minus withdrawals' },
];

export function FinancialAlerts() {
  const { user } = useAuth();
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Form state
  const [newMetric, setNewMetric] = useState('');
  const [newThreshold, setNewThreshold] = useState('');
  const [newComparison, setNewComparison] = useState('exceeds');
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [thresholdsRes, alertsRes] = await Promise.all([
      supabase
        .from('financial_thresholds')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('financial_alerts')
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(50)
    ]);

    setThresholds(thresholdsRes.data || []);
    setAlerts(alertsRes.data || []);
    setLoading(false);
  };

  const addThreshold = async () => {
    if (!newMetric || !newThreshold) {
      toast.error('Please fill in all required fields');
      return;
    }

    const { error } = await supabase
      .from('financial_thresholds')
      .insert({
        metric_name: newMetric,
        threshold_value: parseFloat(newThreshold),
        comparison_type: newComparison,
        notification_message: newMessage || null,
        enabled: true
      });

    if (error) {
      toast.error('Failed to add threshold');
      console.error(error);
      return;
    }

    toast.success('Threshold added successfully');
    setDialogOpen(false);
    setNewMetric('');
    setNewThreshold('');
    setNewComparison('exceeds');
    setNewMessage('');
    fetchData();
  };

  const toggleThreshold = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from('financial_thresholds')
      .update({ enabled })
      .eq('id', id);

    if (!error) {
      setThresholds(prev => prev.map(t => t.id === id ? { ...t, enabled } : t));
      toast.success(enabled ? 'Alert enabled' : 'Alert disabled');
    }
  };

  const deleteThreshold = async (id: string) => {
    const { error } = await supabase
      .from('financial_thresholds')
      .delete()
      .eq('id', id);

    if (!error) {
      setThresholds(prev => prev.filter(t => t.id !== id));
      toast.success('Threshold deleted');
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('financial_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', alertId);

    if (!error) {
      setAlerts(prev => prev.map(a => 
        a.id === alertId 
          ? { ...a, acknowledged: true, acknowledged_by: user.id, acknowledged_at: new Date().toISOString() } 
          : a
      ));
      toast.success('Alert acknowledged');
    }
  };

  const checkThresholds = async () => {
    setChecking(true);
    
    // Fetch current metrics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [depositsRes, withdrawalsRes, requestsRes, earningsRes, walletsRes] = await Promise.all([
      supabase.from('wallet_deposits').select('amount').gte('created_at', todayIso),
      supabase.from('wallet_withdrawals').select('amount').gte('created_at', todayIso),
      supabase.from('rent_requests').select('rent_amount, access_fee, request_fee, status, total_repayment').gte('created_at', todayIso),
      supabase.from('agent_earnings').select('amount').gte('created_at', todayIso),
      supabase.from('wallets').select('balance')
    ]);

    const dailyDeposits = (depositsRes.data || []).reduce((sum, d) => sum + Number(d.amount), 0);
    const dailyWithdrawals = (withdrawalsRes.data || []).reduce((sum, w) => sum + Number(w.amount), 0);
    const dailyRentRequests = (requestsRes.data || []).length;
    const pendingRepayments = (requestsRes.data || [])
      .filter(r => ['funded', 'disbursed'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.total_repayment), 0);
    const dailyPlatformFees = (requestsRes.data || [])
      .filter(r => ['funded', 'disbursed', 'completed'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.access_fee) + Number(r.request_fee), 0);
    const dailyAgentEarnings = (earningsRes.data || []).reduce((sum, e) => sum + Number(e.amount), 0);
    const netFlow = dailyDeposits - dailyWithdrawals;
    const lowWalletBalances = (walletsRes.data || []).filter(w => Number(w.balance) < 10000).length;

    const currentMetrics: Record<string, number> = {
      daily_deposits: dailyDeposits,
      daily_withdrawals: dailyWithdrawals,
      daily_rent_requests: dailyRentRequests,
      pending_repayments: pendingRepayments,
      daily_platform_fees: dailyPlatformFees,
      daily_agent_earnings: dailyAgentEarnings,
      net_flow: netFlow,
      low_wallet_balance: lowWalletBalances
    };

    // Check each enabled threshold
    const activeThresholds = thresholds.filter(t => t.enabled);
    let alertsTriggered = 0;

    for (const threshold of activeThresholds) {
      const currentValue = currentMetrics[threshold.metric_name] ?? 0;
      let triggered = false;

      switch (threshold.comparison_type) {
        case 'exceeds':
          triggered = currentValue > threshold.threshold_value;
          break;
        case 'below':
          triggered = currentValue < threshold.threshold_value;
          break;
        case 'equals':
          triggered = currentValue === threshold.threshold_value;
          break;
      }

      if (triggered) {
        // Check if alert was already triggered in last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentAlerts } = await supabase
          .from('financial_alerts')
          .select('id')
          .eq('threshold_id', threshold.id)
          .gte('triggered_at', oneHourAgo)
          .limit(1);

        if (!recentAlerts || recentAlerts.length === 0) {
          await supabase.from('financial_alerts').insert({
            threshold_id: threshold.id,
            metric_name: threshold.metric_name,
            current_value: currentValue,
            threshold_value: threshold.threshold_value
          });
          alertsTriggered++;

          // Also create a notification for all managers
          const { data: managers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'manager');

          if (managers) {
            const metricLabel = AVAILABLE_METRICS.find(m => m.value === threshold.metric_name)?.label || threshold.metric_name;
            for (const manager of managers) {
              await supabase.from('notifications').insert({
                user_id: manager.user_id,
                title: '⚠️ Financial Alert',
                message: threshold.notification_message || 
                  `${metricLabel} has ${threshold.comparison_type === 'exceeds' ? 'exceeded' : 'fallen below'} ${formatUGX(threshold.threshold_value)}. Current: ${formatUGX(currentValue)}`,
                type: 'alert'
              });
            }
          }
        }
      }
    }

    await fetchData();
    setChecking(false);
    
    if (alertsTriggered > 0) {
      toast.warning(`${alertsTriggered} alert(s) triggered!`);
    } else {
      toast.success('All metrics within thresholds');
    }
  };

  const getMetricLabel = (metricName: string) => {
    return AVAILABLE_METRICS.find(m => m.value === metricName)?.label || metricName;
  };

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length;

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading alerts...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="h-5 w-5" />
            Financial Alerts
            {unacknowledgedCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unacknowledgedCount} active
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={checkThresholds}
              disabled={checking}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${checking ? 'animate-spin' : ''}`} />
              Check Now
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Threshold
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Alert Threshold</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Metric</Label>
                    <Select value={newMetric} onValueChange={setNewMetric}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select metric" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_METRICS.map(metric => (
                          <SelectItem key={metric.value} value={metric.value}>
                            <div>
                              <div className="font-medium">{metric.label}</div>
                              <div className="text-xs text-muted-foreground">{metric.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Select value={newComparison} onValueChange={setNewComparison}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exceeds">Exceeds</SelectItem>
                        <SelectItem value="below">Falls Below</SelectItem>
                        <SelectItem value="equals">Equals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Threshold Value (UGX)</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 1000000"
                      value={newThreshold}
                      onChange={(e) => setNewThreshold(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Message (optional)</Label>
                    <Input
                      placeholder="Alert message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                  </div>

                  <Button onClick={addThreshold} className="w-full">
                    Add Threshold
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="alerts" className="space-y-4">
          <TabsList className="w-full">
            <TabsTrigger value="alerts" className="flex-1">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Active Alerts
              {unacknowledgedCount > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 text-xs">
                  {unacknowledgedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="thresholds" className="flex-1">
              <Settings className="h-4 w-4 mr-1" />
              Thresholds
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alerts" className="space-y-3">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No alerts triggered yet</p>
                <p className="text-xs mt-1">Configure thresholds to monitor your metrics</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${
                      alert.acknowledged 
                        ? 'bg-muted/30 border-border' 
                        : 'bg-destructive/10 border-destructive/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {alert.acknowledged ? (
                          <Check className="h-5 w-5 text-success mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium text-sm">
                            {getMetricLabel(alert.metric_name)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Value: <span className="font-mono">{formatUGX(alert.current_value)}</span>
                            {' • '}
                            Threshold: <span className="font-mono">{formatUGX(alert.threshold_value)}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="thresholds" className="space-y-3">
            {thresholds.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No thresholds configured</p>
                <p className="text-xs mt-1">Add thresholds to monitor financial metrics</p>
              </div>
            ) : (
              <div className="space-y-2">
                {thresholds.map(threshold => (
                  <div
                    key={threshold.id}
                    className="p-3 rounded-lg bg-secondary/30 border"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {threshold.comparison_type === 'exceeds' ? (
                          <TrendingUp className="h-5 w-5 text-warning" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-destructive" />
                        )}
                        <div>
                          <p className="font-medium text-sm">
                            {getMetricLabel(threshold.metric_name)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Alert when {threshold.comparison_type}{' '}
                            <span className="font-mono">{formatUGX(threshold.threshold_value)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={threshold.enabled}
                          onCheckedChange={(checked) => toggleThreshold(threshold.id, checked)}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteThreshold(threshold.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
