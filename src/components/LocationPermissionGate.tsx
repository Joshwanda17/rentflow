import { useEffect, ReactNode } from 'react';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useAuth } from '@/hooks/useAuth';

interface LocationPermissionGateProps {
  children: ReactNode;
}

/**
 * LocationPermissionGate - Silently tracks user location in the background.
 * By using this app, users implicitly consent to location tracking.
 * The browser's native permission dialog will appear, but the app
 * continues functioning regardless of the user's choice.
 */
export function LocationPermissionGate({ children }: LocationPermissionGateProps) {
  const { user } = useAuth();
  const { captureLocation } = useLocationTracking();

  // Silently attempt to capture location when user is logged in
  useEffect(() => {
    if (user) {
      // Small delay to ensure smooth page load, then silently request location
      const timer = setTimeout(() => {
        captureLocation();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [user, captureLocation]);

  // Always render children - no blocking UI
  return <>{children}</>;
}
