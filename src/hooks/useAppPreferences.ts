import { useState, useEffect, useCallback } from 'react';

export interface AppPreferences {
  notificationSounds: boolean;
  notificationSoundType: 'ding' | 'pop' | 'chime';
  rememberLogin: boolean;
  skipSplash: boolean;
}

const DEFAULT_PREFERENCES: AppPreferences = {
  notificationSounds: true,
  notificationSoundType: 'ding',
  rememberLogin: true,
  skipSplash: false,
};

const STORAGE_KEY = 'welile_app_preferences';

export function useAppPreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
      // Check for legacy skip splash preference
      const legacySkipSplash = localStorage.getItem('welile_skip_splash') === 'true';
      if (legacySkipSplash) {
        return { ...DEFAULT_PREFERENCES, skipSplash: true };
      }
    } catch (e) {
      console.error('Failed to load preferences:', e);
    }
    return DEFAULT_PREFERENCES;
  });

  // Persist preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      // Also update legacy key for splash screen
      if (preferences.skipSplash) {
        localStorage.setItem('welile_skip_splash', 'true');
      } else {
        localStorage.removeItem('welile_skip_splash');
      }
    } catch (e) {
      console.error('Failed to save preferences:', e);
    }
  }, [preferences]);

  const updatePreference = useCallback(<K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  return {
    preferences,
    updatePreference,
    resetPreferences,
  };
}

// Standalone function to check if notification sounds are enabled
export function areNotificationSoundsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.notificationSounds !== false;
    }
  } catch (e) {}
  return true;
}

// Standalone function to get notification sound type
export function getNotificationSoundType(): 'ding' | 'pop' | 'chime' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.notificationSoundType || 'ding';
    }
  } catch (e) {}
  return 'ding';
}

// Standalone function to check if remember login is enabled
export function isRememberLoginEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.rememberLogin !== false;
    }
  } catch (e) {}
  return true;
}
