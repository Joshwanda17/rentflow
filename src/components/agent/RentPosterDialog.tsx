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

type PaperSize = 'A4' | 'Letter';

// Landscape page dimensions in millimetres.
const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  Letter: { w: 279.4, h: 215.9 },
};

const POSTER_FILENAME = 'Welile-Available-For-Rent.jpg';
const POSTER_CAPTION =
  'Available for rent on Welile! Move in and get your first week FREE. Visit welile.com';

/**
 * Shows the branded "Available for Rent" poster so agents can print it or
 * share it on WhatsApp with prospective tenants.
 */
export default function RentPosterDialog({ open, onOpenChange }: RentPosterDialogProps) {
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [paper, setPaper] = useState<PaperSize>('A4');

  const fetchPosterBlob = async () => {
    const res = await fetch(posterAsset.url);
    if (!res.ok) throw new Error('Failed to load poster');
    return res.blob();
  };

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load poster image'));
      img.src = src;
    });

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

  // Download a print-ready PDF sized to the chosen paper (A4 / Letter),
  // landscape, with the poster centred and scaled to fit.
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const img = await loadImage(posterAsset.url);
      const { jsPDF } = await import('jspdf');
      const page = PAPER_MM[paper];
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: paper.toLowerCase() as 'a4' | 'letter', compress: true });

      // Fit the image inside the page preserving aspect ratio, then centre it.
      const imgRatio = img.width / img.height;
      const pageRatio = page.w / page.h;
      let drawW = page.w;
      let drawH = page.h;
      if (imgRatio > pageRatio) {
        drawW = page.w;
        drawH = page.w / imgRatio;
      } else {
        drawH = page.h;
        drawW = page.h * imgRatio;
      }
      const x = (page.w - drawW) / 2;
      const y = (page.h - drawH) / 2;
      pdf.addImage(img, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
      pdf.save(`Welile-Available-For-Rent-${paper}.pdf`);
    } catch {
      toast.error('Could not download the poster');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Allow pop-ups to print the poster');
      return;
    }
    const pageSize = paper === 'A4' ? 'A4' : 'letter';
    w.document.write(`
      <html>
        <head>
          <title>Available for Rent</title>
          <style>
            @page { size: ${pageSize} landscape; margin: 0; }
            html, body { margin: 0; padding: 0; height: 100%; }
            body { display: flex; align-items: center; justify-content: center; }
            img { max-width: 100%; max-height: 100%; display: block; }
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

        {/* Paper size selector — applies to both Download and Print */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm text-muted-foreground">Paper size:</span>
          {(['A4', 'Letter'] as PaperSize[]).map((size) => (
            <Button
              key={size}
              type="button"
              size="sm"
              variant={paper === size ? 'default' : 'outline'}
              onClick={() => setPaper(size)}
              className="h-8 px-4 touch-manipulation select-none"
            >
              {size}
            </Button>
          ))}
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
            disabled={downloading}
            className="h-11 gap-2 touch-manipulation select-none"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download {paper} PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePrint}
            className="h-11 gap-2 touch-manipulation select-none"
          >
            <Printer className="h-4 w-4" /> Print {paper}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}