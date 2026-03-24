import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Banknote, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, startOfDay, addDays, isToday, isPast } from 'date-fns';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface ScheduleDay {
  date: string;
  amount: number;
  isPaid: boolean;
  isOverdue: boolean;
  isToday: boolean;
}

interface Props {
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  rentRequestId: string;
  dailyRepayment: number;
  totalRepayment: number;
  amountRepaid: number;
  durationDays: number;
  startDate: string;
}

export function NoSmartphoneScheduleManager({
  tenantId,
  tenantName,
  tenantPhone: _tenantPhone,
  rentRequestId,
  dailyRepayment,
  totalRepayment,
  amountRepaid,
  durationDays,
  startDate,
}: Props) {
  const { user } = useAuth();
  const [paymentAmount, setPaymentAmount] = useState(String(dailyRepayment));
  const [recording, setRecording] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const owing = Math.max(0, totalRepayment - amountRepaid);
  const daysPaid = dailyRepayment > 0 ? Math.floor(amountRepaid / dailyRepayment) : 0;

  // Build schedule
  const schedule: ScheduleDay[] = [];
  const start = startOfDay(new Date(startDate));

  for (let i = 0; i < durationDays; i++) {
    const day = addDays(start, i);
    const isPaidDay = i < daysPaid;
    const dayStr = format(day, 'yyyy-MM-dd');

    schedule.push({
      date: dayStr,
      amount: dailyRepayment,
      isPaid: isPaidDay,
      isOverdue: !isPaidDay && isPast(day) && !isToday(day),
      isToday: isToday(day),
    });
  }

  const overdueDays = schedule.filter(d => d.isOverdue).length;
  const todayEntry = schedule.find(d => d.isToday);

  const recordPayment = useCallback(async () => {
    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amt > owing) {
      toast.error(`Amount exceeds balance of ${formatUGX(owing)}`);
      return;
    }

    setRecording(true);
    try {
      // Record as agent collection
      const { error: collError } = await supabase.from('agent_collections').insert({
        agent_id: user!.id,
        tenant_id: tenantId,
        amount: amt,
        payment_method: 'cash',
        float_before: 0,
        float_after: 0,
        notes: `No-smartphone schedule payment for rent request ${rentRequestId.substring(0, 8)}`,
      });
      if (collError) throw collError;

      // Update rent request amount_repaid
      const { error: updateError } = await supabase
        .from('rent_requests')
        .update({ amount_repaid: amountRepaid + amt })
        .eq('id', rentRequestId);
      if (updateError) throw updateError;

      toast.success(`${formatUGX(amt)} recorded for ${tenantName}`);
      setPaymentAmount(String(dailyRepayment));
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setRecording(false);
    }
  }, [paymentAmount, owing, user, tenantId, rentRequestId, amountRepaid, tenantName, dailyRepayment]);

  return (
    <div className="space-y-2">
      {/* Quick record payment */}
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Manage Schedule
          </p>
          {overdueDays > 0 && (
            <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive bg-destructive/10">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              {overdueDays} overdue
            </Badge>
          )}
        </div>

        {/* Today's status */}
        {todayEntry && (
          <div className={`rounded-lg p-2 text-xs ${todayEntry.isPaid ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
            <span className="font-medium">
              Today: {todayEntry.isPaid ? '✅ Paid' : `${formatUGX(dailyRepayment)} due`}
            </span>
          </div>
        )}

        {/* Record payment form */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Banknote className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="pl-7 h-8 text-sm"
              placeholder="Amount"
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={recordPayment}
            disabled={recording || !paymentAmount}
          >
            {recording ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
            Record
          </Button>
        </div>

        {/* Quick amount buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {[dailyRepayment, dailyRepayment * 2, dailyRepayment * 7].filter(a => a <= owing).map(amt => (
            <button
              key={amt}
              onClick={() => setPaymentAmount(String(amt))}
              className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                Number(paymentAmount) === amt
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'text-muted-foreground border-border hover:bg-muted/50'
              }`}
            >
              {formatUGX(amt)} ({amt === dailyRepayment ? '1 day' : amt === dailyRepayment * 2 ? '2 days' : '1 week'})
            </button>
          ))}
        </div>

        {/* Toggle full schedule */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-[10px] h-7"
          onClick={() => setShowSchedule(!showSchedule)}
        >
          {showSchedule ? 'Hide' : 'View'} Full Schedule ({durationDays} days)
        </Button>
      </div>

      {/* Full schedule view */}
      <AnimatePresence>
        {showSchedule && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2 space-y-1">
              {schedule.map((day, i) => (
                <div
                  key={day.date}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    day.isToday
                      ? 'bg-primary/10 border border-primary/30 font-semibold'
                      : day.isPaid
                        ? 'bg-success/5 text-muted-foreground'
                        : day.isOverdue
                          ? 'bg-destructive/5'
                          : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-[10px] text-muted-foreground font-mono">
                      {i + 1}
                    </span>
                    <span className={day.isToday ? 'text-primary' : ''}>
                      {format(new Date(day.date), 'EEE, dd MMM')}
                    </span>
                    {day.isToday && <Badge className="text-[8px] px-1 py-0 bg-primary text-primary-foreground">TODAY</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px]">{formatUGX(day.amount)}</span>
                    {day.isPaid ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : day.isOverdue ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
