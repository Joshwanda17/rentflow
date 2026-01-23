import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PinAuthContextType {
  isPinEnabled: boolean;
  isPinLocked: boolean;
  pinAttempts: number;
  maxAttempts: number;
  setupPin: (pin: string) => Promise<boolean>;
  verifyPin: (pin: string) => boolean;
  disablePin: () => void;
  lockApp: () => void;
  unlockApp: () => void;
  resetPinAttempts: () => void;
}

const PinAuthContext = createContext<PinAuthContextType | undefined>(undefined);

const PIN_STORAGE_KEY = 'welile_pin_hash';
const PIN_ENABLED_KEY = 'welile_pin_enabled';
const PIN_ATTEMPTS_KEY = 'welile_pin_attempts';
const PIN_LOCKED_UNTIL_KEY = 'welile_pin_locked_until';
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

// Simple hash function for PIN (for local storage only - not cryptographically secure but sufficient for device-local PIN)
const hashPin = (pin: string): string => {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Add some salt based on a fixed value
  const salted = `welile_${hash}_pin`;
  let finalHash = 0;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    finalHash = ((finalHash << 5) - finalHash) + char;
    finalHash = finalHash & finalHash;
  }
  return finalHash.toString(36);
};

export function PinAuthProvider({ children }: { children: ReactNode }) {
  const [isPinEnabled, setIsPinEnabled] = useState(false);
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinAttempts, setPinAttempts] = useState(0);

  useEffect(() => {
    // Check if PIN is enabled
    const pinEnabled = localStorage.getItem(PIN_ENABLED_KEY) === 'true';
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    setIsPinEnabled(pinEnabled && !!pinHash);

    // Check stored attempts
    const storedAttempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0', 10);
    setPinAttempts(storedAttempts);

    // Check if locked out
    const lockedUntil = localStorage.getItem(PIN_LOCKED_UNTIL_KEY);
    if (lockedUntil) {
      const lockTime = parseInt(lockedUntil, 10);
      if (Date.now() < lockTime) {
        setIsPinLocked(true);
        // Set timeout to unlock
        const timeout = setTimeout(() => {
          setIsPinLocked(false);
          localStorage.removeItem(PIN_LOCKED_UNTIL_KEY);
          resetPinAttempts();
        }, lockTime - Date.now());
        return () => clearTimeout(timeout);
      } else {
        // Lockout expired
        localStorage.removeItem(PIN_LOCKED_UNTIL_KEY);
        resetPinAttempts();
      }
    }
  }, []);

  const setupPin = async (pin: string): Promise<boolean> => {
    if (pin.length !== 4) return false;
    
    const hash = hashPin(pin);
    localStorage.setItem(PIN_STORAGE_KEY, hash);
    localStorage.setItem(PIN_ENABLED_KEY, 'true');
    setIsPinEnabled(true);
    resetPinAttempts();
    return true;
  };

  const verifyPin = (pin: string): boolean => {
    const storedHash = localStorage.getItem(PIN_STORAGE_KEY);
    if (!storedHash) return false;

    const inputHash = hashPin(pin);
    const isValid = inputHash === storedHash;

    if (isValid) {
      resetPinAttempts();
      setIsPinLocked(false);
      return true;
    } else {
      const newAttempts = pinAttempts + 1;
      setPinAttempts(newAttempts);
      localStorage.setItem(PIN_ATTEMPTS_KEY, newAttempts.toString());

      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        const lockUntil = Date.now() + LOCKOUT_DURATION;
        localStorage.setItem(PIN_LOCKED_UNTIL_KEY, lockUntil.toString());
        setIsPinLocked(true);
        
        // Auto unlock after duration
        setTimeout(() => {
          setIsPinLocked(false);
          localStorage.removeItem(PIN_LOCKED_UNTIL_KEY);
          resetPinAttempts();
        }, LOCKOUT_DURATION);
      }
      return false;
    }
  };

  const disablePin = () => {
    localStorage.removeItem(PIN_STORAGE_KEY);
    localStorage.removeItem(PIN_ENABLED_KEY);
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
    localStorage.removeItem(PIN_LOCKED_UNTIL_KEY);
    setIsPinEnabled(false);
    setIsPinLocked(false);
    resetPinAttempts();
  };

  const lockApp = () => {
    if (isPinEnabled) {
      setIsPinLocked(true);
    }
  };

  const unlockApp = () => {
    setIsPinLocked(false);
  };

  const resetPinAttempts = () => {
    setPinAttempts(0);
    localStorage.setItem(PIN_ATTEMPTS_KEY, '0');
  };

  return (
    <PinAuthContext.Provider value={{
      isPinEnabled,
      isPinLocked,
      pinAttempts,
      maxAttempts: MAX_PIN_ATTEMPTS,
      setupPin,
      verifyPin,
      disablePin,
      lockApp,
      unlockApp,
      resetPinAttempts
    }}>
      {children}
    </PinAuthContext.Provider>
  );
}

export function usePinAuth() {
  const context = useContext(PinAuthContext);
  if (context === undefined) {
    throw new Error('usePinAuth must be used within a PinAuthProvider');
  }
  return context;
}
