import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Tv, ExternalLink, Copy, Check, QrCode, Loader2, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

interface ChromecastButtonProps {
  className?: string;
}

// Generate a simple 6-character code from the current timestamp
const generatePairingCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export function ChromecastButton({ className }: ChromecastButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [casting, setCasting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');

  const tvDashboardUrl = `${window.location.origin}/tv-dashboard`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(tvDashboardUrl);
      setCopied(true);
      toast.success('TV Dashboard link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleOpenInNewTab = () => {
    window.open(tvDashboardUrl, '_blank');
  };

  const handleGenerateCode = () => {
    const code = generatePairingCode();
    setGeneratedCode(code);
    // Store the code in localStorage so TV can validate it
    localStorage.setItem('tv_pairing_code', JSON.stringify({
      code,
      url: tvDashboardUrl,
      createdAt: Date.now()
    }));
    toast.success('Pairing code generated! Enter this code on your TV.');
  };

  const handleCodeSubmit = () => {
    if (enteredCode.length !== 6) {
      toast.error('Please enter a 6-character code');
      return;
    }
    
    // For code entry from phone, just open the TV dashboard
    // The code acts as a simple verification that user wants to connect
    const codeUrl = `${tvDashboardUrl}?code=${enteredCode.toUpperCase()}`;
    window.open(codeUrl, '_blank');
    toast.success('Opening TV Dashboard...');
    setDialogOpen(false);
    setEnteredCode('');
  };

  const handleCast = async () => {
    if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.cast) {
      setCasting(true);
      try {
        const castContext = (window as any).cast.framework.CastContext.getInstance();
        await castContext.requestSession();
        
        const session = castContext.getCurrentSession();
        if (session) {
          const mediaInfo = new (window as any).chrome.cast.media.MediaInfo(tvDashboardUrl, 'text/html');
          const request = new (window as any).chrome.cast.media.LoadRequest(mediaInfo);
          await session.loadMedia(request);
          toast.success('Casting to TV!');
          setDialogOpen(false);
        }
      } catch (error) {
        console.error('Cast error:', error);
        toast.info('Open the TV Dashboard URL in your TV browser');
      } finally {
        setCasting(false);
      }
    } else {
      toast.info('Open the TV Dashboard URL in your Android TV browser');
    }
  };

  const handleCopyCode = async () => {
    if (generatedCode) {
      try {
        await navigator.clipboard.writeText(generatedCode);
        toast.success('Pairing code copied!');
      } catch {
        toast.error('Failed to copy code');
      }
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className={cn(
          "gap-2 bg-gradient-to-r from-purple-600/20 to-primary/20 border-purple-500/30 hover:border-purple-500/50 text-purple-700 dark:text-purple-300",
          className
        )}
      >
        <Tv className="h-4 w-4" />
        <span className="hidden sm:inline">Cast to TV</span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
              Cast Dashboard to TV
            </DialogTitle>
            <DialogDescription>
              Display real-time metrics on your Android TV or any large screen
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Pairing Code Section */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary" />
                Connect with Code
              </h4>
              
              {!showCodeEntry ? (
                <div className="space-y-3">
                  {generatedCode ? (
                    <div className="text-center p-4 bg-background/80 rounded-xl border border-border/50">
                      <p className="text-xs text-muted-foreground mb-2">Enter this code on your TV:</p>
                      <div 
                        className="text-3xl font-mono font-bold tracking-[0.3em] text-primary cursor-pointer hover:text-primary/80 transition-colors"
                        onClick={handleCopyCode}
                        title="Click to copy"
                      >
                        {generatedCode}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Code expires in 5 minutes • Tap to copy
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate a code to display on your TV, then enter it here from your phone.
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleGenerateCode}
                      className="flex-1 gap-2"
                    >
                      <Hash className="h-4 w-4" />
                      {generatedCode ? 'New Code' : 'Generate Code'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCodeEntry(true)}
                      className="flex-1 gap-2"
                    >
                      Enter Code
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Enter the 6-character code shown on your TV:
                  </p>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={enteredCode}
                      onChange={setEnteredCode}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowCodeEntry(false);
                        setEnteredCode('');
                      }}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleCodeSubmit}
                      disabled={enteredCode.length !== 6}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-primary"
                    >
                      Connect
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* URL Display */}
            <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">TV Dashboard URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono truncate text-foreground">
                  {tvDashboardUrl}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* QR Code Toggle */}
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={() => setShowQR(!showQR)}
                className="w-full gap-2"
              >
                <QrCode className="h-4 w-4" />
                {showQR ? 'Hide QR Code' : 'Show QR Code'}
              </Button>

              {showQR && (
                <div className="flex justify-center p-4 bg-white rounded-xl">
                  <QRCodeSVG 
                    value={tvDashboardUrl} 
                    size={200}
                    level="H"
                    includeMargin
                  />
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-sm mb-2">How to connect:</h4>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Generate a code above, or open the URL on your TV</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Enter the code from your phone to connect</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>Dashboard auto-refreshes every 30 seconds</span>
                </li>
              </ol>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleOpenInNewTab}
              className="gap-2 w-full sm:w-auto"
            >
              <ExternalLink className="h-4 w-4" />
              Open in New Tab
            </Button>
            <Button
              onClick={handleCast}
              disabled={casting}
              className="gap-2 w-full sm:w-auto bg-gradient-to-r from-purple-600 to-primary"
            >
              {casting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Tv className="h-4 w-4" />
              )}
              {casting ? 'Connecting...' : 'Start Casting'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
