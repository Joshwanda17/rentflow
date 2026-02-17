import { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AiIdDialog from './AiIdDialog';

interface Props {
  variant?: 'default' | 'compact' | 'icon';
  className?: string;
}

export default function AiIdButton({ variant = 'default', className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="outline"
          size="icon"
          className={className}
          onClick={() => setOpen(true)}
          title="Welile AI ID"
        >
          <Fingerprint className="h-4 w-4" />
        </Button>
      ) : variant === 'compact' ? (
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/20 transition-colors ${className || ''}`}
        >
          <Fingerprint className="h-3.5 w-3.5" />
          AI ID
        </button>
      ) : (
        <Button
          variant="outline"
          className={`gap-2 ${className || ''}`}
          onClick={() => setOpen(true)}
        >
          <Fingerprint className="h-4 w-4" />
          Welile AI ID
        </Button>
      )}

      <AiIdDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
