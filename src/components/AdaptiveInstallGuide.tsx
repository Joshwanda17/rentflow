import { motion } from 'framer-motion';
import { X, Copy, ExternalLink, Check, Smartphone, Monitor, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { 
  detectPlatform, 
  getInstallInstructions, 
  getBrowserName, 
  getOSName,
  type PlatformInfo,
  type InstallInstructions 
} from '@/lib/platformDetection';
import { toast } from 'sonner';

interface AdaptiveInstallGuideProps {
  onClose: () => void;
  onInstall?: () => Promise<boolean>;
}

export default function AdaptiveInstallGuide({ onClose, onInstall }: AdaptiveInstallGuideProps) {
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [instructions, setInstructions] = useState<InstallInstructions | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const detected = detectPlatform();
    setPlatform(detected);
    setInstructions(getInstallInstructions(detected));
  }, []);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleInstallClick = async () => {
    if (platform?.installMethod === 'prompt' && onInstall) {
      setIsInstalling(true);
      try {
        const success = await onInstall();
        if (success) {
          onClose();
        }
      } finally {
        setIsInstalling(false);
      }
    }
  };

  if (!platform || !instructions) {
    return null;
  }

  const DeviceIcon = platform.device === 'mobile' ? Smartphone : 
                     platform.device === 'tablet' ? Tablet : Monitor;

  const needsSwitchBrowser = platform.os === 'ios' && platform.browser !== 'safari';
  const canAutoInstall = platform.installMethod === 'prompt';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md">
            <img src="/welile-logo.png" alt="Welile" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="font-semibold">Install Welile</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span>{instructions.browserIcon}</span>
              <span>{getBrowserName(platform.browser)} on {getOSName(platform.os)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="max-w-md mx-auto space-y-6">
          
          {/* Browser/OS Warning Banner */}
          {needsSwitchBrowser && (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-4 bg-warning/10 border border-warning/30 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <ExternalLink className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Open in Safari to install</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getBrowserName(platform.browser)} on iOS can't install apps. Copy the link and open in Safari.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3 gap-2 h-11 text-base touch-manipulation active:scale-[0.98] transition-transform"
                    onClick={copyUrl}
                    style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Auto-Install Button for supported browsers */}
          {canAutoInstall && onInstall && (
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center"
            >
              <Button 
                size="lg" 
                className="w-full gap-2 text-lg py-6 shadow-lg touch-manipulation active:scale-[0.98] transition-transform"
                onClick={handleInstallClick}
                disabled={isInstalling}
                style={{ WebkitTapHighlightColor: 'transparent', fontSize: '18px' }}
              >
                <DeviceIcon className="h-5 w-5" />
                {isInstalling ? 'Installing...' : 'Install Now'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                One tap to install the app
              </p>
            </motion.div>
          )}

          {/* Manual Instructions */}
          {(!canAutoInstall || platform.os === 'ios') && (
            <>
              <div className="text-center">
                <h3 className="text-lg font-semibold">{instructions.title}</h3>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {instructions.steps.map((step, index) => (
                  <motion.div
                    key={index}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-4 p-4 bg-card border rounded-xl shadow-sm"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-2xl">{step.icon}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        {step.text}{' '}
                        {step.highlight && (
                          <span className="font-semibold text-primary">{step.highlight}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground">
                      {index + 1}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Note */}
              {instructions.note && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="p-3 bg-muted/50 rounded-lg"
                >
                  <p className="text-xs text-muted-foreground text-center">
                    💡 {instructions.note}
                  </p>
                </motion.div>
              )}
            </>
          )}

          {/* Benefits */}
          <div className="bg-gradient-to-br from-success/10 to-emerald-500/10 rounded-xl p-4 border border-success/20">
            <h5 className="font-medium mb-3 text-sm text-success">Why install?</h5>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center text-[10px]">✓</span>
                <span>Instant access</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center text-[10px]">✓</span>
                <span>Works offline</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center text-[10px]">✓</span>
                <span>Full screen</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center text-[10px]">✓</span>
                <span>Notifications</span>
              </div>
            </div>
          </div>

          {/* Platform Info (debug - can be hidden in production) */}
          <div className="text-center text-xs text-muted-foreground/50">
            Detected: {getBrowserName(platform.browser)} {platform.browserVersion} on {getOSName(platform.os)} {platform.osVersion}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div 
        className="p-4 border-t bg-card"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        }}
      >
        <div className="max-w-md mx-auto flex gap-3">
          {canAutoInstall && onInstall && (
            <Button 
              className="flex-1 h-12 text-base touch-manipulation active:scale-[0.98] transition-transform"
              onClick={handleInstallClick}
              disabled={isInstalling}
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              {isInstalling ? 'Installing...' : 'Install'}
            </Button>
          )}
          {needsSwitchBrowser && (
            <Button 
              className="flex-1 gap-2 h-12 text-base touch-manipulation active:scale-[0.98] transition-transform"
              onClick={copyUrl}
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
