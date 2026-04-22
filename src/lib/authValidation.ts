// Inline validation for faster processing (no zod overhead)
import { isValidPhoneNumberGlobal } from '@/lib/phoneUtils';

/**
 * Shared full-name validator used across every signup/registration screen.
 * - Trims surrounding whitespace
 * - Requires at least 2 visible characters
 * - Returns the trimmed value + an error message (null if valid)
 *
 * Always call this before submitting a registration form so we never
 * persist empty / whitespace-only / single-letter names to profiles.
 */
export const MIN_FULL_NAME_LENGTH = 2;

export interface FullNameValidationResult {
  valid: boolean;
  trimmed: string;
  error: string | null;
}

export const validateFullName = (raw: string | null | undefined): FullNameValidationResult => {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_FULL_NAME_LENGTH) {
    return {
      valid: false,
      trimmed,
      error: `Full name is required (minimum ${MIN_FULL_NAME_LENGTH} characters)`,
    };
  }
  return { valid: true, trimmed, error: null };
};

export const validateSignUp = (data: { password: string; confirmPassword: string; fullName: string; phone: string }) => {
  if (data.password.length < 6) return 'Password must be at least 6 characters';
  if (data.password !== data.confirmPassword) return "Passwords don't match";
  const nameCheck = validateFullName(data.fullName);
  if (!nameCheck.valid) return nameCheck.error;
  
  const phoneValidation = isValidPhoneNumberGlobal(data.phone);
  if (!phoneValidation.valid) return phoneValidation.reason || 'Invalid phone number';
  
  return null;
};

export const validateSignIn = (data: { phone: string; password: string }) => {
  const phoneValidation = isValidPhoneNumberGlobal(data.phone);
  if (!phoneValidation.valid) return phoneValidation.reason || 'Invalid phone number';
  if (!data.password) return 'Password is required';
  return null;
};

export const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), ms)
    ),
  ]);
