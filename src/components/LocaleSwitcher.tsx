import React from 'react';
import { Globe, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CurrencySwitcher } from './CurrencySwitcher';
import { useLanguage } from '@/hooks/useLanguage';
import { useCurrency } from '@/hooks/useCurrency';
import { languageFlags } from '@/i18n/translations';

interface LocaleSwitcherProps {
  variant?: 'default' | 'compact' | 'combined';
  className?: string;
}

export const LocaleSwitcher: React.FC<LocaleSwitcherProps> = ({ 
  variant = 'default',
  className = '' 
}) => {
  const { language } = useLanguage();
  const { currency } = useCurrency();

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <LanguageSwitcher variant="compact" />
        <CurrencySwitcher variant="compact" />
      </div>
    );
  }

  if (variant === 'combined') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className={`gap-2 ${className}`}
            aria-label="Locale settings"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{languageFlags[language]}</span>
            <span className="hidden sm:inline">{currency.symbol}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="end">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Language
              </label>
              <LanguageSwitcher />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Currency
              </label>
              <CurrencySwitcher />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LanguageSwitcher />
      <CurrencySwitcher />
    </div>
  );
};
