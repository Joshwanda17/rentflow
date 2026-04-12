import { useState } from 'react';
import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { useLanguage } from '@/hooks/useLanguage';
import { useCurrency } from '@/hooks/useCurrency';
import { useHighContrast } from '@/hooks/useHighContrast';
import { languageFlags } from '@/i18n/translations';
import WelileAIChatDrawer from './ai-chat/WelileAIChatDrawer';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, DollarSign, ArrowLeftRight, Eye } from 'lucide-react';
import { CurrencyConverter } from '@/components/CurrencyConverter';
import { HighContrastToggle } from '@/components/HighContrastToggle';

const GeminiSparkle = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 2C14 2 16.5 9 18.5 11.5C20.5 14 26 14 26 14C26 14 20.5 14 18.5 16.5C16.5 19 14 26 14 26C14 26 11.5 19 9.5 16.5C7.5 14 2 14 2 14C2 14 7.5 14 9.5 11.5C11.5 9 14 2 14 2Z"
      fill="currentColor"
    />
  </svg>
);

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
          {language === lang.code && <span className="ml-auto text-primary">✓</span>}
        </motion.button>
      ))}
    </div>
  );
};

// Currency Grid Selector
const CurrencySelectorGrid = () => {
  const { currency, setCurrency, getCurrencyByCode } = useCurrency();
  const currencies = [
    { code: 'UGX', name: 'Ugandan Shilling', flag: '🇺🇬', symbol: 'UGX' },
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
            {currency.code === curr.code && <span className="text-primary">✓</span>}
          </motion.button>
        );
      })}
    </div>
  );
};

// Accessibility Settings
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
          <p className="text-sm text-muted-foreground">Larger text & enhanced contrast</p>
        </div>
        <div className={`w-14 h-8 rounded-full p-1 transition-colors ${highContrast ? 'bg-primary' : 'bg-muted'}`}>
          <motion.div
            className="w-6 h-6 rounded-full bg-white shadow-md"
            animate={{ x: highContrast ? 22 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </div>
      </motion.button>
    </div>
  );
};

export default function FloatingToolbar() {
  const [aiOpen, setAiOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { currency } = useCurrency();

  return (
    <>
      {/* Desktop toolbar */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
        className="fixed bottom-6 right-4 z-[60] hidden md:flex flex-col items-center gap-3"
      >
        {/* Share Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { hapticTap(); navigate('/install'); }}
          className="h-11 w-11 rounded-full bg-gradient-to-r from-success to-success/80 text-success-foreground shadow-lg flex items-center justify-center"
          style={{ boxShadow: '0 4px 14px hsl(var(--success) / 0.3)' }}
          aria-label="Share App"
        >
          <Share2 className="h-4 w-4" />
        </motion.button>

        {/* Settings Button */}
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="h-11 w-11 rounded-full bg-gradient-to-r from-primary to-primary/80 shadow-lg flex items-center justify-center"
              aria-label="Language & Currency"
            >
              <div className="flex flex-col items-center">
                <span className="text-sm leading-none">{languageFlags[language]}</span>
                <span className="text-[8px] font-bold text-primary-foreground leading-none">{currency.code}</span>
              </div>
            </motion.button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl">
            <SheetHeader className="pb-4">
              <SheetTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Language & Currency
              </SheetTitle>
            </SheetHeader>
            <Tabs defaultValue="language" className="h-full">
              <TabsList className="w-full grid grid-cols-4">
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
                <TabsTrigger value="accessibility" className="gap-1.5">
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Vision</span>
                </TabsTrigger>
              </TabsList>
              <div className="mt-4 overflow-y-auto max-h-[calc(75vh-140px)]">
                <TabsContent value="language" className="mt-0"><LanguageSelectorGrid /></TabsContent>
                <TabsContent value="currency" className="mt-0"><CurrencySelectorGrid /></TabsContent>
                <TabsContent value="converter" className="mt-0"><CurrencyConverter /></TabsContent>
                <TabsContent value="accessibility" className="mt-0"><AccessibilitySettings /></TabsContent>
              </div>
            </Tabs>
          </SheetContent>
        </Sheet>

        {/* AI Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.93 }}
          onClick={() => setAiOpen(true)}
          className={cn(
            "h-11 px-3 rounded-full",
            "bg-gradient-to-r from-primary to-primary/85",
            "text-primary-foreground",
            "shadow-lg shadow-primary/25",
            "flex items-center gap-1.5",
            "border border-primary-foreground/15"
          )}
          aria-label="Open Welile AI"
        >
          <GeminiSparkle size={16} />
          <span className="font-semibold text-xs whitespace-nowrap">Welile AI</span>
        </motion.button>
      </motion.div>

      {/* Mobile-only currency button */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetTrigger asChild>
          <button
            className="md:hidden fixed bottom-24 left-4 z-[60] h-10 w-10 rounded-full bg-primary shadow-lg flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
            aria-label="Language & Currency"
          >
            <div className="flex flex-col items-center">
              <span className="text-xs leading-none">{languageFlags[language]}</span>
              <span className="text-[7px] font-bold text-primary-foreground leading-none">{currency.code}</span>
            </div>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Language & Currency
            </SheetTitle>
          </SheetHeader>
          <Tabs defaultValue="language" className="h-full">
            <TabsList className="w-full grid grid-cols-4">
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
              <TabsTrigger value="accessibility" className="gap-1.5">
                <Eye className="h-4 w-4" />
                <span className="hidden sm:inline">Vision</span>
              </TabsTrigger>
            </TabsList>
            <div className="mt-4 overflow-y-auto max-h-[calc(75vh-140px)]">
              <TabsContent value="language" className="mt-0"><LanguageSelectorGrid /></TabsContent>
              <TabsContent value="currency" className="mt-0"><CurrencySelectorGrid /></TabsContent>
              <TabsContent value="converter" className="mt-0"><CurrencyConverter /></TabsContent>
              <TabsContent value="accessibility" className="mt-0"><AccessibilitySettings /></TabsContent>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>

      <WelileAIChatDrawer open={aiOpen} onOpenChange={setAiOpen} />
    </>
  );
}
