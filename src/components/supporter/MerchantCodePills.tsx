import { useState } from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface MerchantPillProps {
  label: string;
  code: string;
  dotColor: string;
  borderColor: string;
}

function MerchantPill({ label, code, dotColor, borderColor }: MerchantPillProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    toast.success(`${label} merchant code copied!`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-muted/50 border ${borderColor} active:scale-95 transition-transform touch-manipulation`}
    >
      <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className="text-[11px] font-mono font-bold text-foreground">{code}</span>
      {copied ? (
        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

export function MerchantCodePills() {
  return (
    <div className="flex flex-wrap justify-center gap-1.5 mt-1">
      <MerchantPill label="MTN" code="090777" dotColor="bg-yellow-500" borderColor="border-yellow-500/30" />
      <MerchantPill label="Airtel" code="4380664" dotColor="bg-red-500" borderColor="border-red-500/30" />
    </div>
  );
}
