import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Megaphone, Share2, Download, Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { shareImageViaWhatsApp } from '@/lib/whatsappShare';
import posterAsset from '@/assets/available-for-rent-poster.jpg.asset.json';

interface RentPosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POSTER_FILENAME = 'Welile-Available-For-Rent.jpg';
const POSTER_CAPTION =
  'Available for rent on Welile! Move in and get your first week FREE. Visit welile.com';

/**
 * Shows the branded "Available for Rent" poster so agents can print it or
 * share it on WhatsApp with prospective tenants.
 */
export default function RentPosterDialog({ open, onOpenChange }: RentPosterDialogProps) {
  const [sharing, setSharing] = useState(false);

  const fetchPosterBlob = async () => {
    const res = await fetch(posterAsset.url);
    if (!res.ok) throw new Error('Failed to load poster');
    return res.blob();
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob = await fetchPosterBlob();
      const result = await shareImageViaWhatsApp(blob, {
        filename: POSTER_FILENAME,
        caption: POSTER_CAPTION,
      });
      if (result === 'deeplink') {
        toast.success('Poster downloaded — attach it in WhatsApp');
      }
    } catch {
      toast.error('Could not share the poster', { description: 'Please try again in a moment.' });
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await fetchPosterBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = POSTER_FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      toast.error('Could not download the poster');
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Allow pop-ups to print the poster');
      return;
    }
    w.document.write(`
      <html>
        <head>
          <title>Available for Rent</title>
          <style>
            @page { size: landscape; margin: 0; }
            html, body { margin: 0; padding: 0; }
            img { width: 100%; height: auto; display: block; }
          </style>
        </head>
        <body>
          <img src="${posterAsset.url}" onload="window.focus();window.print();" />
        </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Available for Rent poster
          </DialogTitle>
          <DialogDescription>
            Print this poster or share it on WhatsApp to advertise an available property.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 rounded-lg border bg-muted/30 overflow-auto">
          <img
            src={posterAsset.url}
            alt="Welile — Available for Rent poster"
            className="w-full h-auto"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="flex-1 h-11 gap-2 touch-manipulation select-none"
          >
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {sharing ? 'Sharing…' : 'Share on WhatsApp'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
            className="h-11 gap-2 touch-manipulation select-none"
          >
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePrint}
            className="h-11 gap-2 touch-manipulation select-none"
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}