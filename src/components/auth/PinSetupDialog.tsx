import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Check, X, AlertCircle, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { usePinAuth } from '@/hooks/usePinAuth';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { toast } from 'sonner';

interface PinSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

type Step = 'enter' | 'confirm';

export default function PinSetupDialog({ open, onOpenChange, onComplete }: PinSetupDialogProps) {
  const [step, setStep] = useState<Step>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const { setupPin } = usePinAuth();

  const handlePinEntered = () => {
    if (pin.length === 4) {
      setStep('confirm');
      setError('');
    }
  };

  const handleConfirmPin = async () => {
    if (confirmPin.length !== 4) return;

    if (pin === confirmPin) {
      const success = await setupPin(pin);
      if (success) {
        hapticSuccess();
        toast.success('PIN set up successfully!', {
          description: 'You can now use your PIN for quick access'
        });
        onComplete?.();
        handleClose();
      }
    } else {
      hapticError();
      setIsShaking(true);
      setError('PINs do not match. Please try again.');
      setConfirmPin('');
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  const handleClose = () => {
    setStep('enter');
    setPin('');
    setConfirmPin('');
    setError('');
    onOpenChange(false);
  };

  const handleBack = () => {
    setStep('enter');
    setConfirmPin('');
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            {step === 'enter' ? 'Create PIN' : 'Confirm PIN'}
          </DialogTitle>
          <DialogDescription>
            {step === 'enter' 
              ? 'Create a 4-digit PIN for quick access to your account'
              : 'Enter your PIN again to confirm'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <AnimatePresence mode="wait">
            {step === 'enter' ? (
              <motion.div
                key="enter"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="p-4 rounded-full bg-primary/10">
                  <Lock className="h-8 w-8 text-primary" />
                </div>

                <InputOTP
                  maxLength={4}
                  value={pin}
                  onChange={(value) => {
                    setPin(value);
                    if (value.length === 4) {
                      setTimeout(handlePinEntered, 200);
                    }
                  }}
                  containerClassName="justify-center"
                >
                  <InputOTPGroup className="gap-3">
                    {[0, 1, 2, 3].map((index) => (
                      <InputOTPSlot 
                        key={index} 
                        index={index}
                        className="h-14 w-14 text-2xl rounded-xl border-2"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>

                <p className="text-sm text-muted-foreground text-center">
                  Choose a PIN you'll remember
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col items-center gap-6"
              >
                <motion.div 
                  className="p-4 rounded-full bg-success/10"
                  animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  <Check className="h-8 w-8 text-success" />
                </motion.div>

                <motion.div
                  animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  <InputOTP
                    maxLength={4}
                    value={confirmPin}
                    onChange={(value) => {
                      setConfirmPin(value);
                      setError('');
                      if (value.length === 4) {
                        setTimeout(handleConfirmPin, 200);
                      }
                    }}
                    containerClassName="justify-center"
                  >
                    <InputOTPGroup className="gap-3">
                      {[0, 1, 2, 3].map((index) => (
                        <InputOTPSlot 
                          key={index} 
                          index={index}
                          className="h-14 w-14 text-2xl rounded-xl border-2"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </motion.div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-destructive text-sm"
                  >
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </motion.div>
                )}

                <Button variant="ghost" size="sm" onClick={handleBack}>
                  Go back
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          {step === 'enter' && (
            <Button 
              onClick={handlePinEntered} 
              disabled={pin.length !== 4}
              className="flex-1"
            >
              Continue
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
