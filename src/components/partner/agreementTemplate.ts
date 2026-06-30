import { numberToWords } from '@/lib/numberToWords';
import welileLogo from '@/assets/welile-contract-logo.png';
// Single source of truth: the exact partner contract template (kept in src, never
// in public/). Both the on-screen preview AND the stored/emailed PDF are produced
// from the SAME filled HTML so they render pixel-identically.
import RAW_TEMPLATE from './partnerAgreementTemplate.html?raw';

export interface AgreementFillData {
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

function ordinal(day: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  return day + (s[(v - 20) % 10] || s[v] || s[0]);
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Dynamic e-stamp (rotated, blue double border + red stacked date) injected as
// inline HTML so html2canvas captures it identically to the on-screen preview.
function stampHtml(date: Date, opts: { top: number; right: number; rotation?: number; opacity?: number }): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();
  const rot = opts.rotation ?? -37;
  const op = opts.opacity ?? 0.6;
  return `
  <div style="position:absolute; top:${opts.top}px; right:${opts.right}px; transform:rotate(${rot}deg); opacity:${op}; pointer-events:none; z-index:5;">
    <div style="width:170px; height:96px; border:2.5px solid #1134a6; border-radius:10px; padding:4px; box-sizing:border-box;">
      <div style="width:100%; height:100%; border:1px solid #1134a6; border-radius:7px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:4px 6px;">
        <div style="color:#1134a6; font-family:'Times New Roman',serif; font-weight:700; font-size:13px; line-height:1.05; letter-spacing:0.5px;">WELILE<br>TECHNOLOGIES</div>
        <div style="color:#e51921; font-family:'Times New Roman',serif; font-weight:700; font-size:15px; line-height:1; letter-spacing:1px; margin:3px 0;">${day} ${month}<br>${year}</div>
        <div style="color:#1134a6; font-family:'Times New Roman',serif; font-size:8.5px; font-weight:700; line-height:1.1;">PO Box 167564<br>Kampala Uganda</div>
      </div>
    </div>
  </div>`;
}

/**
 * Fill the contract template with partner + Welile counter-signature details.
 * Returns a complete standalone HTML document string.
 */
export function buildAgreementHtml(data: AgreementFillData): string {
  const date = data.agreementDate ?? new Date();
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'long' });

  const name = esc(data.partnerName?.trim() || '');
  const amountNum = Math.max(0, Math.floor(data.partnershipAmount || 0));
  const amountStr = amountNum.toLocaleString('en-US');
  const amountWords = `${numberToWords(amountNum)} Shillings`;

  const isBank = data.payoutMode !== 'momo';
  const bankName = isBank
    ? esc(data.bankName?.trim() || '')
    : esc(`${data.momoProvider?.trim() || 'Mobile Money'} (Mobile Money)`);
  const accName = isBank ? esc(data.bankAccountName?.trim() || '') : esc(data.momoName?.trim() || '');
  const accNo = isBank ? esc(data.bankAccountNumber?.trim() || '') : esc(data.momoNumber?.trim() || '');

  // Signature renderers: image when supplied, otherwise blank (Welile) or an
  // italic typed name (partner) — mirroring the prior behaviour.
  const welileSig = data.welileSignatureDataUrl
    ? `<img src="${data.welileSignatureDataUrl}" alt="Signature" style="max-height:40px; max-width:180px; object-fit:contain;" />`
    : '';
  const partnerSig = data.partnerSignatureDataUrl
    ? `<img src="${data.partnerSignatureDataUrl}" alt="Signature" style="max-height:40px; max-width:180px; object-fit:contain;" />`
    : (name ? `<span style="font-style:italic; font-weight:400;">${name.toLowerCase()}</span>` : '');

  const tokens: Record<string, string> = {
    LogoUrl: welileLogo,
    PartnerName: name,
    PartnerID: esc(data.partnerId?.trim() || ''),
    PartnerAddress: esc(data.partnerAddress?.trim() || ''),
    PartnerPhone: esc(data.partnerPhone?.trim() || ''),
    PartnerEmail: esc(data.partnerEmail?.trim() || ''),
    PartnershipAmount: esc(amountStr),
    PartnershipAmountWords: esc(amountWords),
    AgreementDay: esc(ordinal(day)),
    AgreementMonth: esc(month),
    WelileRepName: esc(data.welileRepName?.trim() || ''),
    WelileRepPosition: esc(data.welileRepPosition?.trim() || ''),
    WelileRepContact: esc(data.welileRepContact?.trim() || ''),
    WelileSignature: welileSig,
    PartnerSignature: partnerSig,
    BankName: bankName,
    BankAccountName: accName,
    BankAccountNumber: accNo,
    KinName: esc(data.kinName?.trim() || ''),
    KinContact: esc(data.kinContact?.trim() || ''),
    KinSignature: '',
    StampOverlay: stampHtml(date, { top: -10, right: 0, rotation: -37, opacity: 0.55 }),
    CoverStamp: stampHtml(date, { top: 0, right: 10, rotation: -37, opacity: 0.5 }),
  };

  let html = RAW_TEMPLATE;
  for (const [key, value] of Object.entries(tokens)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}
