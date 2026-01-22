import { Eye, EyeOff } from 'lucide-react';
import { useHighContrast } from '@/hooks/useHighContrast';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface HighContrastToggleProps {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'icon';
  showLabel?: boolean;
  className?: string;
}

export function HighContrastToggle({ 
  variant = 'ghost', 
  size = 'icon',
  showLabel = false,
  className 
}: HighContrastToggleProps) {
  const { highContrast, toggleHighContrast } = useHighContrast();

  const handleToggle = () => {
    toggleHighContrast();
    toast.success(
      highContrast ? 'Standard mode enabled' : 'High contrast mode enabled',
      { 
        description: highContrast 
          ? 'Text sizes and contrast restored to normal' 
          : 'Larger text and enhanced contrast for better visibility'
      }
    );
  };

  if (showLabel) {
    return (
      <Button
        variant={variant}
        size="default"
        onClick={handleToggle}
        className={className}
      >
        {highContrast ? (
          <EyeOff className="h-5 w-5 mr-2" />
        ) : (
          <Eye className="h-5 w-5 mr-2" />
        )}
        {highContrast ? 'Standard View' : 'High Contrast'}
      </Button>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleToggle}
            className={`h-11 w-11 min-w-[44px] min-h-[44px] rounded-xl touch-manipulation ${className || ''}`}
            aria-label={highContrast ? 'Disable high contrast mode' : 'Enable high contrast mode'}
          >
            {highContrast ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-sm font-medium">
            {highContrast ? 'Switch to standard view' : 'Enable high contrast mode'}
          </p>
          <p className="text-xs text-muted-foreground">
            {highContrast ? 'Restore normal text sizes' : 'Larger text & better contrast'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default HighContrastToggle;
