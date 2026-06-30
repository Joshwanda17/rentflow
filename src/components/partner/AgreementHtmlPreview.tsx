import { numberToWords } from '@/lib/numberToWords';
import WelileStamp from './WelileStamp';
import welileLogo from '@/assets/welile-contract-logo.png';

export interface AgreementPreviewData {
  partnerName: string;
  partnerId?: string;
  partnerAddress?: string;
  partnerPhone?: string;
  partnerEmail?: string;
  partnershipAmount: number;
  payoutMode?: 'bank' | 'momo';
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  momoProvider?: string;
  momoNumber?: string;
  momoName?: string;
  kinName?: string;
  kinContact?: string;
  agreementDate?: Date;
  welileRepName?: string;
  welileRepPosition?: string;
  welileRepContact?: string;
  welileSignatureDataUrl?: string;
  partnerSignatureDataUrl?: string;
}

const INK = '#0F172A';
const UNKNOWN = '{xx}';

function ordinal(day: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return day + (s[(v - 20) % 10] || s[v] || s[0]);
}

const SECTIONS: { title: string; paras?: string[]; bullets?: string[] }[] = [
  {
    title: '1. Platform Overview and Nature of Business',
    paras: [
      'The Company operates a digital platform that connects tenants seeking rent with individuals willing to support them in exchange for returns.',
      'The Company is not a deposit-taking institution or an insurance company. It is a technology platform that manages and facilitates all transactions between the Parties.',
    ],
  },
  {
    title: "2. Partner's Role",
    paras: [
      'The Partner will receive access to periodic reports or a dashboard to monitor the performance of their contribution.',
      'The Partner agrees to comply with all platform terms, policies, and partner guidelines.',
    ],
  },
  {
    title: "3. Company's Responsibilities and Assurances",
    paras: ['The Company commits to:'],
    bullets: [
      'Conduct full due diligence on all tenants and landlords.',
      'Facilitate and manage all rent payment transactions.',
      'Guarantee the repayment of the full principal amount and expected returns.',
      'Absorb any losses, delays, or defaults from tenants.',
      'Provide a detailed Individual financial report to the Partner upon request.',
    ],
  },
  {
    title: '4. Returns and Payouts',
    bullets: [
      'The Partner will earn a monthly return of 15% on the principal partnership amount.',
      "The monthly returns will be paid to the Partner's provided bank account or mobile money details at the end of each month.",
      "The Partner's earnings are not available for early withdrawal and can only be accessed on the agreed payout date.",
    ],
  },
  {
    title: '5. Withdrawal of Principal',
    bullets: [
      'This agreement is in force for a period of one (1) year. A notice for renewal shall be given three (3) months before the expiration of this agreement by either Party.',
      'To withdraw the principal amount, the Partner must notify the Company in writing at least ninety (90) days prior to the intended withdrawal date.',
      'Upon receipt of a withdrawal request, the Company shall have a principal recovery period of ninety (90) days. During this period, no monthly interest shall accrue or be payable to the Partner, as the funds will no longer be in active use.',
    ],
  },
  {
    title: '6. Risk and Liability',
    bullets: [
      'The Company bears full liability for tenant defaults, delays, or losses.',
      "The Partner's principal and expected returns are fully guaranteed by the Company.",
      'The Company shall promptly communicate any payout delays caused by external factors and ensures all such issues are resolved within two to three business days.',
    ],
  },
  {
    title: '7. Default and Termination',
    bullets: [
      'Default: If a Party fails to make a payment or comply with the terms of this agreement, the other Party reserves the right to take legal action for breach of contract. Both Parties have a right to settle any default within a period of two weeks (14) days before the other Party takes action.',
      'Termination: This Agreement may be terminated by the Partner with a ninety (90)-day written withdrawal notice, or by the Company in case of any breach, fraud, or misuse.',
    ],
  },
  {
    title: '8. Dispute Resolution',
    bullets: [
      'The Parties shall resolve the matter through arbitration in accordance with the laws of Uganda. In cases where the Parties have failed to agree under arbitration, the matter can be referred to the courts of Uganda with competent jurisdiction.',
    ],
  },
  {
    title: '9. Entire Agreement',
    bullets: [
      'This document contains the full agreement between the Parties. There are no agreements collateral hereto, and no oral promises override this agreement.',
    ],
  },
  { title: '10. Amendments', bullets: ['All amendments to this agreement shall be in writing and all Parties must sign.'] },
  { title: '11. Legal Fees', bullets: ['The legal fees for preparing this agreement shall be borne by the Company.'] },
];

function SignatureLine({
  label,
  value,
  italic,
  image,
  blank,
}: {
  label: string;
  value?: string;
  italic?: boolean;
  image?: string;
  blank?: boolean;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: INK, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ minHeight: image ? 34 : 18, display: 'flex', alignItems: 'flex-end' }}>
        {image ? (
          <img src={image} alt={label} style={{ maxHeight: 32, maxWidth: 160, objectFit: 'contain' }} />
        ) : blank ? null : (
          <span style={{ fontSize: 12, color: INK, fontWeight: italic ? 400 : 600, fontStyle: italic ? 'italic' : 'normal' }}>
            {value}
          </span>
        )}
      </div>
      <div style={{ borderBottom: `1px solid #cbd5e1` }} />
    </div>
  );
}

export default function AgreementHtmlPreview({ data }: { data: AgreementPreviewData }) {
  const date = data.agreementDate ?? new Date();
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'long' });
  const year = date.getFullYear();

  const name = data.partnerName?.trim() || UNKNOWN;
  const partnerId = data.partnerId?.trim() || UNKNOWN;
  const address = data.partnerAddress?.trim() || UNKNOWN;
  const amountNum = Math.max(0, Math.floor(data.partnershipAmount || 0));
  const amountStr = amountNum.toLocaleString('en-US');
  const amountWords = numberToWords(amountNum);

  const isBank = data.payoutMode !== 'momo';
  const accName = isBank ? data.bankAccountName?.trim() || UNKNOWN : data.momoName?.trim() || UNKNOWN;
  const accNo = isBank ? data.bankAccountNumber?.trim() || UNKNOWN : data.momoNumber?.trim() || UNKNOWN;
  const bankLabel = isBank
    ? data.bankName?.trim() || UNKNOWN
    : `${data.momoProvider?.trim() || 'Mobile Money'} (Mobile Money)`;

  const repSigned = !!(data.welileRepName || data.welileRepPosition || data.welileRepContact || data.welileSignatureDataUrl);
  const dateStr = `${ordinal(day)} ${month} ${year}`;

  const base: React.CSSProperties = {
    color: INK,
    fontFamily: "'Times New Roman', Georgia, serif",
    fontSize: 12.5,
    lineHeight: 1.55,
  };

  return (
    <div style={{ position: 'relative', background: '#ffffff', padding: '28px 30px', ...base }}>
      {/* Stamp overlay — sits beside the opening paragraph like the printed contract */}
      <div style={{ position: 'absolute', top: 250, right: 18, zIndex: 5 }}>
        <WelileStamp date={date} />
      </div>
      <div style={{ position: 'absolute', bottom: 150, right: 24, zIndex: 5 }}>
        <WelileStamp date={date} />
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <img src={welileLogo} alt="Welile" style={{ height: 44, objectFit: 'contain', margin: '0 auto 10px' }} />
        <div style={{ fontWeight: 700, fontSize: 12 }}>THE REPUBLIC OF UGANDA</div>
        <div style={{ fontSize: 11 }}>THE CONTRACTS ACT</div>
        <div style={{ fontWeight: 700, fontSize: 20, color: INK, marginTop: 10 }}>
          TENANT PARTNERSHIP AGREEMENT
        </div>
        <div style={{ fontSize: 12, marginTop: 8 }}>
          Between <strong>WELILE TECHNOLOGIES LIMITED</strong> and{' '}
          <strong style={{ color: INK }}>{name.toUpperCase()}</strong>
        </div>
      </div>

      <p>
        THIS AGREEMENT is made this <strong>{ordinal(day)} day of {month}, {year}</strong> BETWEEN Welile Technologies
        Limited, a limited liability company incorporated in Uganda, with its Head Quarters office in Hosanna Estate, Palm
        Road, Kabale–Entebbe, P.O. Box 167564, Kampala – Uganda Tel: 0793750331, 0748747134 (hereinafter referred to as
        "the Company") of the one part;
      </p>
      <p>
        AND <strong>{name}</strong>, holder of National ID/Passport No. <strong>{partnerId}</strong>, residing at{' '}
        <strong>{address}</strong> (hereinafter referred to as "the Partner") of the other part. The Company and the
        Partner shall individually be referred to as "the Party" and collectively as "the Parties."
      </p>

      <h4 style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>Background</h4>
      <p>
        WHEREAS, the Company operates as a technology platform that facilitates rent access for tenants by connecting them
        with Tenant Partners, who provide the funds for rent payments in exchange for a return on their contribution;
      </p>

      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px', margin: '12px 0' }}>
        <strong>The Partner agrees to contribute a total partnership amount of UGX {amountStr} ({amountWords} Shillings Only).</strong>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.title}>
          <h4 style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>{s.title}</h4>
          {s.paras?.map((p, i) => (
            <p key={i} style={{ margin: '0 0 6px' }}>{p}</p>
          ))}
          {s.bullets && (
            <ul style={{ margin: '0 0 6px', paddingLeft: 18 }}>
              {s.bullets.map((b, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <p style={{ fontWeight: 700, marginTop: 12 }}>
        IN WITNESS WHEREOF, the Parties have executed these presents the day and year first above written.
      </p>

      {/* Payment channels table */}
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>12. Approved Company Payment Channels</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, margin: '6px 0 14px' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['CHANNEL', 'INSTRUCTION', 'DETAILS'].map((h) => (
              <th key={h} style={{ border: '1px solid #cbd5e1', padding: '5px 7px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['Airtel Money', 'Dial *185*9#', 'Merchant ID: 4380664'],
            ['MTN MoMo', 'Use MoMo App or dial *165*3#', 'MoMo Code: 090777'],
            ['Bank Transfer', 'Equity Bank', 'Account Name: Welile Technologies Limited\nAccount Number: 1046203375259\nSWIFT Code: EQBLUGKA'],
          ].map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} style={{ border: '1px solid #cbd5e1', padding: '5px 7px', whiteSpace: 'pre-line', verticalAlign: 'top' }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Execution */}
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: '18px 0 8px' }}>EXECUTION</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontWeight: 700, color: INK, marginBottom: 8 }}>
            Signed for and on behalf of Welile Technologies Limited
          </div>
          <SignatureLine label="Name" value={data.welileRepName} blank={!data.welileRepName} />
          <SignatureLine label="Position" value={data.welileRepPosition} blank={!data.welileRepPosition} />
          <SignatureLine label="Contact" value={data.welileRepContact} blank={!data.welileRepContact} />
          <SignatureLine label="Date" value={dateStr} blank={!repSigned} />
          <SignatureLine label="Signature" image={data.welileSignatureDataUrl} blank={!data.welileSignatureDataUrl} />
        </div>
        <div>
          <div style={{ fontWeight: 700, color: INK, marginBottom: 8 }}>Signed by the said Tenant Partner</div>
          <SignatureLine label="Name" value={name} />
          <SignatureLine label="National ID / Passport No." value={partnerId} />
          <SignatureLine label="Residence" value={address} />
          <SignatureLine label="Contact (Telephone)" value={data.partnerPhone?.trim() || UNKNOWN} />
          <SignatureLine label="Email" value={data.partnerEmail?.trim() || UNKNOWN} />
          <SignatureLine label={isBank ? 'Bank Name' : 'Mobile Money Provider'} value={bankLabel} />
          <SignatureLine label="Account Name" value={accName} />
          <SignatureLine label="Account No" value={accNo} />
          <SignatureLine label="Date" value={dateStr} />
          {data.partnerSignatureDataUrl ? (
            <SignatureLine label="Signature" image={data.partnerSignatureDataUrl} />
          ) : (
            <SignatureLine label="Signature" value={name.toLowerCase()} italic />
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 700, color: INK, marginBottom: 8 }}>Next of Kin Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <SignatureLine label="Next of Kin Name" value={data.kinName?.trim() || UNKNOWN} />
          <SignatureLine label="Contact" value={data.kinContact?.trim() || UNKNOWN} />
        </div>
      </div>
    </div>
  );
}