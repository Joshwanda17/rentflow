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

// Dynamic e-stamp matching the physical Welile Technologies stamp: a single
// solid blue rounded rectangle with the company name, a star–date–star row
// (red date) and the postal address. Injected as inline HTML so html2canvas
// captures it identically to the on-screen preview. `pos` is the absolute
// position CSS (e.g. `top:0; right:48px;`) and `scale` shrinks the whole stamp.
function stampHtml(date: Date, pos: string, scale = 1): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();
  return `
  <div style="position:absolute; ${pos} transform:rotate(-2deg) scale(${scale}); transform-origin:top right; opacity:0.85; pointer-events:none; z-index:5;">
    <div style="width:320px; border:5px solid #1134a6; border-radius:12px; padding:16px 22px; text-align:center; background:transparent; box-sizing:border-box;">
      <div style="color:#1134a6; font-family:'Crimson Text','Times New Roman',serif; font-weight:700; font-size:23px; line-height:1.1; letter-spacing:1px; margin-bottom:14px;">WELILE TECHNOLOGIES<br>LIMITED</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:0 8px;">
        <span style="color:#1134a6; font-size:30px; line-height:1;">&#9733;</span>
        <span style="color:#e51921; font-family:'Oswald','Arial Narrow',Arial,sans-serif; font-size:32px; font-weight:600; letter-spacing:2px;">${day} ${month} ${year}</span>
        <span style="color:#1134a6; font-size:30px; line-height:1;">&#9733;</span>
      </div>
      <div style="color:#1134a6; font-family:'Nunito','Trebuchet MS',sans-serif; font-size:16px; font-weight:700; letter-spacing:0.5px;">PO Box 167564 Kampala Uganda</div>
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
    // Stamp appears on every page; kept inside the content with comfortable
    // margins so the rotation never clips against the page edge.
    CoverStamp: stampHtml(date, 'top:10px; right:40px;', 1),
    StampOverlay: stampHtml(date, 'top:0; right:48px;', 0.85),
    StampPage: stampHtml(date, 'bottom:24px; right:48px;', 0.7),
  };

  let html = RAW_TEMPLATE;
  for (const [key, value] of Object.entries(tokens)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}
