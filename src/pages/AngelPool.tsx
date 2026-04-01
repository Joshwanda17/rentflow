import { useState, useRef } from 'react';
import { ArrowLeft, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AngelHeroCard } from '@/components/angel-pool/AngelHeroCard';
import { AngelCalculator } from '@/components/angel-pool/AngelCalculator';
import { AngelPoolDashboard } from '@/components/angel-pool/AngelPoolDashboard';
import { AngelActivityFeed } from '@/components/angel-pool/AngelActivityFeed';
import { AngelInvestorCard } from '@/components/angel-pool/AngelInvestorCard';

export default function AngelPool() {
  const navigate = useNavigate();
  const poolRef = useRef<HTMLDivElement>(null);
  const calcRef = useRef<HTMLDivElement>(null);

  const scrollToPool = () => poolRef.current?.scrollIntoView({ behavior: 'smooth' });
  const scrollToCalc = () => calcRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/60 px-3 py-2.5 flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-base">Angel Pool</h1>
        </div>
        <span className="ml-auto text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">TEST</span>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-28 md:pb-4 overscroll-contain">
        <main className="px-3 xs:px-4 py-4 xs:py-5 space-y-5 max-w-lg mx-auto pb-8">

          {/* Hero */}
          <AngelHeroCard onInvest={scrollToCalc} onViewPool={scrollToPool} />

          {/* Calculator */}
          <div ref={calcRef}>
            <AngelCalculator />
          </div>

          {/* Pool Dashboard */}
          <div ref={poolRef}>
            <AngelPoolDashboard />
          </div>

          {/* Live Activity Feed */}
          <AngelActivityFeed />

          {/* Share Card Generator */}
          <AngelInvestorCard />
        </main>
      </div>
    </div>
  );
}
