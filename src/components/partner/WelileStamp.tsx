/**
 * Welile Technologies e-stamp rendered as HTML for the live agreement preview.
 * Mirrors the supplied stamp.html (blue border, red date, stars, address).
 */
export default function WelileStamp({
  date = new Date(),
  className = '',
  style,
}: {
  date?: Date;
  className?: string;
  style?: React.CSSProperties;
}) {
  const formatted = date
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  return (
    <div
      className={className}
      style={{
        transform: 'rotate(-3deg)',
        opacity: 0.6,
        pointerEvents: 'none',
        ...style,
      }}
      aria-hidden
    >
      <div
        style={{
          width: 200,
          border: '3px solid #1134a6',
          borderRadius: 8,
          padding: '10px 12px',
          textAlign: 'center',
          background: 'transparent',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            color: '#1134a6',
            fontFamily: "'Times New Roman', serif",
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.1,
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          WELILE TECHNOLOGIES
          <br />
          LIMITED
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
            padding: '0 4px',
          }}
        >
          <span style={{ color: '#1134a6', fontSize: 18, lineHeight: 1 }}>★</span>
          <span
            style={{
              color: '#e51921',
              fontFamily: "'Oswald', sans-serif",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            {formatted}
          </span>
          <span style={{ color: '#1134a6', fontSize: 18, lineHeight: 1 }}>★</span>
        </div>
        <div
          style={{
            color: '#1134a6',
            fontFamily: "'Nunito', sans-serif",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          PO Box 167564 Kampala Uganda
        </div>
      </div>
    </div>
  );
}