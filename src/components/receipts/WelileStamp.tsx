import { useEffect, useMemo } from 'react';
import stampAsset from '@/assets/welile-official-stamp.png.asset.json';

/** Today's date in the exact physical-stamp format, e.g. "15 JUN 2026". */
export function stampDate(): string {
  const today = new Date();
  return today
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
}

let fontsInjected = false;
/** Lazily load the stamp fonts once, only when a receipt with a stamp renders. */
function useStampFonts() {
  useEffect(() => {
    if (fontsInjected || typeof document === 'undefined') return;
    fontsInjected = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Crimson+Text:wght@700&family=Oswald:wght@500&family=Nunito:wght@700&display=swap';
    document.head.appendChild(link);
  }, []);
}

/**
 * Welile Technologies official e-stamp — an authenticity mark rendered on every
 * payout receipt. Reproduces the physical rubber stamp (blue border, serif
 * company name, red current date flanked by stars, PO Box address) with the
 * date generated dynamically for the day the receipt is viewed. Used both as a
 * faint diagonal watermark across the receipt and can be shown at full strength.
 */
export function WelileStamp({
  scale = 1,
  watermark = false,
  className = '',
}: {
  scale?: number;
  watermark?: boolean;
  className?: string;
}) {
  useStampFonts();
  const date = useMemo(() => stampDate(), []);

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        transform: `rotate(-2deg) scale(${scale})`,
        transformOrigin: 'center',
        opacity: watermark ? 0.16 : 0.85,
        pointerEvents: 'none',
        userSelect: 'none',
        position: 'relative',
        width: 460,
      }}
    >
      {/* Official Welile Technologies Limited company stamp artwork */}
      <img
        src={stampAsset.url}
        alt=""
        style={{ width: '100%', height: 'auto', display: 'block' }}
        draggable={false}
      />
      {/* Dynamic date overlay — covers the baked "21 JUL 2026" with today's date
          so the same official stamp stays authentic on every day. */}
      <div
        style={{
          position: 'absolute',
          top: '46%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#ffffff',
          padding: '2px 14px',
          color: '#e51921',
          fontFamily: "'Oswald', sans-serif",
          fontSize: 44,
          fontWeight: 500,
          letterSpacing: 2,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {date}
      </div>
    </div>
  );
}
