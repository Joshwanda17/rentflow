import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, CheckCircle, Search, Shield, TrendingUp, Users, Calendar, Loader2, AlertTriangle, Fingerprint, Banknote, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useMyAiSummary, useAiIdLookup } from '@/hooks/useAiIdLookup';
import { isValidAiId, getRiskTierLabel, type AiIdSummary } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';

function SummaryDisplay({ summary, isOwn }: { summary: AiIdSummary; isOwn: boolean }) {
  const riskTier = getRiskTierLabel(summary.risk_level);
  const memberSince = new Date(summary.member_since).toLocaleDateString('en-UG', { month: 'short', year: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* AI ID Badge */}
      <div className="text-center py-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
          <Fingerprint className="h-5 w-5 text-primary" />
          <span className="font-mono font-bold text-lg text-primary">{summary.ai_id}</span>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Banknote className="h-4 w-4" />}
          label="Rent Facilitated"
          value={formatUGX(summary.total_rent_facilitated)}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="On-time Rate"
          value={`${summary.on_time_payment_rate}%`}
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Trust Tier"
          value={riskTier.label}
          valueClass={riskTier.color}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Referrals"
          value={String(summary.referral_count)}
        />
      </div>

      {/* Borrowing Capacity */}
      {summary.estimated_borrowing_limit > 0 && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-muted-foreground mb-1">Estimated Borrowing Range</p>
          <p className="font-bold text-emerald-600">Up to {formatUGX(summary.estimated_borrowing_limit)}</p>
        </div>
      )}

      {/* Member Since */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <Calendar className="h-3 w-3" />
        Member since {memberSince}
      </div>

      {/* Disclaimer */}
      <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
        <div className="flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            This is an informational summary only. It does not constitute a credit report, 
            approval for any financial product, or financial advice. All data is derived from 
            platform activity and refreshed periodically.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="p-3 rounded-xl bg-card border border-border/60 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <p className={`font-bold text-sm ${valueClass || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

interface Props {
  onLendClick?: (aiId: string, borrowingLimit: number) => void;
}

export default function WelileAiIdCard({ onLendClick }: Props) {
  const { summary: mySummary, loading: myLoading } = useMyAiSummary();
  const { result: lookupResult, loading: lookupLoading, error: lookupError, lookup } = useAiIdLookup();
  const [searchId, setSearchId] = useState('');
  const [mode, setMode] = useState<'own' | 'lookup'>('own');

  const copyAiId = () => {
    if (mySummary?.ai_id) {
      navigator.clipboard.writeText(mySummary.ai_id);
      toast.success('AI ID copied!');
    }
  };

  const shareOnWhatsApp = () => {
    if (!mySummary?.ai_id) return;
    const message = `🔐 My Welile AI ID: *${mySummary.ai_id}*\n\nUse this ID to verify my credit profile on Welile. Open your Welile Supporter Dashboard → Look Up AI ID → Enter my ID to see my trust score and facilitate credit.\n\n✅ 100% Capital Protected by Welile AI Insurance\n📱 Download Welile: https://welilereceipts.com`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleLookup = () => {
    if (!isValidAiId(searchId)) {
      toast.error('Enter a valid Welile AI ID (e.g. WEL-A3F8K2)');
      return;
    }
    lookup(searchId);
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'own' ? 'default' : 'outline'}
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => setMode('own')}
        >
          <Fingerprint className="h-4 w-4" />
          My AI ID
        </Button>
        <Button
          variant={mode === 'lookup' ? 'default' : 'outline'}
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => setMode('lookup')}
        >
          <Search className="h-4 w-4" />
          Look Up
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'own' ? (
          <motion.div key="own" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {myLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : mySummary ? (
              <div className="space-y-3">
                <SummaryDisplay summary={mySummary} isOwn />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={copyAiId}>
                    <Copy className="h-4 w-4" />
                    Copy ID
                  </Button>
                  <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={shareOnWhatsApp}>
                    <Share2 className="h-4 w-4" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : (
          <motion.div key="lookup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={searchId}
                onChange={(e) => setSearchId(e.target.value.toUpperCase())}
                placeholder="WEL-XXXXXX"
                className="font-mono"
                maxLength={10}
              />
              <Button onClick={handleLookup} disabled={lookupLoading} size="icon" className="shrink-0">
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {lookupError && (
              <p className="text-sm text-destructive text-center py-2">{lookupError}</p>
            )}

            {lookupResult && (
              <div className="space-y-3">
                <SummaryDisplay summary={lookupResult} isOwn={false} />
                {lookupResult.estimated_borrowing_limit > 0 && onLendClick && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Shield className="h-4 w-4 text-emerald-600 shrink-0" />
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                        <span className="font-bold">Welile AI Insurance</span> — 100% capital protected
                      </p>
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={() => onLendClick(lookupResult.ai_id, lookupResult.estimated_borrowing_limit)}
                    >
                      <Banknote className="h-4 w-4" />
                      Facilitate via Wallet
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
