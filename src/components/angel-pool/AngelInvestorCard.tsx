import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Share2, Download, Clock } from 'lucide-react';
import { TOTAL_POOL_UGX, PRICE_PER_SHARE } from './constants';
import { MOCK_TOTAL_RAISED } from './mockData';
import { toPng } from 'html-to-image';
import { useToast } from '@/hooks/use-toast';

import { formatDynamic as formatUGX } from '@/lib/currencyFormat';

export function AngelInvestorCard() {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const amtNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const shares = Math.floor(amtNum / PRICE_PER_SHARE);
  const progress = (MOCK_TOTAL_RAISED / TOTAL_POOL_UGX) * 100;
  const today = new Date().toLocaleDateString('en-UG', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleExport = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { backgroundColor: '#0f172a', pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `welile-angel-${name.replace(/\s+/g, '-').toLowerCase() || 'card'}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: 'Card downloaded!', description: 'Share it on WhatsApp.' });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const showCard = name.trim().length > 0 && amtNum >= PRICE_PER_SHARE;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">Generate Your Share Card</p>
          <Input
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Investment amount (UGX)"
            value={amtNum > 0 ? amtNum.toLocaleString() : ''}
            onChange={(e) => setAmount(e.target.value)}
          />
        </CardContent>
      </Card>

      {showCard && (
        <>
          {/* The card to export */}
          <div
            ref={cardRef}
            className="rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
          >
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="text-center space-y-1">
                <p className="text-xs font-bold tracking-[0.3em] text-amber-400 uppercase">Welile Technologies</p>
                <p className="text-sm text-slate-400 font-medium">Early Angel Pool</p>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />

              {/* Allocation */}
              <div className="text-center space-y-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Your Allocation</p>
                <p className="text-2xl font-black text-white">{name}</p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-white/5 rounded-2xl p-3 text-center">
                    <p className="text-xl font-black text-white">{formatUGX(amtNum)}</p>
                    <p className="text-[10px] text-slate-400">Invested</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-3 text-center">
                    <p className="text-xl font-black text-amber-400">{shares}</p>
                    <p className="text-[10px] text-slate-400">Shares</p>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-slate-600/50 to-transparent" />

              {/* Pool Progress */}
              <div className="space-y-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold text-center">Pool Progress</p>
                <div className="bg-white/5 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-300 text-center">
                  {formatUGX(MOCK_TOTAL_RAISED)} raised ({progress.toFixed(1)}%)
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1 text-amber-400">
                  <Clock className="h-3 w-3" />
                  <span className="text-[10px] font-bold">Reserved for 48 hours</span>
                </div>
                <span className="text-[10px] text-slate-500">{today}</span>
              </div>

              <div className="text-center">
                <p className="text-xs font-bold text-primary">Secure your position →</p>
              </div>
            </div>
          </div>

          {/* Export button */}
          <Button onClick={handleExport} className="w-full gap-2">
            <Download className="h-4 w-4" />
            Download Card for WhatsApp
          </Button>
        </>
      )}
    </div>
  );
}
