import { forwardRef } from 'react';
import { formatUGX } from '@/lib/rentCalculations';

interface ShareCardProps {
  agentName: string;
  paidToday: number;
  expectedDaily: number;
  paidYesterday: number;
  perTenantMax: number;
  headroom: number;
  remainingSlots: number;
  canPost: boolean;
  dateLabel: string;
}

/**
 * Off-screen branded card captured to a PNG for WhatsApp sharing.
 * Uses inline styles + absolute hex colors so html-to-image renders it
 * reliably regardless of the live theme / CSS variables.
 */
export const AgentCapacityShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  (props, ref) => {
    const {
      agentName, paidToday, expectedDaily, paidYesterday,
      perTenantMax, headroom, remainingSlots, canPost, dateLabel,
    } = props;

    const pct = expectedDaily > 0
      ? Math.min(100, Math.round((paidToday / expectedDaily) * 100))
      : 0;
    const remainingUGX = Math.max(0, expectedDaily - paidToday);
    const diff = paidToday - paidYesterday;
    const barColor = pct >= 50 ? '#10b981' : pct >= 20 ? '#f59e0b' : '#ef4444';

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: 540,
          padding: 32,
          fontFamily: 'Inter, system-ui, sans-serif',
          background: 'linear-gradient(160deg, #0f3d2e 0%, #0a2a20 60%, #07201a 100%)',
          color: '#ffffff',
          boxSizing: 'border-box',
        }}
      >
        {/* Header with logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <img
            src="/welile-logo.png"
            alt="Welile"
            crossOrigin="anonymous"
            style={{ height: 40, width: 'auto', objectFit: 'contain' }}
          />
          <span style={{ fontSize: 13, color: '#9fbe0c'.replace('#9fbe0c', '#cfeee0'), fontWeight: 600 }}>{dateLabel}</span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#7dd3b0' }}>
          Today&apos;s Rent-Request Capacity
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, marginBottom: 20 }}>{agentName}</div>

        {/* Collected today vs target */}
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9fd8c2' }}>
            Collected today vs target
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>
            {formatUGX(paidToday)}
            <span style={{ fontSize: 16, fontWeight: 600, color: '#9fd8c2' }}> / {formatUGX(expectedDaily)}</span>
          </div>
          <div style={{ height: 12, borderRadius: 999, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 12 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 13, color: '#cfeee0', marginTop: 8 }}>
            {pct}% of today&apos;s target{remainingUGX > 0 ? ` · ${formatUGX(remainingUGX)} still to go` : ''}
          </div>
        </div>

        {/* Two stat tiles */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9fd8c2' }}>Vs yesterday</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{formatUGX(paidYesterday)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: diff >= 0 ? '#6ee7b7' : '#fca5a5' }}>
              {diff > 0 ? `+${formatUGX(diff)}` : diff < 0 ? `-${formatUGX(Math.abs(diff))}` : 'Same'} today
            </div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9fd8c2' }}>Remaining slots</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{remainingSlots}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: '#cfeee0' }}>
              {canPost ? `${formatUGX(headroom)} headroom` : 'Locked'}
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div style={{
          borderRadius: 14,
          padding: '14px 18px',
          fontSize: 14,
          fontWeight: 700,
          background: canPost ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)',
          color: canPost ? '#6ee7b7' : '#fca5a5',
        }}>
          {canPost
            ? `✓ Can allocate today · up to ${formatUGX(perTenantMax)} per tenant`
            : '✗ Locked — reach your daily target to unlock allocations'}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#7dd3b0', marginTop: 20, letterSpacing: 0.5 }}>
          Powered by Welile · welilereceipts.com
        </div>
      </div>
    );
  },
);

AgentCapacityShareCard.displayName = 'AgentCapacityShareCard';

export default AgentCapacityShareCard;