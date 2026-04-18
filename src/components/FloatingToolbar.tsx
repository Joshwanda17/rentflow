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

        {/* WhatsApp Button */}
        <motion.a
          href="https://wa.me/256777607640"
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.93 }}
          className={cn(
            "h-11 w-11 rounded-full",
            "bg-[#25D366] text-white",
            "shadow-lg shadow-[#25D366]/30",
            "flex items-center justify-center",
            "border border-white/15"
          )}
          aria-label="Chat on WhatsApp"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
        </motion.a>
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

      {/* Mobile-only WhatsApp button */}
      <motion.a
        href="https://wa.me/256777607640"
        target="_blank"
        rel="noopener noreferrer"
        whileTap={{ scale: 0.93 }}
        className="md:hidden fixed bottom-36 left-4 z-[60] h-10 w-10 rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 flex items-center justify-center border border-white/15 active:scale-95 transition-transform touch-manipulation"
        aria-label="Chat on WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      </motion.a>

      <WelileAIChatDrawer open={aiOpen} onOpenChange={setAiOpen} />
    </>
  );
}
