import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type FontSize = 'small' | 'medium' | 'large' | 'extra-large';

interface FontSizeContextType {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  fontSizeClass: string;
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

const fontSizeClasses: Record<FontSize, string> = {
  'small': 'text-sm',      // 14px
  'medium': 'text-base',   // 16px (Gmail default)
  'large': 'text-lg',      // 18px
  'extra-large': 'text-xl' // 20px
};

const fontSizePixels: Record<FontSize, string> = {
  'small': '14px',
  'medium': '16px',
  'large': '18px',
  'extra-large': '20px'
};

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('welile-font-size');
      if (saved && ['small', 'medium', 'large', 'extra-large'].includes(saved)) {
        return saved as FontSize;
      }
    }
    return 'medium'; // Default to medium (16px - Gmail size)
  });

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem('welile-font-size', size);
  };

  useEffect(() => {
    // Apply font size to document root
    document.documentElement.style.fontSize = fontSizePixels[fontSize];
    document.documentElement.setAttribute('data-font-size', fontSize);
  }, [fontSize]);

  return (
    <FontSizeContext.Provider 
      value={{ 
        fontSize, 
        setFontSize, 
        fontSizeClass: fontSizeClasses[fontSize] 
      }}
    >
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  const context = useContext(FontSizeContext);
  if (context === undefined) {
    throw new Error('useFontSize must be used within a FontSizeProvider');
  }
  return context;
}

export const fontSizeOptions: { value: FontSize; label: string; description: string }[] = [
  { value: 'small', label: 'Small', description: '14px' },
  { value: 'medium', label: 'Medium', description: '16px (Default)' },
  { value: 'large', label: 'Large', description: '18px' },
  { value: 'extra-large', label: 'Extra Large', description: '20px' },
];
