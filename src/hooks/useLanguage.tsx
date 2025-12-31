import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations, Translations } from '@/i18n/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'welile-language';

// Detect browser language and map to supported languages
const detectBrowserLanguage = (): Language => {
  if (typeof navigator === 'undefined') return 'en';
  
  const browserLang = navigator.language.toLowerCase();
  
  // Map browser languages to our supported languages
  if (browserLang.startsWith('sw')) return 'sw';
  if (browserLang.startsWith('fr')) return 'fr';
  if (browserLang.startsWith('am')) return 'am';
  
  // Check for East African countries that commonly use Swahili
  const swahiliCountries = ['ke', 'tz', 'ug', 'rw', 'bi'];
  const countryCode = browserLang.split('-')[1]?.toLowerCase();
  if (countryCode && swahiliCountries.includes(countryCode)) return 'sw';
  
  return 'en';
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Check localStorage first
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['en', 'sw', 'fr', 'am'].includes(stored)) {
        return stored as Language;
      }
    }
    return detectBrowserLanguage();
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    
    // Update HTML lang attribute for accessibility and SEO
    document.documentElement.lang = lang === 'am' ? 'am' : lang === 'sw' ? 'sw' : lang === 'fr' ? 'fr' : 'en';
  };

  useEffect(() => {
    // Set initial lang attribute
    document.documentElement.lang = language === 'am' ? 'am' : language === 'sw' ? 'sw' : language === 'fr' ? 'fr' : 'en';
  }, []);

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
