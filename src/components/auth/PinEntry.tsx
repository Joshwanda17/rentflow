import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, AlertCircle, Fingerprint, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { usePinAuth } from '@/hooks/usePinAuth';
import { useAuth } from '@/hooks/useAuth';
import WelileLogo from '@/components/WelileLogo';
import { hapticError, hapticSuccess } from '@/lib/haptics';

interface PinEntryProps {
  onSuccess: () => void;
  onFallbackToPassword?: () => void;
}

export default function PinEntry({ onSuccess, onFallbackToPassword }: PinEntryProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const { verifyPin, isPinLocked, pinAttempts, maxAttempts } = usePinAuth();
  const { user } = useAuth();

  useEffect(() => {
    if (pin.length === 4) {
      handlePinSubmit();
    }
  }, [pin]);

  const handlePinSubmit = () => {
    if (isPinLocked) {
      setError('Too many attempts. Please wait 5 minutes.');
      return;
    }

    const isValid = verifyPin(pin);
    if (isValid) {
      hapticSuccess();
      onSuccess();
    } else {
      hapticError();
      setIsShaking(true);
      setError(`Incorrect PIN. ${maxAttempts - pinAttempts - 1} attempts remaining.`);
      setPin('');
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  const remainingTime = isPinLocked ? '5:00' : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          className="absolute bottom-0 left-0 w-72 h-72 bg-accent/10 rounded-full blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm space-y-8"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <WelileLogo linkToHome={false} />
          <div className="text-center">
            <h1 className="text-2xl font-bold">Welcome Back</h1>
            <p className="text-muted-foreground text-sm">Enter your PIN to continue</p>
          </div>
        </div>

        {/* Lock Icon */}
        <motion.div 
          className="flex justify-center"
          animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <div className={`p-6 rounded-full ${isPinLocked ? 'bg-destructive/10' : 'bg-primary/10'}`}>
            <Lock className={`h-12 w-12 ${isPinLocked ? 'text-destructive' : 'text-primary'}`} />
          </div>
        </motion.div>

        {/* PIN Input */}
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={setPin}
              disabled={isPinLocked}
              containerClassName="justify-center"
            >
              <InputOTPGroup className="gap-3">
                {[0, 1, 2, 3].map((index) => (
                  <InputOTPSlot 
                    key={index} 
                    index={index}
                    className="h-14 w-14 text-2xl rounded-xl border-2 border-border/50 bg-card/50 backdrop-blur-sm"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </motion.div>

          {/* Error Message */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-destructive text-sm"
              >
                <AlertCircle className="h-4 w-4" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Locked Message */}
          {isPinLocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center p-4 rounded-xl bg-destructive/10 border border-destructive/20"
            >
              <p className="text-destructive font-medium">Account Temporarily Locked</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please wait 5 minutes or use your password
              </p>
            </motion.div>
          )}
        </div>

        {/* Fallback to Password */}
        {onFallbackToPassword && (
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="ghost"
              onClick={onFallbackToPassword}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Use Password Instead
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
