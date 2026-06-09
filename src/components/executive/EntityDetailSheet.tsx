import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export interface DetailField {
  label: string;
  value: React.ReactNode;
}

interface EntityDetailSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  fields?: DetailField[];
  /** Extra content (e.g. contact CTAs, tenant lists) shown below the fields */
  children?: React.ReactNode;
}

export function EntityDetailSheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  fields = [],
  children,
}: EntityDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            {icon}
            <span className="truncate">{title}</span>
          </SheetTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </SheetHeader>

        {fields.length > 0 && (
          <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {fields.map((f, i) => (
              <div key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <dt className="text-xs font-medium text-muted-foreground shrink-0">{f.label}</dt>
                <dd className="text-xs font-semibold text-foreground text-right break-words min-w-0">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {children && <div className="mt-4 space-y-3">{children}</div>}
      </SheetContent>
    </Sheet>
  );
}

export default EntityDetailSheet;