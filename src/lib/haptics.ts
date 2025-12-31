/**
 * Haptic feedback utilities for mobile devices
 * Uses the Vibration API when available
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 20],
  warning: [30, 50, 30],
  error: [50, 100, 50],
  selection: 5,
};

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Trigger haptic feedback
 * @param pattern - The type of haptic feedback to trigger
 */
export function haptic(pattern: HapticPattern = 'light'): void {
  if (!isHapticSupported()) return;
  
  try {
    navigator.vibrate(patterns[pattern]);
  } catch {
    // Silently fail if vibration is not allowed
  }
}

/**
 * Trigger a light tap feedback
 */
export function hapticTap(): void {
  haptic('light');
}

/**
 * Trigger a medium impact feedback
 */
export function hapticImpact(): void {
  haptic('medium');
}

/**
 * Trigger a heavy impact feedback
 */
export function hapticHeavy(): void {
  haptic('heavy');
}

/**
 * Trigger a success feedback pattern
 */
export function hapticSuccess(): void {
  haptic('success');
}

/**
 * Trigger a selection change feedback
 */
export function hapticSelection(): void {
  haptic('selection');
}
