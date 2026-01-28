import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Tv, ExternalLink, Copy, Check, QrCode, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { QRCodeSVG } from 'qrcode.react';

interface ChromecastButtonProps {
  className?: string;
}

export function ChromecastButton({ className }: ChromecastButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [casting, setCasting] = useState(false);

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

  const handleCast = async () => {
    // Check if Chrome Cast API is available
    if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.cast) {
      setCasting(true);
      try {
        // Initialize Cast API
        const castContext = (window as any).cast.framework.CastContext.getInstance();
        await castContext.requestSession();
        
        // Cast the URL
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
        // Fall back to showing instructions
        toast.info('Open the TV Dashboard URL in your TV browser');
      } finally {
        setCasting(false);
      }
    } else {
      // Show manual instructions if Cast API not available
      toast.info('Open the TV Dashboard URL in your Android TV browser');
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
              <h4 className="font-semibold text-sm mb-2">How to display on TV:</h4>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Open the browser on your Android TV</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Enter the URL above or scan the QR code</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>The dashboard auto-refreshes every 30 seconds</span>
                </li>
              </ol>
            </div>

            {/* Alternative: Screen Mirroring */}
            <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
              <p className="text-xs text-muted-foreground">
                <strong>Tip:</strong> You can also use your phone's screen mirroring/casting feature to mirror this dashboard to your TV.
              </p>
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
