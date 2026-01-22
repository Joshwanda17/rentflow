import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface HighContrastContextType {
  highContrast: boolean;
  toggleHighContrast: () => void;
  setHighContrast: (enabled: boolean) => void;
}

const HighContrastContext = createContext<HighContrastContextType | undefined>(undefined);

const STORAGE_KEY = 'welile_high_contrast';

export function HighContrastProvider({ children }: { children: ReactNode }) {
  const [highContrast, setHighContrastState] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'true';
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) {
      root.classList.add('high-contrast');
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      root.classList.remove('high-contrast');
      localStorage.setItem(STORAGE_KEY, 'false');
    }
  }, [highContrast]);

  const toggleHighContrast = () => setHighContrastState(prev => !prev);
  const setHighContrast = (enabled: boolean) => setHighContrastState(enabled);

  return (
    <HighContrastContext.Provider value={{ highContrast, toggleHighContrast, setHighContrast }}>
      {children}
    </HighContrastContext.Provider>
  );
}

export function useHighContrast() {
  const context = useContext(HighContrastContext);
  if (!context) {
    throw new Error('useHighContrast must be used within a HighContrastProvider');
  }
  return context;
}
