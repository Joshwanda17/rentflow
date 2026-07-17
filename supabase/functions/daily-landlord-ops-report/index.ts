// Daily Landlord Ops Report
// Aggregates listing metrics for a given day and emails a plain-text report via Mailgun.
// Invocation:
//   POST /daily-landlord-ops-report            → yesterday's report to default recipients
//   POST /daily-landlord-ops-report body: { "date": "YYYY-MM-DD", "recipients": ["a@x", "b@y"] }
//     - "date" defaults to yesterday (UTC)
//     - "recipients" defaults to benjamin@welile.com, pexpert46@gmail.com

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FROM_DOMAIN = 'welile.com';
const DEFAULT_FROM = `Welile Reports <reports@${FROM_DOMAIN}>`;
const DEFAULT_RECIPIENTS = ['benjamin@welile.com', 'pexpert46@gmail.com'];

function fmtUgx(n: number | null | undefined) {
  const v = Math.round(Number(n) || 0);
  return `UGX ${v.toLocaleString('en-UG')}`;
}

function pad(s: string, len: number) {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function padLeft(s: string, len: number) {
  return s.length >= len ? s.slice(0, len) : ' '.repeat(len - s.length) + s;
}

function dayBoundaries(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(`${dateStr}T23:59:59.999Z`);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function yesterdayIso() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Fetch every row for a query in pages of 1000 to bypass PostgREST's default cap.
async function fetchAll<T>(
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    const mailgunBaseUrl = Deno.env.get('MAILGUN_API_BASE') || 'https://api.mailgun.net';

    if (!supabaseUrl || !serviceKey || !mailgunApiKey || !mailgunDomain) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dateStr: string = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : yesterdayIso();
    const recipients: string[] = Array.isArray(body?.recipients) && body.recipients.length > 0
      ? body.recipients.filter((r: unknown) => typeof r === 'string' && r.includes('@'))
      : DEFAULT_RECIPIENTS;

    const { startIso, endIso } = dayBoundaries(dateStr);
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Listings created that day (paginated to bypass 1000-row cap)
    const listings = await fetchAll<any>((from, to) => supabase
      .from('house_listings')
      .select('id, agent_id, status, verified, verified_at, monthly_rent, region, district, created_at')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .range(from, to));

    // 2. Listings verified that day
    const verifiedToday = await fetchAll<any>((from, to) => supabase
      .from('house_listings')
      .select('id, agent_id, monthly_rent, region')
      .gte('verified_at', startIso)
      .lte('verified_at', endIso)
      .range(from, to));

    // 3. Rejections that day
    const rejections = await fetchAll<any>((from, to) => supabase
      .from('agent_listing_rejections')
      .select('id, listing_id, agent_id, rejected_at')
      .gte('rejected_at', startIso)
      .lte('rejected_at', endIso)
      .range(from, to));

    // Enrich rejections with listing monthly_rent
    const rejListingIds = [...new Set(rejections.map(r => r.listing_id).filter(Boolean))] as string[];
    let rejListingMap: Record<string, { monthly_rent: number | null; region: string | null }> = {};
    if (rejListingIds.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < rejListingIds.length; i += BATCH) {
        const slice = rejListingIds.slice(i, i + BATCH);
        const { data: rejL } = await supabase
          .from('house_listings')
          .select('id, monthly_rent, region')
          .in('id', slice);
        (rejL ?? []).forEach((l: any) => { rejListingMap[l.id] = { monthly_rent: l.monthly_rent, region: l.region }; });
      }
    }

    // 4. Listing bonuses (commissions) paid that day
    const bonusRows = await fetchAll<any>((from, to) => supabase
      .from('general_ledger')
      .select('amount, category, created_at')
      .in('category', ['listing_bonus', 'listing_verification_bonus', 'agent_listing_bonus'])
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .range(from, to));

    // ---- Aggregations ----
    const all = listings;
    const listedCount = all.length;
    const pendingListings = all.filter(l => !l.verified && l.status !== 'rejected');
    const rejectedInListings = all.filter(l => l.status === 'rejected');
    const verifiedInListings = all.filter(l => l.verified);

    const pendingCount = pendingListings.length;
    const verifiedCountToday = verifiedToday.length;

    const pendingVolume = pendingListings.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0);
    const verifiedVolume = verifiedToday.reduce((s, l) => s + (Number(l.monthly_rent) || 0), 0);
    const rejectionVolume = rejections.reduce((s, r) => s + (Number(rejListingMap[r.listing_id!]?.monthly_rent) || 0), 0);

    // Commission split by category
    const listingCommission = bonusRows
      .filter(b => b.category === 'listing_bonus' || b.category === 'agent_listing_bonus')
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const verificationCommission = bonusRows
      .filter(b => b.category === 'listing_verification_bonus')
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);

    // Most listed by region (from that day's listings)
    const byRegion = new Map<string, number>();
    all.forEach(l => {
      const r = (l.region || '—').toString();
      byRegion.set(r, (byRegion.get(r) || 0) + 1);
    });
    const regionRanking = [...byRegion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Top listing agents by count
    const byAgent = new Map<string, number>();
    all.forEach(l => {
      if (!l.agent_id) return;
      byAgent.set(l.agent_id, (byAgent.get(l.agent_id) || 0) + 1);
    });
    const topAgentIds = [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    let agentNameMap: Record<string, string> = {};
    if (topAgentIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', topAgentIds.map(([id]) => id));
      (profs ?? []).forEach((p: any) => { agentNameMap[p.id] = p.full_name || p.id.slice(0, 8); });
    }

    // ---- Render report ----
    const lines: string[] = [];
    const H = (t: string) => { lines.push(''); lines.push(t.toUpperCase()); lines.push('-'.repeat(t.length)); };

    lines.push('WELILE LANDLORD OPERATIONS');
    lines.push('Daily Report');
    lines.push(`Report date: ${dateStr} (UTC)`);
    lines.push(`Generated:   ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`);

    H('Summary');
    lines.push(`${pad('Houses listed', 32)}${padLeft(String(listedCount), 12)}`);
    lines.push(`${pad('  of which pending', 32)}${padLeft(String(pendingCount), 12)}`);
    lines.push(`${pad('  of which verified same-day', 32)}${padLeft(String(verifiedInListings.length), 12)}`);
    lines.push(`${pad('  of which rejected', 32)}${padLeft(String(rejectedInListings.length), 12)}`);
    lines.push(`${pad('Total verified today', 32)}${padLeft(String(verifiedCountToday), 12)}`);

    H('Amount volume (monthly rent)');
    lines.push(`${pad('Pending listings volume', 32)}${padLeft(fmtUgx(pendingVolume), 24)}`);
    lines.push(`${pad('Verified listings volume', 32)}${padLeft(fmtUgx(verifiedVolume), 24)}`);
    lines.push(`${pad('Rejection volume', 32)}${padLeft(fmtUgx(rejectionVolume), 24)}`);

    H('Commissions');
    lines.push(`${pad('Listing commission', 32)}${padLeft(fmtUgx(listingCommission), 24)}`);
    lines.push(`${pad('Verification commission', 32)}${padLeft(fmtUgx(verificationCommission), 24)}`);
    lines.push(`${pad('Total commission', 32)}${padLeft(fmtUgx(listingCommission + verificationCommission), 24)}`);

    H('Most listed by region (top 10)');
    if (regionRanking.length === 0) {
      lines.push('No listings recorded.');
    } else {
      lines.push(`${pad('Region', 30)}${padLeft('Listings', 12)}`);
      regionRanking.forEach(([region, count]) => {
        lines.push(`${pad(region, 30)}${padLeft(String(count), 12)}`);
      });
    }

    H('Top listing agents (top 10 by count)');
    if (topAgentIds.length === 0) {
      lines.push('No listings recorded.');
    } else {
      lines.push(`${pad('Agent', 30)}${padLeft('Listings', 12)}`);
      topAgentIds.forEach(([id, count]) => {
        lines.push(`${pad(agentNameMap[id] || id.slice(0, 8), 30)}${padLeft(String(count), 12)}`);
      });
    }

    lines.push('');
    lines.push('This is an automated report generated by Welile.');

    const textBody = lines.join('\n');

    // Minimal HTML: monospace block so the aligned columns stay readable.
    const htmlBody = `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; color: #111; background: #fafafa; padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; white-space: pre-wrap;">${textBody
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

    // ---- Send via Mailgun ----
    const form = new URLSearchParams();
    form.set('from', DEFAULT_FROM);
    recipients.forEach(r => form.append('to', r));
    form.set('subject', `Welile Landlord Ops - Daily Report (${dateStr})`);
    form.set('text', textBody);
    form.set('html', htmlBody);
    form.set('o:tag', 'landlord-ops-daily');

    const auth = 'Basic ' + btoa(`api:${mailgunApiKey}`);
    const mgRes = await fetch(`${mailgunBaseUrl}/v3/${mailgunDomain}/messages`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const mgText = await mgRes.text();
    if (!mgRes.ok) {
      console.error('Mailgun send failed', mgRes.status, mgText);
      return new Response(JSON.stringify({ error: 'Mailgun send failed', status: mgRes.status, details: mgText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        date: dateStr,
        recipients,
        listedCount,
        pendingCount,
        verifiedCountToday,
        rejectedCount: rejectedInListings.length,
        rejectionCount: rejections.length,
        pendingVolume,
        verifiedVolume,
        rejectionVolume,
        listingCommission,
        verificationCommission,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('daily-landlord-ops-report failed', err);
    return new Response(JSON.stringify({ error: String((err as any)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});