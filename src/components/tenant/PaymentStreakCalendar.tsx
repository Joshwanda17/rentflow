import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Flame, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isBefore, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface PaymentStreakCalendarProps {
  userId: string;
}

interface PaymentDay {
  date: Date;
  paid: boolean;
  amount?: number;
}

export function PaymentStreakCalendar({ userId }: PaymentStreakCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [payments, setPayments] = useState<{ payment_date: string; amount: number }[]>([]);
  const [activeLoan, setActiveLoan] = useState<{ created_at: string; duration_days: number; disbursed_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentData();
  }, [userId, currentMonth]);

  const fetchPaymentData = async () => {
    setLoading(true);
    try {
      // repayments table removed - stub
      const repayments: any[] = [];

      // Fetch active rent request to know the loan period
      const { data: rentRequest } = await supabase
        .from('rent_requests')
        .select('created_at, duration_days, status, disbursed_at')
        .eq('tenant_id', userId)
        .in('status', ['disbursed', 'repaying', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      setPayments(repayments);
      setActiveLoan(rentRequest);
    } catch (error) {
      console.error('Error fetching payment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calculate which days should have payments (based on active loan)
  const paymentDays = useMemo(() => {
    return daysInMonth.map(day => {
      const payment = payments.find(p => isSameDay(new Date(p.payment_date), day));
      const isPastDay = isBefore(day, new Date()) && !isToday(day);
      
      // Check if day is within loan period
      let shouldHavePaid = false;
      if (activeLoan?.disbursed_at) {
        const loanStart = new Date(activeLoan.disbursed_at);
        const loanEnd = new Date(loanStart);
        loanEnd.setDate(loanEnd.getDate() + activeLoan.duration_days);
        shouldHavePaid = day >= loanStart && day <= loanEnd && isPastDay;
      }

      return {
        date: day,
        paid: !!payment,
        amount: payment?.amount,
        shouldHavePaid,
        missed: shouldHavePaid && !payment,
      };
    });
  }, [daysInMonth, payments, activeLoan]);

  // Calculate streak
  const currentStreak = useMemo(() => {
    let streak = 0;
    const today = new Date();
    const sortedPayments = [...payments].sort((a, b) => 
      new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
    );

    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const hasPayment = sortedPayments.some(p => 
        isSameDay(new Date(p.payment_date), checkDate)
      );
      if (hasPayment) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }, [payments]);

  const paidDaysCount = paymentDays.filter(d => d.paid).length;
  const missedDaysCount = paymentDays.filter(d => d.missed).length;

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const firstDayOfMonth = monthStart.getDay();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Payment Calendar</CardTitle>
          </div>
          {currentStreak > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              <Flame className="h-3 w-3" />
              {currentStreak} day streak
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-semibold text-base">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            disabled={currentMonth >= new Date()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Week Days Header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={format(currentMonth, 'yyyy-MM')}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-7 gap-1"
          >
            {/* Empty cells for days before month starts */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {/* Day cells */}
            {paymentDays.map(({ date, paid, missed, amount }) => {
              const isCurrentDay = isToday(date);
              const isFutureDay = date > new Date();

              return (
                <motion.div
                  key={date.toISOString()}
                  whileHover={{ scale: 1.1 }}
                  className={cn(
                    "aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-medium relative transition-colors",
                    isCurrentDay && "ring-2 ring-primary ring-offset-1",
                    paid && "bg-green-500 text-white",
                    missed && "bg-red-400 text-white",
                    !paid && !missed && !isFutureDay && "bg-muted/50",
                    isFutureDay && "bg-muted/20 text-muted-foreground"
                  )}
                >
                  <span className="text-xs">{format(date, 'd')}</span>
                  {paid && (
                    <span className="text-[8px] opacity-80">✓</span>
                  )}
                  {missed && (
                    <span className="text-[8px] opacity-80">✗</span>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-xs text-muted-foreground">Paid ({paidDaysCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-400" />
            <span className="text-xs text-muted-foreground">Missed ({missedDaysCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-muted/50" />
            <span className="text-xs text-muted-foreground">No payment</span>
          </div>
        </div>

        {/* Summary Stats */}
        {(paidDaysCount > 0 || missedDaysCount > 0) && (
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-green-600">{paidDaysCount}</p>
                <p className="text-xs text-muted-foreground">Paid Days</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-500">{missedDaysCount}</p>
                <p className="text-xs text-muted-foreground">Missed</p>
              </div>
              <div>
                <p className="text-lg font-bold text-orange-500">{currentStreak}</p>
                <p className="text-xs text-muted-foreground">Streak</p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
