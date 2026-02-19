// Inline validation for faster processing (no zod overhead)
import { isValidPhoneNumberGlobal } from '@/lib/phoneUtils';

export const validateSignUp = (data: { password: string; confirmPassword: string; fullName: string; phone: string }) => {
  if (data.password.length < 6) return 'Password must be at least 6 characters';
  if (data.password !== data.confirmPassword) return "Passwords don't match";
  if (data.fullName.length < 2) return 'Full name is required';
  
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
