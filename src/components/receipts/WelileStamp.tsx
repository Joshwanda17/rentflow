import { useEffect, useMemo } from 'react';

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
      }}
    >
      <div
        style={{
          width: 460,
          border: '5px solid #1134a6',
          borderRadius: 12,
          padding: '20px 25px',
          textAlign: 'center',
          backgroundColor: 'transparent',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            color: '#1134a6',
            fontFamily: "'Crimson Text', serif",
            fontWeight: 700,
            fontSize: 32,
            lineHeight: 1.1,
            letterSpacing: 1,
            marginBottom: 25,
          }}
        >
          WELILE TECHNOLOGIES<br />LIMITED
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 25,
            padding: '0 10px',
          }}
        >
          <div style={{ color: '#1134a6', fontSize: 40, lineHeight: 1 }}>★</div>
          <div
            style={{
              color: '#e51921',
              fontFamily: "'Oswald', sans-serif",
              fontSize: 48,
              fontWeight: 500,
              letterSpacing: 2,
            }}
          >
            {date}
          </div>
          <div style={{ color: '#1134a6', fontSize: 40, lineHeight: 1 }}>★</div>
        </div>

        <div
          style={{
            color: '#1134a6',
            fontFamily: "'Nunito', sans-serif",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          PO Box 167564 Kampala Uganda
        </div>
      </div>
    </div>
  );
}
