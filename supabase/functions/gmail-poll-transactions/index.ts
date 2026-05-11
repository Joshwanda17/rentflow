import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';

// Match anything that smells like a transaction confirmation.
// Tweak this query in the future without touching code by editing here.
const GMAIL_QUERY = '(UGX OR USh OR UShs OR Shs OR MoMo OR "TID" OR "transaction" OR "Mobile Money" OR "Airtel Money" OR "MTN" OR subject:"SMS from" OR subject:"SMS Forwarder" OR from:smsforwarder OR "Forwarded SMS") newer_than:7d';

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function extractPlainBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return b64urlDecode(payload.body.data);
  const parts: any[] = payload.parts ?? [];
  // Prefer text/plain
  for (const p of parts) {
    if (p.mimeType === 'text/plain' && p.body?.data) return b64urlDecode(p.body.data);
  }
  // Fallback: strip HTML
  for (const p of parts) {
    if (p.mimeType === 'text/html' && p.body?.data) {
      return b64urlDecode(p.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    }
  }
  // Recurse into multipart
  for (const p of parts) {
    const inner = extractPlainBody(p);
    if (inner) return inner;
  }
  return '';
}

// ---- SMS-style transaction parser (mirrors src/utils/smsParser.ts) ----
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
const AMT = String.raw`(?:UGX|USh|UShs?|Shs?|Ush\.)?\s*\.?\s*([\d][\d,]*(?:\.\d+)?)`;
const toInt = (raw: string) => {
  const n = Math.round(parseFloat(raw.replace(/,/g, '')));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
function normDate(raw: string): string | undefined {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) { let [,d,m,y]=dmy; if (y.length===2) y=`20${y}`; return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
  return undefined;
}
function parseTransaction(text: string): {
  amount?: number; fee?: number; balance?: number; transaction_id?: string;
  tx_date?: string; tx_time?: string; direction?: string; channel?: string; counterparty?: string;
} {
  const out: any = {};
  if (!text) return out;
  const t = text.replace(/\s+/g, ' ').trim();

  if (/\bmomo\b|mtn mobile money|mtn momo|\bmtn\b/i.test(t)) out.channel = 'mtn_momo';
  else if (/airtel money|\bairtel\b|\btid\b/i.test(t)) out.channel = 'airtel_money';
  else if (/\bbank\b|stanbic|centenary|dfcu|equity|absa|stanchart|standard chartered|housing finance|kcb|ncba|baroda|tropical|ecobank|orient|finance trust|opportunity bank|post bank|cairo bank/i.test(t)) out.channel = 'bank';
  else out.channel = 'other';

  if (/\b(received|deposited|credited|you have received|payment received|recd from|cash in|deposit of)\b/i.test(t)) out.direction = 'in';
  else if (/\b(sent|paid|withdrawn|withdrew|debited|cash out|transferred to|payment to|purchase of|bought)\b/i.test(t)) out.direction = 'out';
  else if (/\b(charge|fee|fees|tax|levy)\b/i.test(t) && !/charge\s*[:\-]?\s*(?:ugx)?\s*0\b/i.test(t)) out.direction = 'charge';

  const feeM = t.match(new RegExp(String.raw`(?:Charge|Fee|Fees|Tax|Levy)\s*[:.\-]?\s*` + AMT, 'i'));
  if (feeM) out.fee = toInt(feeM[1]);
  const balM = t.match(new RegExp(String.raw`(?:New\s+balance|Balance|Bal)\s*[:.\-]?\s*` + AMT, 'i'));
  if (balM) out.balance = toInt(balM[1]);

  const verbAmt = t.match(new RegExp(String.raw`(?:received|deposited|credited|sent|paid|withdrew|withdrawn|debited|payment of|amount of|sum of|of)\s+(?:UGX|USh|UShs?|Shs?)?\s*\.?\s*([\d][\d,]*(?:\.\d+)?)`, 'i'));
  if (verbAmt) out.amount = toInt(verbAmt[1]);
  if (out.amount === undefined) {
    const amountRe = /(?:UGX|USh|UShs|Shs)\s*\.?\s*([\d,]+(?:\.\d+)?)/gi;
    const skipRe = /(bal(?:ance)?|charge|fee|fees|tax|levy|new\s*balance)\s*[:.\-]?\s*$/i;
    let firstAmt: number | undefined; let chosen: number | undefined;
    for (const m of t.matchAll(amountRe)) {
      const n = toInt(m[1]); if (n === undefined) continue;
      if (firstAmt === undefined) firstAmt = n;
      const lookback = t.slice(Math.max(0, (m.index ?? 0) - 16), m.index ?? 0);
      if (skipRe.test(lookback)) continue;
      if (out.fee && n === out.fee) continue;
      if (out.balance && n === out.balance) continue;
      chosen = n; break;
    }
    out.amount = chosen ?? firstAmt;
  }

  const mtnId = t.match(/(?:^|[^A-Z])ID[:\s.#-]+(\d{8,18})\b/i);
  const airtel = t.match(/\bTID[\s.:#-]*(\d{4,18})\b/i);
  const mtnLegacy = t.match(/\bMP[A-Z0-9]{8,}\b/i);
  const flutter = t.match(/\b(?:FLW|FW)[A-Z0-9]{6,}\b/i);
  const bankRef = t.match(/\b(?:FT|TXN|CR|DR|TRF|REF)[A-Z0-9]{6,}\b/i);
  const generic = t.match(/\b(?:Txn\s?ID|Transaction\s?ID|Trans\s?ID|Ref(?:erence)?|Receipt(?:\s?No)?|Confirmation)[:\s#]*([A-Z0-9-]{4,})\b/i);
  if (mtnId) out.transaction_id = mtnId[1];
  else if (airtel) out.transaction_id = `TID${airtel[1]}`;
  else if (mtnLegacy) out.transaction_id = mtnLegacy[0].toUpperCase();
  else if (flutter) out.transaction_id = flutter[0].toUpperCase();
  else if (bankRef) out.transaction_id = bankRef[0].toUpperCase();
  else if (generic) out.transaction_id = generic[1].toUpperCase();

  const cpMatch = t.match(/\b(?:from|to|by)\s+([A-Z][A-Za-z'.\- ]{1,40}?)(?=\s+(?:on|at|UGX|USh|Shs|Bal|ID|TID|Ref|\.|,|256|\+256|0\d{9}))/);
  if (cpMatch) out.counterparty = cpMatch[1].trim();
  if (!out.counterparty) {
    const phoneCp = t.match(/\b(?:from|to|by)\s+((?:\+?256|0)\d{9})\b/);
    if (phoneCp) out.counterparty = phoneCp[1];
  }

  const numericDate = t.match(/\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  if (numericDate) { const n = normDate(numericDate[1]); if (n) out.tx_date = n; }
  if (!out.tx_date) {
    const named = t.match(/\b(\d{1,2})[\s/-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/-](\d{2,4})\b/i);
    if (named) {
      const mm = MONTH_MAP[named[2].slice(0,3).toLowerCase()];
      if (mm) { const y = named[3].length === 2 ? `20${named[3]}` : named[3]; out.tx_date = `${y}-${mm}-${named[1].padStart(2,'0')}`; }
    }
  }

  const timeMatch = t.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s?(AM|PM)?\b/i);
  if (timeMatch) {
    let hh = parseInt(timeMatch[1], 10); const mm = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3]?.toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      out.tx_time = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    }
  }
  return out;
}

async function gmailFetch(path: string, init?: RequestInit) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GOOGLE_MAIL_API_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
  if (!GOOGLE_MAIL_API_KEY) throw new Error('GOOGLE_MAIL_API_KEY is not configured (Gmail not connected)');
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': GOOGLE_MAIL_API_KEY,
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Gmail ${path} [${res.status}]: ${body}`);
  try { return JSON.parse(body); } catch { return body; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: state } = await supabase
      .from('gmail_poll_state').select('*').eq('id', 1).maybeSingle();
    const lastMs: number = Number(state?.last_internal_date_ms ?? 0);

    // List recent matching messages
    const list = await gmailFetch(
      `/users/me/messages?maxResults=50&q=${encodeURIComponent(GMAIL_QUERY)}`,
    );
    const messages: { id: string; threadId: string }[] = list?.messages ?? [];

    let inserted = 0; let newestMs = lastMs;
    for (const m of messages) {
      const { data: existing } = await supabase
        .from('gmail_transactions').select('id').eq('gmail_message_id', m.id).maybeSingle();
      if (existing) continue;

      const full = await gmailFetch(`/users/me/messages/${m.id}?format=full`);
      const internalMs = Number(full?.internalDate ?? 0);
      if (lastMs && internalMs && internalMs <= lastMs) continue;
      if (internalMs > newestMs) newestMs = internalMs;

      const headers: { name: string; value: string }[] = full?.payload?.headers ?? [];
      const h = (n: string) => headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value ?? null;
      const fromRaw = h('From') ?? '';
      const fromMatch = fromRaw.match(/^\s*"?([^"<]*)"?\s*<?([^>]*)>?\s*$/);
      const fromName = fromMatch?.[1]?.trim() || null;
      const fromEmail = (fromMatch?.[2]?.trim() || fromRaw).toLowerCase() || null;
      const subject = h('Subject');
      const snippet = full?.snippet ?? null;
      const body = extractPlainBody(full?.payload);
      const combined = [subject, snippet, body].filter(Boolean).join('\n');
      const parsed = parseTransaction(combined);

      const { error } = await supabase.from('gmail_transactions').insert({
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
        from_email: fromEmail,
        from_name: fromName,
        subject,
        snippet,
        raw_body: body?.slice(0, 8000) ?? null,
        amount: parsed.amount ?? null,
        transaction_id: parsed.transaction_id ?? null,
        tx_date: parsed.tx_date ?? null,
        tx_time: parsed.tx_time ?? null,
        parsed: !!(parsed.amount || parsed.transaction_id),
        internal_date: internalMs ? new Date(internalMs).toISOString() : null,
        direction: parsed.direction ?? null,
        channel: parsed.channel ?? null,
        counterparty: parsed.counterparty ?? null,
        fee: parsed.fee ?? null,
        balance: parsed.balance ?? null,
      });
      if (!error) inserted++;
    }

    await supabase.from('gmail_poll_state').upsert({
      id: 1,
      last_internal_date_ms: newestMs || lastMs,
      last_polled_at: new Date().toISOString(),
      last_status: 'ok',
      last_error: null,
    });

    return new Response(JSON.stringify({ ok: true, scanned: messages.length, inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('gmail_poll_state').upsert({
      id: 1, last_polled_at: new Date().toISOString(), last_status: 'error', last_error: msg,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});