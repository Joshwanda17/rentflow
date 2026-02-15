import { useState } from 'react';
import { Globe, DollarSign, ArrowLeftRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CurrencyConverter } from '@/components/CurrencyConverter';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';
import { useCurrency } from '@/hooks/useCurrency';
import { languageFlags } from '@/i18n/translations';
import { useHighContrast } from '@/hooks/useHighContrast';
import { HighContrastToggle } from '@/components/HighContrastToggle';

export const GlobalSettingsToolbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);
  
  const { language } = useLanguage();
  const { currency } = useCurrency();
  const { highContrast } = useHighContrast();

  return (
    <>
      {/* Floating buttons — always visible */}
      <AnimatePresence>
        {!isOpen && !converterOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 right-4 z-50 md:bottom-6 flex flex-col gap-2 items-end"
          >
            {/* High Contrast Quick Toggle */}
            <HighContrastToggle 
              variant="default" 
              className={`rounded-full h-10 w-10 shadow-lg ${
                highContrast 
                  ? 'bg-foreground text-background ring-2 ring-primary' 
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            />

            {/* CURRENCY CONVERTER — Big, prominent, easy to find */}
            <Sheet open={converterOpen} onOpenChange={setConverterOpen}>
              <SheetTrigger asChild>
                <Button
                  size="lg"
                  className="rounded-full h-12 px-4 shadow-xl bg-gradient-to-r from-success to-emerald-600 hover:from-success/90 hover:to-emerald-600/90 text-white gap-2 font-bold"
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  <span className="text-sm">Convert</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
                <SheetHeader className="pb-3">
                  <SheetTitle className="flex items-center gap-2">
                    <ArrowLeftRight className="h-5 w-5 text-primary" />
                    Currency Converter
                  </SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto max-h-[calc(85vh-80px)] pb-6">
                  <CurrencyConverter />
                </div>
              </SheetContent>
            </Sheet>
            
            {/* Language/Currency Settings — Smaller secondary button */}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full h-11 w-11 shadow-lg"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-base">{languageFlags[language]}</span>
                    <span className="text-[8px] font-bold text-muted-foreground">{currency.code}</span>
                  </div>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl">
                <SheetHeader className="pb-4">
                  <SheetTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Language & Currency
                  </SheetTitle>
                </SheetHeader>
                
                <Tabs defaultValue="language" className="h-full">
                  <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="language" className="gap-1.5">
                      <Globe className="h-4 w-4" />
                      <span className="text-xs">Language</span>
                    </TabsTrigger>
                    <TabsTrigger value="currency" className="gap-1.5">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-xs">Currency</span>
                    </TabsTrigger>
                    <TabsTrigger value="accessibility" className="gap-1.5">
                      <Eye className="h-4 w-4" />
                      <span className="text-xs">Vision</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  <div className="mt-4 overflow-y-auto max-h-[calc(75vh-140px)]">
                    <TabsContent value="language" className="mt-0">
                      <LanguageSelectorGrid />
                    </TabsContent>
                    
                    <TabsContent value="currency" className="mt-0">
                      <CurrencySelectorGrid />
                    </TabsContent>
                    
                    <TabsContent value="accessibility" className="mt-0">
                      <AccessibilitySettings />
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

// Accessibility Settings Panel
const AccessibilitySettings = () => {
  const { highContrast, toggleHighContrast } = useHighContrast();

  return (
    <div className="space-y-4">
      <motion.button
        onClick={toggleHighContrast}
        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all touch-manipulation ${
          highContrast 
            ? 'bg-primary/15 border-primary text-foreground ring-2 ring-primary/30' 
            : 'bg-card hover:bg-muted border-border'
        }`}
        whileTap={{ scale: 0.98 }}
      >
        <div className={`p-3 rounded-xl ${highContrast ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          <Eye className="h-6 w-6" />
        </div>
        <div className="text-left flex-1">
          <p className="font-bold text-lg">High Contrast Mode</p>
          <p className="text-sm text-muted-foreground">
            Larger text & enhanced contrast for better visibility
          </p>
        </div>
        <div className={`w-14 h-8 rounded-full p-1 transition-colors ${highContrast ? 'bg-primary' : 'bg-muted'}`}>
          <motion.div 
            className="w-6 h-6 rounded-full bg-white shadow-md"
            animate={{ x: highContrast ? 22 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </div>
      </motion.button>

      <div className="p-4 rounded-xl bg-muted/50 border border-border">
        <h4 className="font-semibold text-base mb-2">👁️ Vision Accessibility</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-success font-bold">✓</span>
            <span>Increases all text sizes for easier reading</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-success font-bold">✓</span>
            <span>Enhances color contrast for better visibility</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-success font-bold">✓</span>
            <span>Thicker borders and focus indicators</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-success font-bold">✓</span>
            <span>Works with both light and dark themes</span>
          </li>
        </ul>
      </div>

      <div className={`p-4 rounded-xl text-center ${
        highContrast 
          ? 'bg-success/15 border-2 border-success text-success' 
          : 'bg-muted border-2 border-transparent'
      }`}>
        <p className="font-bold text-lg">
          {highContrast ? '✓ High Contrast Active' : 'Standard View'}
        </p>
        <p className="text-sm opacity-80">
          {highContrast 
            ? 'Tap above to return to standard view' 
            : 'Tap above to enable high contrast mode'}
        </p>
      </div>
    </div>
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
