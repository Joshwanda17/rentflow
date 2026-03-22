import { useState } from 'react';
import { Fingerprint, Scan, Smartphone, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { toast } from 'sonner';
import { hapticSuccess, hapticError } from '@/lib/haptics';

export default function BiometricSecuritySection() {
  const { 
    isBiometricAvailable, 
    isBiometricEnabled, 
    biometricType,
    enableBiometric, 
    disableBiometric,
    isAuthenticating 
  } = useBiometricAuth();

  const [isEnabling, setIsEnabling] = useState(false);

  const getBiometricIcon = () => {
    if (biometricType === 'face') {
      return <Scan className="h-5 w-5" />;
    }
    return <Fingerprint className="h-5 w-5" />;
  };

  const getBiometricName = () => {
    if (biometricType === 'face') return 'Face ID';
    if (biometricType === 'fingerprint') return 'Fingerprint';
    return 'Biometric';
  };

  const handleEnableBiometric = async () => {
    setIsEnabling(true);
    try {
      const success = await enableBiometric();
      if (success) {
        hapticSuccess();
        toast.success(`${getBiometricName()} enabled!`, {
          description: 'You can now use biometric authentication to sign in'
        });
      } else {
        hapticError();
        toast.error('Setup cancelled', {
          description: 'Biometric authentication was not enabled'
        });
      }
    } catch (error) {
      hapticError();
      toast.error('Setup failed', {
        description: 'Could not enable biometric authentication'
      });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDisableBiometric = () => {
    disableBiometric();
    hapticSuccess();
    toast.success(`${getBiometricName()} disabled`, {
      description: 'You will need to use PIN or password to sign in'
    });
  };

  if (!isBiometricAvailable) {
    return (
      <div>
        <Card className="glass-card border-border/50 shadow-elevated overflow-hidden opacity-60">
          <div className="absolute inset-0 bg-gradient-to-br from-muted/20 via-transparent to-muted/20 pointer-events-none" />
          
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-muted">
                <Fingerprint className="h-5 w-5 text-muted-foreground" />
              </div>
              Biometric Login
            </CardTitle>
            <CardDescription>
              Not available on this device
            </CardDescription>
          </CardHeader>
          
          <CardContent className="relative">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border/50">
              <div className="p-2 rounded-lg bg-muted">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Fingerprint or Face ID is not available on your device or browser
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card className="glass-card border-border/50 shadow-elevated overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              {biometricType === 'face' ? (
                <Scan className="h-5 w-5 text-primary" />
              ) : (
                <Fingerprint className="h-5 w-5 text-primary" />
              )}
            </div>
            {getBiometricName()} Login
          </CardTitle>
          <CardDescription>
            Sign in quickly using {getBiometricName().toLowerCase()}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4 relative">
          {isBiometricEnabled ? (
            <>
              {/* Biometric Enabled State */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/20">
                    <CheckCircle className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="font-medium text-success">{getBiometricName()} Enabled</p>
                    <p className="text-sm text-muted-foreground">
                      Quick biometric access is active
                    </p>
                  </div>
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <XCircle className="h-4 w-4 mr-2" />
                    Disable {getBiometricName()}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable {getBiometricName()}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You will need to use your PIN or password to sign in. You can enable {getBiometricName().toLowerCase()} again anytime.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisableBiometric}>
                      Disable
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              {/* Biometric Disabled State */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-background/50 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    {getBiometricIcon()}
                  </div>
                  <div>
                    <p className="font-medium">{getBiometricName()} Not Set Up</p>
                    <p className="text-sm text-muted-foreground">
                      Enable for faster sign-in
                    </p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleEnableBiometric}
                disabled={isEnabling || isAuthenticating}
                className="w-full h-12"
              >
                {isEnabling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    {getBiometricIcon()}
                    <span className="ml-2">Enable {getBiometricName()}</span>
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Your biometric data never leaves your device
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
