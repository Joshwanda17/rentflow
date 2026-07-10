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

/** Obvious placeholder / dummy names we never want to persist. */
const DUMMY_NAME_WORDS = new Set([
  'test', 'testing', 'tester', 'demo', 'sample', 'example', 'dummy', 'fake',
  'user', 'users', 'admin', 'name', 'fullname', 'firstname', 'lastname',
  'unknown', 'none', 'null', 'undefined', 'na', 'nan', 'xxx', 'abc', 'abcd',
  'asdf', 'asdfg', 'asdfgh', 'qwerty', 'qwe', 'qwer', 'zxc', 'zxcv',
  'aaa', 'bbb', 'ccc', 'ddd', 'lorem', 'ipsum', 'anonymous', 'nobody',
]);

/**
 * Heuristic gibberish detector for a single name token.
 * Flags keyboard-mash / random strings like "dhfhfdhd", "hshseh", "twat".
 */
const isGibberishToken = (token: string): boolean => {
  const t = token.toLowerCase().replace(/[^a-z]/g, '');
  if (t.length < 2) return false;

  // Known dummy word.
  if (DUMMY_NAME_WORDS.has(t)) return true;

  // Real names almost always contain a vowel. Long consonant-only tokens are noise.
  const vowels = (t.match(/[aeiou]/g) || []).length;
  if (t.length >= 4 && vowels === 0) return true;

  // Very low vowel ratio on longer tokens (e.g. "dhfhfdhd", "hshseh").
  if (t.length >= 5 && vowels / t.length < 0.2) return true;

  // Same character repeated (e.g. "aaaa").
  if (/^(.)\1+$/.test(t)) return true;

  // A run of 4+ identical letters (e.g. "jaaaan").
  if (/(.)\1{3,}/.test(t)) return true;

  // Four or more consecutive consonants is unnatural for a real name
  // (allow common clusters by only flagging 4+, e.g. "dhfh", "shss").
  if (/[bcdfghjklmnpqrstvwxz]{4,}/.test(t)) return true;

  return false;
};

export const validateFullName = (raw: string | null | undefined): FullNameValidationResult => {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_FULL_NAME_LENGTH) {
    return {
      valid: false,
      trimmed,
      error: `Full name is required (minimum ${MIN_FULL_NAME_LENGTH} characters)`,
    };
  }

  // Require at least two name parts (e.g. first + last name).
  const parts = trimmed.split(' ').filter((p) => p.replace(/[^a-zA-Z]/g, '').length > 0);
  if (parts.length < 2) {
    return {
      valid: false,
      trimmed,
      error: 'Please enter at least two names (first and last name)',
    };
  }

  // Each part must have at least 2 letters.
  if (parts.some((p) => p.replace(/[^a-zA-Z]/g, '').length < 2)) {
    return {
      valid: false,
      trimmed,
      error: 'Each name must be at least 2 letters',
    };
  }

  // Reject obvious dummy / gibberish names.
  if (parts.some((p) => isGibberishToken(p))) {
    return {
      valid: false,
      trimmed,
      error: 'Please enter a real full name',
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
