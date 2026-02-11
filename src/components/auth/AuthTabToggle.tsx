import { LogIn, UserPlus } from 'lucide-react';

interface AuthTabToggleProps {
  isSignUp: boolean;
  onToggle: (isSignUp: boolean) => void;
}

export function AuthTabToggle({ isSignUp, onToggle }: AuthTabToggleProps) {
  return (
    <div className="flex border-b border-border/50">
      <button
        type="button"
        onClick={() => onToggle(false)}
        className={`flex-1 py-4 px-4 text-base font-medium transition-all touch-manipulation ${
          !isSignUp
            ? 'bg-primary/10 text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent', minHeight: '56px' }}
      >
        <div className="flex items-center justify-center gap-2">
          <LogIn className="h-5 w-5" />
          Sign In
        </div>
      </button>
      <button
        type="button"
        onClick={() => onToggle(true)}
        className={`flex-1 py-4 px-4 text-base font-medium transition-all touch-manipulation ${
          isSignUp
            ? 'bg-primary/10 text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
        style={{ WebkitTapHighlightColor: 'transparent', minHeight: '56px' }}
      >
        <div className="flex items-center justify-center gap-2">
          <UserPlus className="h-5 w-5" />
          Sign Up
        </div>
      </button>
    </div>
  );
}
