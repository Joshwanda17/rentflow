/**
 * Welile Technologies e-stamp rendered as HTML for the live agreement preview.
 * Matches the physical contract stamp: blue rounded rectangle border, blue
 * "WELILE TECHNOLOGIES" wordmark, red stacked date, blue PO Box line — and
 * rotated like a hand-applied rubber stamp.
 */
export default function WelileStamp({
  date = new Date(),
  className = '',
  style,
  rotation = -37,
}: {
  date?: Date;
  className?: string;
  style?: React.CSSProperties;
  rotation?: number;
}) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();

  return (
    <div
      className={className}
      style={{
        transform: `rotate(${rotation}deg)`,
        opacity: 0.6,
        pointerEvents: 'none',
        ...style,
      }}
      aria-hidden
    >
      <div
        style={{
          width: 170,
          height: 96,
          border: '2.5px solid #1134a6',
          borderRadius: 10,
          padding: 4,
          boxSizing: 'border-box',
          background: 'transparent',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid #1134a6',
            borderRadius: 7,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '4px 6px',
          }}
        >
          <div
            style={{
              color: '#1134a6',
              fontFamily: "'Times New Roman', serif",
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.05,
              letterSpacing: 0.5,
            }}
          >
            WELILE
            <br />
            TECHNOLOGIES
          </div>
          <div
            style={{
              color: '#e51921',
              fontFamily: "'Oswald', 'Times New Roman', serif",
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1.0,
              letterSpacing: 1,
              margin: '3px 0',
            }}
          >
            {day} {month}
            <br />
            {year}
          </div>
          <div
            style={{
              color: '#1134a6',
              fontFamily: "'Times New Roman', serif",
              fontSize: 8.5,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            PO Box 167564
            <br />
            Kampala Uganda
          </div>
        </div>
      </div>
    </div>
  );
}
