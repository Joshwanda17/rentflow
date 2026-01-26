import { useState, useEffect, ReactNode } from 'react';
import { MapPin, AlertTriangle, RefreshCw, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useAuth } from '@/hooks/useAuth';

interface LocationPermissionGateProps {
  children: ReactNode;
}

export function LocationPermissionGate({ children }: LocationPermissionGateProps) {
  const { user } = useAuth();
  const { location, loading, error, permissionDenied, captureLocation } = useLocationTracking();
  const [permissionState, setPermissionState] = useState<'checking' | 'granted' | 'denied' | 'prompt'>('checking');
  const [isRequesting, setIsRequesting] = useState(false);

  // Check permission state on mount
  useEffect(() => {
    const checkPermission = async () => {
      if (!navigator.geolocation) {
        setPermissionState('denied');
        return;
      }

      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionState(result.state as 'granted' | 'denied' | 'prompt');
        
        // Listen for permission changes
        result.addEventListener('change', () => {
          setPermissionState(result.state as 'granted' | 'denied' | 'prompt');
        });
      } catch {
        // Permissions API not supported, try to get location directly
        setPermissionState('prompt');
      }
    };

    if (user) {
      checkPermission();
    }
  }, [user]);

  // Update permission state based on location tracking results
  useEffect(() => {
    if (location) {
      setPermissionState('granted');
    } else if (permissionDenied) {
      setPermissionState('denied');
    }
  }, [location, permissionDenied]);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    await captureLocation();
    setIsRequesting(false);
  };

  // Not logged in - don't gate
  if (!user) {
    return <>{children}</>;
  }

  // Still checking or loading initial state
  if (permissionState === 'checking' && !error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <p className="text-muted-foreground">Checking location permissions...</p>
        </div>
      </div>
    );
  }

  // Permission granted and location captured
  if (permissionState === 'granted' && location) {
    return <>{children}</>;
  }

  // Permission denied
  if (permissionState === 'denied' || permissionDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">Location Access Required</CardTitle>
            <CardDescription className="text-base mt-2">
              Location access has been blocked. To use Welile, you must enable location permissions in your browser settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium">How to enable location:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Click the lock/info icon in your browser's address bar</li>
                <li>Find "Location" in the permissions</li>
                <li>Change it to "Allow"</li>
                <li>Refresh this page</li>
              </ol>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prompt state - need to request permission
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Enable Location Access</CardTitle>
          <CardDescription className="text-base mt-2">
            Welile requires your location for security and verification purposes. Your location helps us protect your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Why we need your location:</p>
              <ul className="mt-1 text-muted-foreground space-y-1">
                <li>• Verify your identity for transactions</li>
                <li>• Protect your account from fraud</li>
                <li>• Ensure secure access to services</li>
              </ul>
            </div>
          </div>
          
          {error && !permissionDenied && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <Button 
            onClick={handleRequestPermission} 
            className="w-full gap-2"
            disabled={isRequesting || loading}
          >
            {(isRequesting || loading) ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Getting Location...
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                Allow Location Access
              </>
            )}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            Your location data is encrypted and securely stored. We never share it with third parties.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
