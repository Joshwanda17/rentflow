import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, RefreshCw } from 'lucide-react';

interface PayoutAutomationToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  dayOfMonth: number;
  onDayChange: (day: number) => void;
}

export function PayoutAutomationToggle({ enabled, onToggle, dayOfMonth, onDayChange }: PayoutAutomationToggleProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <Label className="text-xs font-semibold cursor-pointer">Automate this payout</Label>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>

      {enabled && (
        <div className="space-y-2 pl-6">
          <p className="text-[10px] text-muted-foreground">
            The system will automatically repeat this payout every month on the selected day.
          </p>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs">Day of month:</Label>
            <Select value={String(dayOfMonth)} onValueChange={(v) => onDayChange(Number(v))}>
              <SelectTrigger className="w-20 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <SelectItem key={d} value={String(d)} className="text-xs">{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Max day is 28 to ensure consistency across all months.
          </p>
        </div>
      )}
    </div>
  );
}
