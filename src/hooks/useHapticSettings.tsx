import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type HapticIntensity = 'off' | 'light' | 'medium' | 'strong';

interface HapticSettingsContextType {
  intensity: HapticIntensity;
  setIntensity: (intensity: HapticIntensity) => void;
  isEnabled: boolean;
}

const HapticSettingsContext = createContext<HapticSettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'haptic-intensity';

export const hapticIntensityOptions = [
  { value: 'off' as const, label: 'Off', description: 'No vibration feedback' },
  { value: 'light' as const, label: 'Light', description: 'Subtle vibration' },
  { value: 'medium' as const, label: 'Medium', description: 'Balanced feedback' },
  { value: 'strong' as const, label: 'Strong', description: 'Maximum intensity' },
];

export function HapticSettingsProvider({ children }: { children: ReactNode }) {
  const [intensity, setIntensityState] = useState<HapticIntensity>(() => {
    if (typeof window === 'undefined') return 'medium';
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as HapticIntensity) || 'medium';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, intensity);
  }, [intensity]);

  const setIntensity = (newIntensity: HapticIntensity) => {
    setIntensityState(newIntensity);
  };

  const isEnabled = intensity !== 'off';

  return (
    <HapticSettingsContext.Provider value={{ intensity, setIntensity, isEnabled }}>
      {children}
    </HapticSettingsContext.Provider>
  );
}

export function useHapticSettings() {
  const context = useContext(HapticSettingsContext);
  if (context === undefined) {
    throw new Error('useHapticSettings must be used within a HapticSettingsProvider');
  }
  return context;
}

// Standalone function to get intensity without context (for use in haptics.ts)
export function getStoredHapticIntensity(): HapticIntensity {
  if (typeof window === 'undefined') return 'medium';
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored as HapticIntensity) || 'medium';
}

// Get multiplier based on intensity
export function getIntensityMultiplier(intensity: HapticIntensity): number {
  switch (intensity) {
    case 'off': return 0;
    case 'light': return 0.5;
    case 'medium': return 1;
    case 'strong': return 1.5;
    default: return 1;
  }
}
