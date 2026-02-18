import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const AppleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.62-2.2.44-3.06-.4C4.24 16.7 4.89 10.97 8.82 10.74c1.15.06 1.95.66 2.62.7.99-.2 1.95-.78 3.01-.7 1.28.1 2.24.6 2.87 1.52-2.63 1.58-2.01 5.07.37 6.04-.5 1.3-.93 2.58-1.64 3.98zM12.05 10.67c-.14-2.51 1.88-4.63 4.25-4.67.33 2.85-2.55 4.98-4.25 4.67z"/>
  </svg>
);

interface AppleSignInButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
}

export function AppleSignInButton({ onClick, disabled, isLoading }: AppleSignInButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-3 h-14 text-base rounded-xl touch-manipulation active:scale-[0.98] bg-black text-white hover:bg-black/90 hover:text-white border-black"
      onClick={onClick}
      disabled={disabled}
      style={{ fontSize: '16px' }}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <AppleIcon />
      )}
      Continue with Apple
    </Button>
  );
}
