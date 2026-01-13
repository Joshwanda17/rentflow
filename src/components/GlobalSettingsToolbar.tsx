import { useState } from 'react';
import { Globe, DollarSign, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CurrencyConverter } from '@/components/CurrencyConverter';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';
import { useCurrency } from '@/hooks/useCurrency';
import { languageFlags, Language } from '@/i18n/translations';

export const GlobalSettingsToolbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const { language } = useLanguage();
  const { currency } = useCurrency();

  return (
    <>
      {/* Floating Trigger Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 right-4 z-50 md:bottom-6"
          >
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button
                  size="lg"
                  className="rounded-full h-14 w-14 shadow-lg bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-lg">{languageFlags[language]}</span>
                    <span className="text-[10px] font-bold">{currency.code}</span>
                  </div>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
                <SheetHeader className="pb-4">
                  <SheetTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-primary" />
                      Language & Currency
                    </span>
                  </SheetTitle>
                </SheetHeader>
                
                <Tabs defaultValue="language" className="h-full">
                  <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="language" className="gap-1.5">
                      <Globe className="h-4 w-4" />
                      <span className="hidden sm:inline">Language</span>
                    </TabsTrigger>
                    <TabsTrigger value="currency" className="gap-1.5">
                      <DollarSign className="h-4 w-4" />
                      <span className="hidden sm:inline">Currency</span>
                    </TabsTrigger>
                    <TabsTrigger value="converter" className="gap-1.5">
                      <ArrowLeftRight className="h-4 w-4" />
                      <span className="hidden sm:inline">Convert</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  <div className="mt-4 overflow-y-auto max-h-[calc(70vh-140px)]">
                    <TabsContent value="language" className="mt-0">
                      <LanguageSelectorGrid />
                    </TabsContent>
                    
                    <TabsContent value="currency" className="mt-0">
                      <CurrencySelectorGrid />
                    </TabsContent>
                    
                    <TabsContent value="converter" className="mt-0">
                      <CurrencyConverter />
                    </TabsContent>
                  </div>
                </Tabs>
              </SheetContent>
            </Sheet>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Language Grid Selector
const LanguageSelectorGrid = () => {
  const { language, setLanguage } = useLanguage();
  
  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'am', name: 'አማርኛ', flag: '🇪🇹' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    { code: 'pt', name: 'Português', flag: '🇧🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {languages.map((lang) => (
        <motion.button
          key={lang.code}
          onClick={() => setLanguage(lang.code as any)}
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
            language === lang.code 
              ? 'bg-primary/10 border-primary text-primary' 
              : 'bg-card hover:bg-muted border-border'
          }`}
          whileTap={{ scale: 0.98 }}
        >
          <span className="text-2xl">{lang.flag}</span>
          <div className="text-left">
            <p className="font-medium text-sm">{lang.name}</p>
            <p className="text-xs text-muted-foreground uppercase">{lang.code}</p>
          </div>
          {language === lang.code && (
            <span className="ml-auto text-primary">✓</span>
          )}
        </motion.button>
      ))}
    </div>
  );
};

// Currency Grid Selector  
const CurrencySelectorGrid = () => {
  const { currency, setCurrency, getCurrencyByCode } = useCurrency();
  
  const currencies = [
    { code: 'UGX', name: 'Ugandan Shilling', flag: '🇺🇬', symbol: 'USh' },
    { code: 'USD', name: 'US Dollar', flag: '🇺🇸', symbol: '$' },
    { code: 'EUR', name: 'Euro', flag: '🇪🇺', symbol: '€' },
    { code: 'GBP', name: 'British Pound', flag: '🇬🇧', symbol: '£' },
    { code: 'KES', name: 'Kenyan Shilling', flag: '🇰🇪', symbol: 'KSh' },
    { code: 'TZS', name: 'Tanzanian Shilling', flag: '🇹🇿', symbol: 'TSh' },
    { code: 'RWF', name: 'Rwandan Franc', flag: '🇷🇼', symbol: 'FRw' },
    { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦', symbol: 'R' },
    { code: 'NGN', name: 'Nigerian Naira', flag: '🇳🇬', symbol: '₦' },
    { code: 'GHS', name: 'Ghanaian Cedi', flag: '🇬🇭', symbol: '₵' },
    { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳', symbol: '₹' },
    { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳', symbol: '¥' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {currencies.map((curr) => {
        const currencyData = getCurrencyByCode(curr.code);
        return (
          <motion.button
            key={curr.code}
            onClick={() => currencyData && setCurrency(currencyData)}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              currency.code === curr.code 
                ? 'bg-primary/10 border-primary text-primary' 
                : 'bg-card hover:bg-muted border-border'
            }`}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-2xl">{curr.flag}</span>
            <div className="text-left flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{curr.code}</p>
              <p className="text-xs text-muted-foreground">{curr.symbol}</p>
            </div>
            {currency.code === curr.code && (
              <span className="text-primary">✓</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

export default GlobalSettingsToolbar;
