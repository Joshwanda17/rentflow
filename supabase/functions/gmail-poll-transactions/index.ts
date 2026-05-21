import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';

// Capture every recent email that mentions money in any common form.
// We deliberately keep this VERY broad: any UGX/USh/Shs token, any digit
// sequence with a thousands separator, common provider words, and any
// forwarded SMS. Filtering happens downstream by the parser (`parsed`
// flag) so nothing useful is missed at the Gmail layer.
const GMAIL_QUERY = [
  '(',
  'UGX OR USh OR UShs OR Shs OR "USh." OR "Ush" OR "shs."',
  'OR MoMo OR "Mobile Money" OR "Airtel Money" OR MTN OR Airtel OR Stanbic OR Centenary OR DFCU OR Equity OR Absa OR "Stanbic Bank"',
  'OR "TID" OR "Txn ID" OR "Transaction ID" OR "Trans ID" OR "Receipt" OR "Reference" OR "Confirmation"',
  'OR "received" OR "deposited" OR "credited" OR "withdrawn" OR "paid" OR "sent" OR "debited"',
  'OR subject:"SMS from" OR subject:"SMS Forwarder" OR from:smsforwarder OR "Forwarded SMS"',
  ') newer_than:30d',
].join(' ');

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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildDedupKey(p: {
  transaction_id?: string | null; from_email?: string | null;
  amount?: number | null; internal_date?: Date | null; counterparty?: string | null;
}): string {
  const minute = p.internal_date
    ? `${p.internal_date.getUTCFullYear()}-${String(p.internal_date.getUTCMonth()+1).padStart(2,'0')}-${String(p.internal_date.getUTCDate()).padStart(2,'0')} ${String(p.internal_date.getUTCHours()).padStart(2,'0')}:${String(p.internal_date.getUTCMinutes()).padStart(2,'0')}`
    : '';
  return [
    (p.transaction_id ?? '').toLowerCase(),
    p.from_email ?? '',
    p.amount ?? '',
    minute,
    p.counterparty ?? '',
  ].join('|');
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
  else if (/airtel\s?money|\bairtel\b|airtelmoney|\btid\b/i.test(t)) out.channel = 'airtel_money';
  else if (/\bbank\b|stanbic|centenary|dfcu|equity|absa|stanchart|standard chartered|housing finance|kcb|ncba|baroda|tropical|ecobank|orient|finance trust|opportunity bank|post bank|cairo bank/i.test(t)) out.channel = 'bank';
  else out.channel = 'other';

  // Airtel Money agent terminology: "You have deposited UGX X ... Mobile
  // Number: 07XX" means the AGENT pushed cash OUT to a customer mobile
  // wallet — it's a payout, not an incoming credit. Match this BEFORE the
  // generic "deposited" → 'in' rule so it wins.
  const airtelAgentPayout = /you\s+have\s+deposited\s+ugx[\s\d,.]+.*\bmobile\s+number\s*[:\-]?\s*(?:\+?256|0)?\d{6,}/i.test(t);
  if (airtelAgentPayout) out.direction = 'out';
  else if (/\b(received|deposited|credited|you have received|payment received|recd from|cash in|deposit of)\b/i.test(t)) out.direction = 'in';
  else if (/\b(sent|paid|withdrawn|withdrew|debited|cash out|transferred to|payment to|purchase of|bought)\b/i.test(t)) out.direction = 'out';
  else if (/\b(charge|fee|fees|tax|levy)\b/i.test(t) && !/charge\s*[:\-]?\s*(?:ugx)?\s*0\b/i.test(t)) out.direction = 'charge';

  // For the airtel agent payout shape, the "Mobile Number:" field is the
  // recipient — surface it as the counterparty so the routing UI can match
  // to a user/proxy wallet.
  if (airtelAgentPayout) {
    const mob = t.match(/mobile\s+number\s*[:\-]?\s*((?:\+?256|0)?\d{6,})/i);
    if (mob) out.counterparty = mob[1];
  }

  // Sum every fee/charge/tax/excise/commission/VAT/stamp-duty component
  // mentioned in the body so totals reflect the FULL cost the provider
  // (MTN / Airtel / Equity Bank / etc.) deducted, not just the first label.
  // Each unique (label, value, position) match contributes once.
  {
    const feeLabel = String.raw`(?:Transaction\s+Fee|Service\s+Fee|Bank\s+Fee|Bank\s+Charge|Withdraw(?:al)?\s+Fee|Charges?|Fees?|Excise(?:\s+Duty)?|VAT|Tax(?:es)?|Levy|Levies|Commission|Stamp\s+Duty)`;
    const feeRe = new RegExp(feeLabel + String.raw`\s*[:.\-]?\s*` + AMT, 'gi');
    let feeSum = 0;
    const seen = new Set<number>();
    for (const m of t.matchAll(feeRe)) {
      const n = toInt(m[1]);
      if (n === undefined || n <= 0) continue;
      const idx = m.index ?? -1;
      if (seen.has(idx)) continue;
      seen.add(idx);
      feeSum += n;
    }
    if (feeSum > 0) out.fee = feeSum;
  }
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

  // Filter junk transaction IDs (common stop-words / too short / no digits)
  if (out.transaction_id) {
    const cleaned = out.transaction_id.trim();
    const stop = new Set(['FROM','TO','BY','REF','TXN','TRANS','RECEIPT','REFERENCE','CONFIRMATION','TXNID','TRANSID','OF','THE','YOUR','THIS','THAT','WITH','SENT','PAID','RECEIVED']);
    if (cleaned.length < 6 || stop.has(cleaned.toUpperCase()) || !/[0-9]/.test(cleaned)) {
      delete out.transaction_id;
    } else {
      out.transaction_id = cleaned;
    }
  }

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

/**
 * Gmail gateway fetch with automatic exponential-backoff retry on
 * authentication-class failures (401 Unauthenticated / 403 insufficient-
 * scope / network blips). The connector gateway can transiently return
 * 401 immediately after a token refresh; a short retry loop avoids
 * surfacing those as user-visible errors.
 *
 * Backoff schedule: 500ms, 1500ms, 4500ms (3 retries → 4 total attempts).
 * Non-auth errors (e.g. 4xx parse errors, 5xx server errors other than
 * 502/503/504) fail fast.
 */
async function gmailFetch(path: string, init?: RequestInit) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const GOOGLE_MAIL_API_KEY = Deno.env.get('GOOGLE_MAIL_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
  if (!GOOGLE_MAIL_API_KEY) throw new Error('GOOGLE_MAIL_API_KEY is not configured (Gmail not connected)');

  const MAX_ATTEMPTS = 4;
  const BASE_DELAY_MS = 500;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${GATEWAY_URL}${path}`, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': GOOGLE_MAIL_API_KEY,
        },
      });
      const body = await res.text();
      if (res.ok) {
        try { return JSON.parse(body); } catch { return body; }
      }

      const isAuth = res.status === 401 || res.status === 403;
      const isTransient = res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429;
      const retryable = isAuth || isTransient;

      const err = new Error(`Gmail ${path} [${res.status}]: ${body}`);
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;

      lastErr = err;
      const delay = BASE_DELAY_MS * Math.pow(3, attempt - 1); // 500, 1500, 4500
      const jitter = Math.floor(Math.random() * 200);
      console.warn(
        `[gmailFetch] attempt ${attempt}/${MAX_ATTEMPTS} failed (${res.status}) — retrying in ${delay + jitter}ms: ${path}`,
      );
      await new Promise((r) => setTimeout(r, delay + jitter));
    } catch (e) {
      // Network-level failure (TypeError / fetch error) — retry as transient
      if (attempt === MAX_ATTEMPTS || (e instanceof Error && e.message.startsWith('Gmail '))) {
        throw e;
      }
      lastErr = e;
      const delay = BASE_DELAY_MS * Math.pow(3, attempt - 1);
      console.warn(`[gmailFetch] network attempt ${attempt}/${MAX_ATTEMPTS} failed — retrying in ${delay}ms`, e);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr ?? new Error(`Gmail ${path}: exhausted retries`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Debug mode: return per-message diagnostics without writing to DB.
    const url = new URL(req.url);
    let debug = url.searchParams.get('debug') === '1';
    if (!debug) {
      try {
        const body = await req.clone().json();
        if (body && (body.debug === true || body.debug === 1)) debug = true;
      } catch { /* no body */ }
    }

    const { data: state } = await supabase
      .from('gmail_poll_state').select('*').eq('id', 1).maybeSingle();
    const lastMs: number = Number(state?.last_internal_date_ms ?? 0);

    // List recent matching messages
    const list = await gmailFetch(
      `/users/me/messages?maxResults=50&q=${encodeURIComponent(GMAIL_QUERY)}`,
    );
    const messages: { id: string; threadId: string }[] = list?.messages ?? [];

    let inserted = 0; let newestMs = lastMs;
    const debugReport: any[] = [];
    for (const m of messages) {
      const { data: existing } = await supabase
        .from('gmail_transactions').select('id').eq('gmail_message_id', m.id).maybeSingle();
      if (existing) {
        if (debug) debugReport.push({ id: m.id, decision: 'skipped', reason: 'already_in_db' });
        continue;
      }

      const full = await gmailFetch(`/users/me/messages/${m.id}?format=full`);
      const internalMs = Number(full?.internalDate ?? 0);
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

      if (lastMs && internalMs && internalMs <= lastMs) {
        if (debug) debugReport.push({
          id: m.id, decision: 'skipped', reason: 'older_than_last_poll',
          internal_date: new Date(internalMs).toISOString(),
          last_cutoff: new Date(lastMs).toISOString(),
          from: fromEmail, subject,
        });
        continue;
      }
      if (internalMs > newestMs) newestMs = internalMs;

      const isParsed = !!(parsed.amount || parsed.transaction_id);
      const internalDateObj = internalMs ? new Date(internalMs) : null;
      const dedupHash = (parsed.transaction_id || parsed.amount)
        ? await sha256Hex(buildDedupKey({
            transaction_id: parsed.transaction_id,
            from_email: fromEmail,
            amount: parsed.amount,
            internal_date: internalDateObj,
            counterparty: parsed.counterparty,
          }))
        : null;

      // Skip if a row with the same transaction_id or dedup_hash already exists.
      if (parsed.transaction_id || dedupHash) {
        const orParts: string[] = [];
        if (parsed.transaction_id) orParts.push(`transaction_id.eq.${parsed.transaction_id}`);
        if (dedupHash) orParts.push(`dedup_hash.eq.${dedupHash}`);
        const { data: dup } = await supabase
          .from('gmail_transactions')
          .select('id, transaction_id, dedup_hash')
          .or(orParts.join(','))
          .limit(1)
          .maybeSingle();
        if (dup) {
          const reason = (parsed.transaction_id && (dup as any).transaction_id?.toLowerCase() === parsed.transaction_id.toLowerCase())
            ? 'transaction_id_match'
            : 'dedup_hash_match';
          if (debug) {
            debugReport.push({ id: m.id, decision: 'skipped', reason, from: fromEmail, subject });
          } else {
            await supabase.from('gmail_dedup_audit').insert({
              gmail_message_id: m.id,
              dedup_hash: dedupHash,
              matched_transaction_id: (dup as any).transaction_id ?? null,
              matched_row_id: (dup as any).id,
              reason,
              from_email: fromEmail,
              subject: subject ?? null,
              snippet: snippet ?? null,
              internal_date: internalMs ? new Date(internalMs).toISOString() : null,
            });
          }
          continue;
        }
      }

      const reasons: string[] = [];
      if (!parsed.amount) reasons.push('no_amount_detected');
      if (!parsed.transaction_id) reasons.push('no_transaction_id_detected');
      if (!parsed.direction) reasons.push('no_direction_keyword');
      if (parsed.channel === 'other') reasons.push('channel_unknown');

      if (debug) {
        debugReport.push({
          id: m.id,
          decision: isParsed ? 'would_insert_parsed' : 'would_insert_unparsed',
          from: fromEmail,
          from_name: fromName,
          subject,
          snippet: snippet?.slice(0, 160) ?? null,
          internal_date: internalMs ? new Date(internalMs).toISOString() : null,
          extracted: {
            amount: parsed.amount ?? null,
            transaction_id: parsed.transaction_id ?? null,
            direction: parsed.direction ?? null,
            channel: parsed.channel ?? null,
            counterparty: parsed.counterparty ?? null,
            fee: parsed.fee ?? null,
            balance: parsed.balance ?? null,
            tx_date: parsed.tx_date ?? null,
            tx_time: parsed.tx_time ?? null,
          },
          parser_notes: reasons,
        });
        continue; // do not write in debug mode
      }

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
        parsed: isParsed,
        internal_date: internalMs ? new Date(internalMs).toISOString() : null,
        direction: parsed.direction ?? null,
        channel: parsed.channel ?? null,
        counterparty: parsed.counterparty ?? null,
        fee: parsed.fee ?? null,
        balance: parsed.balance ?? null,
        dedup_hash: dedupHash,
      });
      if (!error) inserted++;
      else if ((error as any)?.code === '23505') {
        // Race: another poll inserted this row between our check and insert. Safe to ignore.
      }

      // ── Auto-credit operational float ───────────────────────────────
      // If this is a parsed INCOMING MTN/Airtel MoMo receipt whose
      // counterparty (sender) phone matches a known platform user, create
      // an `operational_float` deposit_request on their behalf and run it
      // through approve-deposit with system_auto_credit so the user opens
      // the app to find the money already in their Operational Float
      // wallet — no need to type anything.
      if (!error && isParsed) {
        try {
          await tryAutoCreditOperationalFloat(supabase, {
            parsed,
            fromEmail,
            internalMs,
            gmailMessageId: m.id,
          });
        } catch (e) {
          console.warn('[gmail-poll] auto-credit failed (non-fatal):', e);
        }
      }
    }

    if (!debug) {
      await supabase.from('gmail_poll_state').upsert({
        id: 1,
        last_internal_date_ms: newestMs || lastMs,
        last_polled_at: new Date().toISOString(),
        last_status: 'ok',
        last_error: null,
      });
    }

    // ── Recovery sweep: approve any deposits already linked to a Gmail row
    // but still pending. This catches races where the email arrived after
    // submit (linked by the late-link path above or the nightly relink job)
    // but `approve-deposit` was never invoked — so the agent's float never
    // showed up. Bounded to 25 rows per tick to keep the poll cheap.
    if (!debug) {
      try {
        await sweepLinkedPendingDeposits(supabase);
      } catch (e) {
        console.warn('[gmail-poll] linked-pending sweep failed (non-fatal):', e);
      }
    }

    return new Response(JSON.stringify({
      ok: true, scanned: messages.length, inserted,
      query: GMAIL_QUERY,
      last_cutoff: lastMs ? new Date(lastMs).toISOString() : null,
      debug: debug ? debugReport : undefined,
    }), {
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

// ── Helper: auto-credit operational float for matched user ───────────
async function tryAutoCreditOperationalFloat(
  supabase: ReturnType<typeof createClient>,
  args: {
    parsed: ReturnType<typeof parseTransaction>;
    fromEmail: string | null;
    internalMs: number;
    gmailMessageId: string;
  },
): Promise<void> {
  const { parsed, internalMs, gmailMessageId } = args;

  // Eligibility gates
  if (!parsed.amount || parsed.amount <= 0) return;
  if (!parsed.transaction_id) return;
  if (parsed.direction !== 'in') return;
  if (parsed.channel !== 'mtn_momo' && parsed.channel !== 'airtel_money') return;

  // Only credit receipts within the last 7 days (matches approve-deposit gate).
  if (internalMs && internalMs < Date.now() - 7 * 24 * 3600 * 1000) return;

  // Extract a phone from counterparty (parser already captures phone shape).
  const cp = (parsed.counterparty ?? '').toString();
  const phoneMatch = cp.match(/(?:\+?256|0)?\d{9,12}/);

  let profile: { id: string; phone: string | null; full_name: string | null; email?: string | null } | null = null;
  let matchMethod: 'phone' | 'name' = 'phone';
  // Audit detail for name-fallback matching: candidate pool, chosen
  // tie-breaker, last-seen timestamps, and confidence breakdown. Surfaced
  // in the Auto-Credit Review queue so ops can judge each best-guess.
  let nameMatchAudit: {
    raw_name: string;
    total_candidates: number;
    candidates: Array<{
      id: string;
      full_name: string | null;
      phone_last4: string | null;
      has_phone: boolean;
      last_sign_in_at: string | null;
      last_sign_in_ms: number;
      selected: boolean;
    }>;
    tiebreaker: string;
    tiebreaker_pool: 'with-phone' | 'all' | 'single' | null;
    confidence: 'high' | 'medium' | 'low';
    confidence_score: number;
    confidence_reasons: string[];
  } | null = null;

  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/[^0-9]/g, '');
    if (digits.length >= 9) {
      const last9 = digits.slice(-9);
      const { data } = await supabase
        .from('profiles')
        .select('id, phone, full_name, email')
        .filter('phone', 'ilike', `%${last9}`)
        .limit(1)
        .maybeSingle();
      if (data?.id) profile = data as any;
    }
  }

  // ── MTN MoMo fallback ────────────────────────────────────────────
  // MTN "received" notification emails only include the sender's NAME,
  // never the phone. Try a strict name match — only accept when EXACTLY
  // one profile matches, to avoid mis-crediting on common names.
  if (!profile && parsed.channel === 'mtn_momo') {
    const rawName = cp.replace(/\s+/g, ' ').trim();
    // Must look like a real human name (≥ 2 words, ≥ 4 chars total, letters)
    if (rawName && /[A-Za-z]/.test(rawName) && rawName.split(' ').filter(Boolean).length >= 2 && rawName.length >= 4) {
      const { data: nameMatches } = await supabase
        .from('profiles')
        .select('id, phone, full_name, email')
        .ilike('full_name', rawName)
        .limit(10);
      if (nameMatches && nameMatches.length === 1 && nameMatches[0]?.id) {
        profile = nameMatches[0] as any;
        matchMethod = 'name';
        const only = nameMatches[0] as any;
        const onlyDigits = (only.phone ?? '').replace(/\D/g, '');
        nameMatchAudit = {
          raw_name: rawName,
          total_candidates: 1,
          candidates: [{
            id: only.id,
            full_name: only.full_name ?? null,
            phone_last4: onlyDigits.length >= 4 ? onlyDigits.slice(-4) : null,
            has_phone: onlyDigits.length >= 9,
            last_sign_in_at: null,
            last_sign_in_ms: 0,
            selected: true,
          }],
          tiebreaker: 'unique-name-match',
          tiebreaker_pool: 'single',
          confidence: 'high',
          confidence_score: 0.95,
          confidence_reasons: ['exactly one profile matched the sender name'],
        };
        console.log(`[gmail-poll] MTN name-fallback matched "${rawName}" → user=${profile.id}`);
      } else if (nameMatches && nameMatches.length > 1) {
        // Tie-breaker 1: prefer profiles that actually have a phone on file.
        const withPhone = nameMatches.filter((p: any) => (p.phone ?? '').replace(/\D/g, '').length >= 9);
        let winner: any = null;
        let tiebreaker = '';
        let tiebreakerPool: 'with-phone' | 'all' | 'single' | null = null;
        const lastSeen: { id: string; ts: number; iso: string | null }[] = [];
        if (withPhone.length === 1) {
          winner = withPhone[0];
          tiebreaker = 'only-profile-with-phone';
          tiebreakerPool = 'with-phone';
        } else {
          // Tie-breaker 2: pick the most recently active auth user (within 30d
          // and strictly newer than every other candidate by ≥ 24h).
          const pool = withPhone.length > 1 ? withPhone : nameMatches;
          tiebreakerPool = withPhone.length > 1 ? 'with-phone' : 'all';
          // Best-guess: pick the most recently active auth user among the
          // same-named candidates. Ops can reverse via Email Transactions
          // if it turns out to be the wrong user.
          for (const p of pool) {
            try {
              const { data: u } = await (supabase as any).auth.admin.getUserById(p.id);
              const t = u?.user?.last_sign_in_at ? new Date(u.user.last_sign_in_at).getTime() : 0;
              lastSeen.push({ id: p.id, ts: t, iso: u?.user?.last_sign_in_at ?? null });
            } catch {
              lastSeen.push({ id: p.id, ts: 0, iso: null });
            }
          }
          lastSeen.sort((a, b) => b.ts - a.ts);
          const top = lastSeen[0];
          if (top) {
            winner = pool.find((p: any) => p.id === top.id) ?? null;
            tiebreaker = top.ts > 0 ? 'most-recent-active' : 'first-candidate';
          }
        }
        if (winner?.id) {
          profile = winner;
          matchMethod = 'name';
          // Confidence: 'low' for first-candidate (no signal), 'medium' for
          // most-recent-active, 'high' for only-profile-with-phone.
          let confidence: 'high' | 'medium' | 'low' = 'low';
          let confidenceScore = 0.3;
          const reasons: string[] = [];
          if (tiebreaker === 'only-profile-with-phone') {
            confidence = 'high';
            confidenceScore = 0.85;
            reasons.push('only one of the same-named profiles has a phone on file');
          } else if (tiebreaker === 'most-recent-active') {
            const top = lastSeen[0];
            const second = lastSeen[1];
            const gapDays = top && second ? (top.ts - second.ts) / 86400000 : 0;
            if (gapDays >= 7) {
              confidence = 'medium';
              confidenceScore = 0.65;
              reasons.push(`winner active ${gapDays.toFixed(1)}d more recently than runner-up`);
            } else {
              confidence = 'low';
              confidenceScore = 0.4;
              reasons.push(`winner active only ${gapDays.toFixed(1)}d more recently than runner-up`);
            }
          } else {
            reasons.push('no last-sign-in signal — picked first candidate');
          }
          const lsMap = new Map(lastSeen.map(l => [l.id, l]));
          nameMatchAudit = {
            raw_name: rawName,
            total_candidates: nameMatches.length,
            candidates: nameMatches.map((p: any) => {
              const digits = (p.phone ?? '').replace(/\D/g, '');
              const ls = lsMap.get(p.id);
              return {
                id: p.id,
                full_name: p.full_name ?? null,
                phone_last4: digits.length >= 4 ? digits.slice(-4) : null,
                has_phone: digits.length >= 9,
                last_sign_in_at: ls?.iso ?? null,
                last_sign_in_ms: ls?.ts ?? 0,
                selected: p.id === winner.id,
              };
            }),
            tiebreaker,
            tiebreaker_pool: tiebreakerPool,
            confidence,
            confidence_score: confidenceScore,
            confidence_reasons: reasons,
          };
          console.log(`[gmail-poll] MTN name-fallback resolved "${rawName}" (${nameMatches.length} matches) via ${tiebreaker} → user=${winner.id}`);
        } else {
          console.log(`[gmail-poll] MTN name-fallback ambiguous for "${rawName}" (${nameMatches.length} matches, no clear winner) — skipping auto-credit`);
        }
      }
    }
  }

  if (!profile?.id) return;

  // Find the gmail_transactions row we just wrote so we can link it.
  const { data: gmailRow } = await supabase
    .from('gmail_transactions')
    .select('id, linked_deposit_request_id')
    .eq('gmail_message_id', gmailMessageId)
    .maybeSingle();
  if (!gmailRow?.id) return;
  if (gmailRow.linked_deposit_request_id) return; // already linked

  // Idempotency / late-arriving-email fix:
  // If the user ALREADY submitted a deposit_request with this TID (typical
  // flow: agent types the TID before the MoMo receipt has hit our Gmail
  // inbox), there are two cases:
  //   1) That deposit is already approved/processed → nothing to do, return.
  //   2) That deposit is still `pending` because `try_link_gmail_for_deposit`
  //      ran before this email row existed. The nightly relink cron would
  //      eventually catch it, but the agent expects their float to appear
  //      instantly. So: link this gmail row to that pending deposit and run
  //      approve-deposit immediately (same path the relink job uses).
  const tidDigits = parsed.transaction_id.replace(/[^0-9]/g, '');
  if (tidDigits) {
    const { data: existingDep } = await supabase
      .from('deposit_requests')
      .select('id, status, amount, user_id, provider')
      .eq('user_id', profile.id)
      .not('status', 'in', '(rejected,cancelled,failed)')
      .filter('transaction_id', 'ilike', `%${tidDigits}`)
      .limit(1)
      .maybeSingle();
    if (existingDep?.id) {
      if (String(existingDep.status) !== 'pending') return;
      if (Number(existingDep.amount) !== Number(parsed.amount)) {
        console.warn(
          `[gmail-poll] late-link skipped: amount mismatch dep=${existingDep.id} ` +
          `dep_amount=${existingDep.amount} email_amount=${parsed.amount}`,
        );
        return;
      }
      // Link gmail row → existing pending deposit so approve-deposit re-verification passes.
      await supabase
        .from('gmail_transactions')
        .update({
          linked_deposit_request_id: existingDep.id,
          auto_matched_at: new Date().toISOString(),
          auto_match_method: 'late_email_tid_match',
        })
        .eq('id', gmailRow.id);

      // Stamp the deposit's audit so the user-facing "Will auto-credit when
      // your receipt arrives" panel flips to ✅ instead of staying pending.
      await supabase
        .from('deposit_requests')
        .update({
          auto_match_audit: {
            checked_at: new Date().toISOString(),
            normalized_tid: tidDigits,
            raw_tid: parsed.transaction_id,
            outcome: 'linked',
            source: 'gmail_poll_late_link',
            note: 'Mobile-money receipt arrived after deposit was submitted; matched and auto-credited.',
          },
        } as any)
        .eq('id', existingDep.id)
        .eq('status', 'pending'); // never overwrite a row a human already reviewed

      // Fire approve-deposit (same system_auto_credit path used below).
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/approve-deposit`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deposit_request_id: existingDep.id,
            action: 'approve',
            auto_approved: true,
            auto_match_method: 'late_email_tid_match',
            system_auto_credit: true,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          console.warn('[gmail-poll] late-link approve-deposit non-200:', res.status, txt.slice(0, 300));
        } else {
          console.log(
            `[gmail-poll] late-link auto-credited existing pending deposit user=${profile.id} ` +
            `dep=${existingDep.id} amt=${parsed.amount} tid=${parsed.transaction_id}`,
          );
        }
      } catch (e) {
        console.warn('[gmail-poll] late-link approve-deposit invoke failed:', e);
      }
      return;
    }
  }

  const provider = parsed.channel === 'mtn_momo' ? 'mtn' : 'airtel';
  const auditMeta = {
    source: 'gmail_auto_credit',
    gmail_message_id: gmailMessageId,
    match_method: matchMethod,
    matched_phone_last9: phoneMatch ? phoneMatch[0].replace(/[^0-9]/g, '').slice(-9) : null,
    matched_name: matchMethod === 'name' ? cp : null,
    provider,
    parsed_amount: parsed.amount,
    parsed_tid: parsed.transaction_id,
    internal_date: internalMs ? new Date(internalMs).toISOString() : null,
    created_at: new Date().toISOString(),
    // Enhanced audit: candidate pool + tie-breaker + confidence for the
    // name-fallback path. Null when matched on phone (deterministic).
    name_match: nameMatchAudit,
    tiebreaker: nameMatchAudit?.tiebreaker ?? null,
    confidence: nameMatchAudit?.confidence ?? (matchMethod === 'phone' ? 'high' : null),
    confidence_score: nameMatchAudit?.confidence_score ?? (matchMethod === 'phone' ? 1 : null),
  };

  // Create the deposit as pending — approve-deposit will flip it.
  const { data: newDep, error: depErr } = await supabase
    .from('deposit_requests')
    .insert({
      user_id: profile.id,
      agent_id: profile.id,
      amount: parsed.amount,
      status: 'pending',
      provider,
      transaction_id: parsed.transaction_id,
      transaction_date: internalMs ? new Date(internalMs).toISOString() : new Date().toISOString(),
      deposit_purpose: 'operational_float',
      auto_approved: true,
      auto_match_audit: auditMeta,
      notes: '[auto] Created from incoming Gmail MoMo receipt — phone matched a known user; credited to Operational Float.',
    })
    .select('id')
    .single();
  if (depErr || !newDep?.id) {
    console.warn('[gmail-poll] auto-credit: could not insert deposit_request', depErr);
    return;
  }

  // Link gmail row → deposit so approve-deposit re-verification succeeds.
  await supabase
    .from('gmail_transactions')
    .update({ linked_deposit_request_id: newDep.id })
    .eq('id', gmailRow.id);

  // Invoke approve-deposit with system_auto_credit to credit the float wallet.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/approve-deposit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deposit_request_id: newDep.id,
        action: 'approve',
        auto_approved: true,
        auto_match_method: 'gmail_phone+tid+amount',
        system_auto_credit: true,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[gmail-poll] approve-deposit non-200:', res.status, txt.slice(0, 300));
      return;
    } else {
      console.log(`[gmail-poll] auto-credited float for user=${profile.id} dep=${newDep.id} amt=${parsed.amount}`);
    }
  } catch (e) {
    console.warn('[gmail-poll] approve-deposit invoke failed:', e);
    return;
  }

  // ── Notify the user via SMS ────────────────────────────────────
  // Tell them their Operational Float wallet was just topped up and what
  // the new balance is, so they don't have to open the app to confirm.
  try {
    if (!profile.phone) return;
    const { data: walletRow } = await supabase
      .from('wallets')
      .select('float_balance')
      .eq('user_id', profile.id)
      .maybeSingle();
    const newFloat = Number(walletRow?.float_balance ?? 0);
    const firstName = (profile.full_name ?? '').split(' ')[0] || 'there';
    const fmt = (n: number) => `UGX ${Math.round(n).toLocaleString('en-UG')}`;
    const msg =
      `Welile: Hi ${firstName}, ${fmt(parsed.amount!)} from ${provider.toUpperCase()} ` +
      `(TID ${parsed.transaction_id}) was auto-credited to your Operational Float. ` +
      `New float balance: ${fmt(newFloat)}.`;
    await sendSmsViaAfricasTalking(profile.phone, msg);

    // Also email the receipt if we have an email on file.
    const recipientEmail = (profile as any).email ? String((profile as any).email).trim() : '';
    if (recipientEmail) {
      try {
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-email`;
        const sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const providerLabel = provider === 'mtn' ? 'MTN MoMo' : 'Airtel Money';
        const nowDate = new Date(internalMs || Date.now()).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
        });
        await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sk}`,
            'apikey': sk,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            templateName: 'operational-float-credit',
            recipientEmail,
            idempotencyKey: `op-float-credit-${gmailMessageId}`,
            templateData: {
              partner_name: profile.full_name || firstName,
              transaction_id: parsed.transaction_id,
              amount: parsed.amount,
              currency: 'UGX',
              date: nowDate,
              source: providerLabel,
              new_float_balance: newFloat,
            },
          }),
        });
      } catch (e) {
        console.warn('[gmail-poll] auto-credit email failed (non-fatal):', e);
      }
    }
  } catch (e) {
    console.warn('[gmail-poll] auto-credit SMS failed (non-fatal):', e);
  }
}

// ── SMS helper (Africa's Talking) ────────────────────────────────────
function formatPhoneIntl(phone: string): string {
  const d = phone.replace(/[^0-9]/g, '');
  if (d.startsWith('256')) return `+${d}`;
  if (d.startsWith('0')) return `+256${d.slice(1)}`;
  if (d.length === 9) return `+256${d}`;
  return `+${d}`;
}

async function sendSmsViaAfricasTalking(phone: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get('AFRICASTALKING_API_KEY');
  const username = Deno.env.get('AFRICASTALKING_USERNAME');
  if (!apiKey || !username) {
    console.warn('[gmail-poll] AT credentials missing — skipping SMS');
    return false;
  }
  const isSandbox = username.toLowerCase() === 'sandbox';
  const url = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey,
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        username,
        to: formatPhoneIntl(phone),
        message,
        from: 'WELILE',
      }).toString(),
    });
    const txt = await res.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { /* ignore */ }
    const recipients = data?.SMSMessageData?.Recipients ?? [];
    const ok = recipients.some((r: any) => r.statusCode === 101 || r.statusCode === 100);
    console.log(`[gmail-poll] SMS ${ok ? 'sent' : 'failed'} to ${formatPhoneIntl(phone)} (status ${res.status})`);
    return ok;
  } catch (e) {
    console.warn('[gmail-poll] SMS send error:', e);
    return false;
  }
}