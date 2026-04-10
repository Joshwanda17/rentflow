import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

export interface BreakdownItem {
  label: string;
  value: number;
  icon?: React.ReactNode;
}

interface KPIBreakdownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  total: number;
  items: BreakdownItem[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

export function KPIBreakdownSheet({ open, onOpenChange, title, total, items }: KPIBreakdownSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-1">
              <div className="flex items-center gap-2.5">
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                <span className="text-sm text-muted-foreground">{item.label}</span>
              </div>
              <span className={`text-sm font-mono font-medium ${item.value < 0 ? 'text-red-600' : ''}`}>
                {fmt(item.value)}
              </span>
            </div>
          ))}
        </div>

        <Separator className="my-3" />

        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-sm font-bold">Total</span>
          <span className={`text-lg font-bold font-mono ${total < 0 ? 'text-red-600' : 'text-foreground'}`}>
            {fmt(total)}
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
