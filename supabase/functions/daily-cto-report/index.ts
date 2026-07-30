// Daily CTO Report
// Executive-level technology report emailed daily at 00:00 EAT via pg_cron.
//
// Invocation:
//   POST /daily-cto-report
//   POST /daily-cto-report { "date": "YYYY-MM-DD", "recipients": ["a@x"] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FROM = 'Welile CTO Office <reports@welile.com>';
const REPLY_TO = 'reports@welile.com';
const DEFAULT_RECIPIENTS = ['joshwanda17@gmail.com'];

const C = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  bg: '#f8fafc',
  good: '#0f9d58',
  warn: '#c77700',
  bad: '#c0392b',
  brand: '#0b5fff',
};

function yesterdayIsoEAT() {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  eat.setUTCDate(eat.getUTCDate() - 1);
  return eat.toISOString().slice(0, 10);
}
const n = (v: unknown) => Number(v || 0);
const fmt = (v: unknown) => n(v).toLocaleString('en-UG');
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const bytes = (b: unknown) => {
  const v = n(b);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} GB`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} MB`;
  return `${(v / 1e3).toFixed(0)} KB`;
};
const delta = (cur: number, prev: number) => {
  if (prev <= 0) return cur > 0 ? '+100%' : '0%';
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`;
};

type Tone = 'good' | 'warn' | 'bad' | 'neutral';
const toneColor = (t: Tone) => (t === 'good' ? C.good : t === 'warn' ? C.warn : t === 'bad' ? C.bad : C.ink);

function kpi(label: string, value: string, sub = '', tone: Tone = 'neutral') {
  return `
    <td style="padding:6px;width:25%;vertical-align:top;">
      <div style="border:1px solid ${C.line};border-radius:10px;padding:12px 14px;background:#fff;">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};font-weight:700;">${esc(label)}</div>
        <div style="font-size:22px;font-weight:800;color:${toneColor(tone)};margin-top:4px;">${esc(value)}</div>
        ${sub ? `<div style="font-size:11px;color:${C.muted};margin-top:3px;">${esc(sub)}</div>` : ''}
      </div>
    </td>`;
}
function kpiRows(cards: string[]) {
  let out = '';
  for (let i = 0; i < cards.length; i += 4) {
    const row = cards.slice(i, i + 4);
    while (row.length < 4) row.push('<td style="width:25%"></td>');
    out += `<tr>${row.join('')}</tr>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">${out}</table>`;
}
function section(title: string, num: number, body: string) {
  return `
    <div style="margin-top:26px;">
      <div style="font-size:13px;font-weight:800;color:${C.ink};letter-spacing:.04em;text-transform:uppercase;border-bottom:2px solid ${C.ink};padding-bottom:6px;">${num}. ${esc(title)}</div>
      <div style="margin-top:12px;">${body}</div>
    </div>`;
}
function table(headers: string[], rows: string[][]) {
  if (!rows.length) return `<div style="font-size:12px;color:${C.muted};">No records for this period.</div>`;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">
    <tr>${headers.map((h) => `<th align="left" style="padding:7px 8px;background:${C.bg};border-bottom:1px solid ${C.line};font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};">${esc(h)}</th>`).join('')}</tr>
    ${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:7px 8px;border-bottom:1px solid ${C.line};color:${C.ink};">${c}</td>`).join('')}</tr>`).join('')}
  </table>`;
}
function bar(label: string, value: number, max: number, tone: Tone = 'neutral') {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return `
    <tr>
      <td style="padding:3px 8px 3px 0;font-size:11px;color:${C.muted};white-space:nowrap;width:130px;">${esc(label)}</td>
      <td style="padding:3px 0;">
        <div style="background:${C.bg};border-radius:4px;height:12px;width:100%;">
          <div style="background:${toneColor(tone)};height:12px;width:${w}%;border-radius:4px;"></div>
        </div>
      </td>
      <td style="padding:3px 0 3px 8px;font-size:11px;font-weight:700;color:${C.ink};text-align:right;width:70px;">${fmt(value)}</td>
    </tr>`;
}
function chart(rows: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}
function riskCell(level: 'Low' | 'Medium' | 'High') {
  const bg = level === 'High' ? '#fdecea' : level === 'Medium' ? '#fff4e0' : '#e9f7ef';
  const fg = level === 'High' ? C.bad : level === 'Medium' ? C.warn : C.good;
  return `<span style="background:${bg};color:${fg};font-weight:700;padding:2px 8px;border-radius:99px;font-size:11px;">${level}</span>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mgKey = Deno.env.get('MAILGUN_API_KEY');
    const mgDomain = Deno.env.get('MAILGUN_DOMAIN');
    const mgBase = Deno.env.get('MAILGUN_API_BASE') || 'https://api.mailgun.net';
    if (!supabaseUrl || !serviceKey || !mgKey || !mgDomain) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dateStr: string =
      typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : yesterdayIsoEAT();
    const recipients: string[] =
      Array.isArray(body?.recipients) && body.recipients.length
        ? body.recipients.filter((r: unknown) => typeof r === 'string' && (r as string).includes('@'))
        : DEFAULT_RECIPIENTS;

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase.rpc('get_cto_daily_report', { p_date: dateStr });
    if (error) {
      console.error('[daily-cto-report] rpc failed', error);
      return new Response(JSON.stringify({ error: 'metrics_failed', details: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const d: any = data || {};
    const P = d.platform || {}, E = d.errors || {}, A = d.auth || {}, S = d.security || {},
      I = d.infra || {}, B = d.backups || {}, J = d.jobs || {}, M = d.email || {};

    // ---- Derived executive indicators -------------------------------------
    const errRate = pct(n(E.today), Math.max(1, n(P.events_today)));
    const loginFailRate = pct(n(A.login_failures_today), Math.max(1, n(A.login_events_today)));
    const jobFailRate = pct(n(J.failed_24h), Math.max(1, n(J.runs_24h)));
    const emailFailRate = pct(n(M.failed_today), Math.max(1, n(M.sent_today)));
    const connSat = pct(n(I.connections), Math.max(1, n(I.max_connections)));
    const rlsCoverage = pct(n(S.rls_tables), Math.max(1, n(S.public_tables)));
    const cacheHit = n(I.cache_hit_pct);
    const backupOk = n(B.runs_7d) > 0 && n(B.failures_7d) === 0;

    // Weighted technology health score (0-100)
    const scoreParts = [
      { label: 'Reliability', w: 25, v: Math.max(0, 100 - errRate * 12) },
      { label: 'Authentication', w: 15, v: Math.max(0, 100 - loginFailRate * 1.6) },
      { label: 'Automation', w: 15, v: Math.max(0, 100 - jobFailRate * 4) },
      { label: 'Infrastructure', w: 20, v: Math.min(100, cacheHit * 0.7 + Math.max(0, 100 - connSat) * 0.3) },
      { label: 'Security', w: 15, v: rlsCoverage },
      { label: 'Continuity', w: 10, v: backupOk ? 100 : 45 },
    ];
    const health = Math.round(scoreParts.reduce((s, p) => s + (p.v * p.w) / 100, 0));
    const healthTone: Tone = health >= 85 ? 'good' : health >= 70 ? 'warn' : 'bad';
    const healthLabel = health >= 85 ? 'Healthy' : health >= 70 ? 'Watch' : 'At risk';

    // ---- Section 1: Executive Summary -------------------------------------
    const summaryPoints: string[] = [];
    summaryPoints.push(`Platform served ${fmt(P.active_24h)} active users in the last 24 hours across ${fmt(P.events_today)} recorded system events and ${fmt(P.txn_today)} ledger postings.`);
    summaryPoints.push(`Client-side errors ${n(E.today) <= n(E.prev_day) ? 'improved' : 'increased'} to ${fmt(E.today)} (${delta(n(E.today), n(E.prev_day))} vs prior day), affecting ${fmt(E.affected_users_today)} users.`);
    summaryPoints.push(`Authentication success rate stands at ${(100 - loginFailRate).toFixed(1)}% with average sign-in latency of ${fmt(A.avg_login_ms_today)} ms.`);
    summaryPoints.push(`${fmt(J.total_scheduled)} scheduled automations executed ${fmt(J.runs_24h)} runs with a ${jobFailRate.toFixed(1)}% failure rate.`);
    summaryPoints.push(`Database is ${bytes(I.db_size_bytes)} with ${cacheHit.toFixed(2)}% cache hit ratio and ${connSat.toFixed(0)}% connection saturation.`);

    const execSummary = `
      <div style="border:1px solid ${C.line};border-radius:12px;padding:16px;background:#fff;">
        <table role="presentation" width="100%"><tr>
          <td style="vertical-align:middle;width:130px;">
            <div style="border:3px solid ${toneColor(healthTone)};border-radius:12px;padding:12px;text-align:center;">
              <div style="font-size:34px;font-weight:800;color:${toneColor(healthTone)};line-height:1;">${health}</div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:${C.muted};margin-top:6px;font-weight:700;">Health score</div>
              <div style="font-size:11px;color:${toneColor(healthTone)};font-weight:700;margin-top:2px;">${healthLabel}</div>
            </div>
          </td>
          <td style="vertical-align:top;padding-left:16px;">
            <ul style="margin:0;padding-left:18px;font-size:12.5px;color:${C.ink};line-height:1.7;">
              ${summaryPoints.map((p) => `<li>${esc(p)}</li>`).join('')}
            </ul>
          </td>
        </tr></table>
        <div style="margin-top:14px;">
          ${chart(scoreParts.map((p) => bar(`${p.label} (${p.w}%)`, Math.round(p.v), 100, p.v >= 85 ? 'good' : p.v >= 70 ? 'warn' : 'bad')).join(''))}
        </div>
      </div>`;

    // ---- Section 2: Platform Health ---------------------------------------
    const platformCards = kpiRows([
      kpi('Total users', fmt(P.total_users), `${fmt(P.new_users_today)} joined today`),
      kpi('Active 24h', fmt(P.active_24h), `${fmt(P.active_7d)} weekly · ${fmt(P.active_30d)} monthly`),
      kpi('System events', fmt(P.events_today), `${delta(n(P.events_today), n(P.events_prev_day))} vs prior day`),
      kpi('Ledger postings', fmt(P.txn_today), 'financial transactions today'),
      kpi('Error rate', `${errRate.toFixed(2)}%`, 'errors per system event', errRate < 1 ? 'good' : errRate < 3 ? 'warn' : 'bad'),
      kpi('Errors today', fmt(E.today), `${delta(n(E.today), n(E.prev_day))} vs prior day`, n(E.today) <= n(E.prev_day) ? 'good' : 'warn'),
      kpi('Affected users', fmt(E.affected_users_today), 'distinct users hitting errors'),
      kpi('Browser compat events', fmt(E.compat_events_7d), 'last 7 days'),
    ]);
    const trend: any[] = Array.isArray(E.daily_trend) ? E.daily_trend : [];
    const trendMax = Math.max(1, ...trend.map((t) => n(t.n)));
    const trendChart = trend.length
      ? `<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Client error trend — last 14 days</div>${chart(trend.map((t) => bar(String(t.d), n(t.n), trendMax, n(t.n) > trendMax * 0.6 ? 'bad' : 'neutral')).join(''))}</div>`
      : '';

    // ---- Section 3: Infrastructure ----------------------------------------
    const infraCards = kpiRows([
      kpi('Database size', bytes(I.db_size_bytes), 'total on-disk'),
      kpi('Cache hit ratio', `${cacheHit.toFixed(2)}%`, 'target above 99%', cacheHit >= 99 ? 'good' : 'warn'),
      kpi('Connections', `${fmt(I.connections)} / ${fmt(I.max_connections)}`, `${connSat.toFixed(0)}% saturation`, connSat < 60 ? 'good' : connSat < 85 ? 'warn' : 'bad'),
      kpi('Uptime', `${fmt(I.uptime_hours)} h`, 'since last restart'),
      kpi('Deadlocks', fmt(I.deadlocks), 'cumulative since boot', n(I.deadlocks) < 100 ? 'good' : 'warn'),
      kpi('Rolled-back txns', fmt(I.rollbacks), `${fmt(I.commits)} commits`),
      kpi('Scheduled jobs', fmt(J.total_scheduled), `${fmt(J.runs_24h)} runs in 24h`),
      kpi('Job failure rate', `${jobFailRate.toFixed(1)}%`, `${fmt(J.failed_24h)} failed runs`, jobFailRate < 1 ? 'good' : jobFailRate < 5 ? 'warn' : 'bad'),
    ]);
    const largest: any[] = Array.isArray(I.largest_tables) ? I.largest_tables : [];
    const largestMax = Math.max(1, ...largest.map((t) => n(t.bytes)));
    const storageChart = largest.length
      ? `<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Storage footprint — largest tables</div>
         ${chart(largest.map((t) => `
          <tr>
            <td style="padding:3px 8px 3px 0;font-size:11px;color:${C.muted};width:180px;">${esc(t.table_name)}</td>
            <td style="padding:3px 0;"><div style="background:${C.bg};border-radius:4px;height:12px;"><div style="background:${C.brand};height:12px;width:${Math.max(2, Math.round((n(t.bytes) / largestMax) * 100))}%;border-radius:4px;"></div></div></td>
            <td style="padding:3px 0 3px 8px;font-size:11px;font-weight:700;text-align:right;width:80px;">${bytes(t.bytes)}</td>
          </tr>`).join(''))}</div>`
      : '';
    const failingJobs: any[] = Array.isArray(J.failing) ? J.failing : [];
    const jobTable = table(
      ['Automation', 'Failures 24h', 'Last error'],
      failingJobs.map((j) => [esc(j.jobname), `<b style="color:${C.bad}">${fmt(j.n)}</b>`, `<span style="color:${C.muted}">${esc(j.last_error)}</span>`]),
    );

    // ---- Section 4: Engineering Performance --------------------------------
    const topRoutes: any[] = Array.isArray(E.top_routes) ? E.top_routes : [];
    const topMsgs: any[] = Array.isArray(E.top_messages) ? E.top_messages : [];
    const slow: any[] = Array.isArray(d.slow_queries) ? d.slow_queries : [];
    const engCards = kpiRows([
      kpi('Errors 7d', fmt(E.last_7d), 'client-reported defects'),
      kpi('Defect hotspots', String(topRoutes.length), 'routes with recurring errors'),
      kpi('Slowest query', slow.length ? `${fmt(slow[0]?.mean_ms)} ms` : 'n/a', 'mean execution time', slow.length && n(slow[0]?.mean_ms) > 500 ? 'warn' : 'good'),
      kpi('Audit writes', fmt(S.audit_writes_today), 'change records logged today'),
    ]);
    const routeTable = table(['Route', 'Errors (7d)'], topRoutes.map((r) => [esc(r.route), fmt(r.n)]));
    const msgTable = table(['Most frequent error', 'Occurrences (7d)'], topMsgs.map((m) => [esc(m.message), fmt(m.n)]));
    const slowTable = table(['Query (truncated)', 'Mean ms', 'Calls'],
      slow.map((q) => [`<code style="font-size:11px;color:${C.muted}">${esc(q.query)}</code>`, `<b>${fmt(q.mean_ms)}</b>`, fmt(q.calls)]));

    // ---- Section 5: Cybersecurity -----------------------------------------
    const secCards = kpiRows([
      kpi('RLS coverage', `${rlsCoverage.toFixed(1)}%`, `${fmt(S.rls_tables)} of ${fmt(S.public_tables)} tables`, rlsCoverage >= 95 ? 'good' : 'warn'),
      kpi('Privileged accounts', fmt(S.privileged_accounts), 'executive and admin roles', n(S.privileged_accounts) <= 25 ? 'good' : 'warn'),
      kpi('Active fraud blocks', fmt(S.fraud_blocks_active), `${fmt(S.fraud_blocks_today)} raised today`),
      kpi('Blocked signup IPs', fmt(S.blocked_ips_total), 'cumulative'),
      kpi('Signup attempts', fmt(S.signup_attempts_today), `${fmt(S.signup_blocked_today)} rejected today`),
      kpi('Login failures', fmt(A.login_failures_today), `${loginFailRate.toFixed(1)}% of attempts`, loginFailRate < 20 ? 'good' : loginFailRate < 40 ? 'warn' : 'bad'),
      kpi('OTP attempts', fmt(A.otp_attempts_today), `${fmt(A.otp_failures_today)} failed`),
      kpi('Audit trail writes', fmt(S.audit_writes_today), 'immutable change log'),
    ]);

    // ---- Section 6: Product Development ------------------------------------
    const prodCards = kpiRows([
      kpi('Events 7d', fmt(P.events_7d), 'feature usage signal'),
      kpi('New users 24h', fmt(P.new_users_today), 'acquisition into product'),
      kpi('Weekly actives', fmt(P.active_7d), `${pct(n(P.active_7d), Math.max(1, n(P.total_users))).toFixed(1)}% of base`),
      kpi('Monthly actives', fmt(P.active_30d), `${pct(n(P.active_30d), Math.max(1, n(P.total_users))).toFixed(1)}% of base`),
    ]);

    // ---- Section 7: Customer Technology Experience --------------------------
    const cxCards = kpiRows([
      kpi('Sign-in latency', `${fmt(A.avg_login_ms_today)} ms`, 'average today', n(A.avg_login_ms_today) < 1500 ? 'good' : n(A.avg_login_ms_today) < 3000 ? 'warn' : 'bad'),
      kpi('Auth success', `${(100 - loginFailRate).toFixed(1)}%`, `${fmt(A.login_events_today)} attempts`, loginFailRate < 20 ? 'good' : 'warn'),
      kpi('Users hitting errors', fmt(E.affected_users_today), `${pct(n(E.affected_users_today), Math.max(1, n(P.active_24h))).toFixed(2)}% of actives`),
      kpi('Notification delivery', `${(100 - emailFailRate).toFixed(1)}%`, `${fmt(M.sent_today)} emails sent today`, emailFailRate < 5 ? 'good' : 'warn'),
    ]);

    // ---- Section 8: System Monitoring ---------------------------------------
    const monCards = kpiRows([
      kpi('Automation runs 24h', fmt(J.runs_24h), `${fmt(J.failed_24h)} failed`),
      kpi('Email sent 7d', fmt(M.sent_7d), `${fmt(M.failed_today)} failed today`),
      kpi('Backups 7d', fmt(B.runs_7d), `${fmt(B.failures_7d)} failures`, backupOk ? 'good' : 'bad'),
      kpi('Latest backup', B.latest?.status ? String(B.latest.status) : 'none', B.latest?.created_at ? String(B.latest.created_at).slice(0, 16).replace('T', ' ') : 'no run recorded', backupOk ? 'good' : 'bad'),
    ]);

    // ---- Section 9: Data & Analytics ----------------------------------------
    const dataCards = kpiRows([
      kpi('Public tables', fmt(S.public_tables), 'modelled entities'),
      kpi('Ledger volume', fmt(P.txn_today), 'postings today'),
      kpi('Largest table', largest[0]?.table_name ? String(largest[0].table_name) : 'n/a', largest[0] ? bytes(largest[0].bytes) : ''),
      kpi('Total storage', bytes(I.db_size_bytes), 'database on disk'),
    ]);

    // ---- Section 11: Risk register / heat map --------------------------------
    type Risk = { area: string; risk: string; likelihood: 'Low' | 'Medium' | 'High'; impact: 'Low' | 'Medium' | 'High'; action: string };
    const risks: Risk[] = [];
    if (jobFailRate >= 1) risks.push({ area: 'Automation', risk: `${fmt(J.failed_24h)} scheduled job failures in 24h`, likelihood: jobFailRate > 5 ? 'High' : 'Medium', impact: 'High', action: 'Triage failing crons and restore green runs' });
    if (errRate >= 1) risks.push({ area: 'Reliability', risk: `Client error rate at ${errRate.toFixed(2)}%`, likelihood: errRate > 3 ? 'High' : 'Medium', impact: 'Medium', action: 'Fix top defect route and redeploy' });
    if (loginFailRate >= 20) risks.push({ area: 'Access', risk: `Sign-in failure rate at ${loginFailRate.toFixed(1)}%`, likelihood: 'High', impact: 'High', action: 'Investigate credential and OTP failure causes' });
    if (rlsCoverage < 98) risks.push({ area: 'Security', risk: `${fmt(n(S.public_tables) - n(S.rls_tables))} tables without row level security`, likelihood: 'Medium', impact: 'High', action: 'Enable RLS and policies on exposed tables' });
    if (!backupOk) risks.push({ area: 'Continuity', risk: 'Backup coverage incomplete in the last 7 days', likelihood: 'Medium', impact: 'High', action: 'Restore backup schedule and verify restorability' });
    if (connSat >= 70) risks.push({ area: 'Capacity', risk: `Connection saturation at ${connSat.toFixed(0)}%`, likelihood: 'Medium', impact: 'Medium', action: 'Increase database compute or pool limits' });
    if (n(I.deadlocks) > 100) risks.push({ area: 'Concurrency', risk: `${fmt(I.deadlocks)} deadlocks since boot`, likelihood: 'Low', impact: 'Medium', action: 'Review lock ordering in high-contention writes' });
    if (!risks.length) risks.push({ area: 'General', risk: 'No material technology risk detected today', likelihood: 'Low', impact: 'Low', action: 'Maintain current controls' });
    const riskTable = table(['Area', 'Risk', 'Likelihood', 'Impact', 'Mitigation'],
      risks.map((r) => [esc(r.area), esc(r.risk), riskCell(r.likelihood), riskCell(r.impact), esc(r.action)]));

    // ---- Section 12: Compliance ----------------------------------------------
    const compTable = table(['Control', 'Status', 'Evidence'], [
      ['Row level security enforced', rlsCoverage >= 98 ? `<b style="color:${C.good}">Compliant</b>` : `<b style="color:${C.warn}">Partial</b>`, `${fmt(S.rls_tables)} of ${fmt(S.public_tables)} public tables`],
      ['Immutable audit trail', n(S.audit_writes_today) > 0 ? `<b style="color:${C.good}">Active</b>` : `<b style="color:${C.warn}">No writes today</b>`, `${fmt(S.audit_writes_today)} entries logged`],
      ['Data backup and retention', backupOk ? `<b style="color:${C.good}">Compliant</b>` : `<b style="color:${C.bad}">Attention</b>`, `${fmt(B.runs_7d)} runs, ${fmt(B.failures_7d)} failures in 7 days`],
      ['Privileged access review', n(S.privileged_accounts) <= 25 ? `<b style="color:${C.good}">Within limit</b>` : `<b style="color:${C.warn}">Review needed</b>`, `${fmt(S.privileged_accounts)} privileged accounts`],
      ['Fraud and AML controls', `<b style="color:${C.good}">Operating</b>`, `${fmt(S.fraud_blocks_active)} active identity blocks`],
      ['Double-entry financial integrity', `<b style="color:${C.good}">Enforced</b>`, `${fmt(P.txn_today)} balanced ledger postings today`],
    ]);

    // ---- Section 13: CTO KPIs -------------------------------------------------
    const kpiTable = table(['KPI', 'Today', 'Target', 'Status'], [
      ['Technology health score', String(health), '85+', health >= 85 ? `<b style="color:${C.good}">On target</b>` : `<b style="color:${C.warn}">Below target</b>`],
      ['Client error rate', `${errRate.toFixed(2)}%`, 'Below 1%', errRate < 1 ? `<b style="color:${C.good}">On target</b>` : `<b style="color:${C.warn}">Above target</b>`],
      ['Authentication success', `${(100 - loginFailRate).toFixed(1)}%`, '90%+', loginFailRate < 10 ? `<b style="color:${C.good}">On target</b>` : `<b style="color:${C.warn}">Below target</b>`],
      ['Automation success', `${(100 - jobFailRate).toFixed(1)}%`, '99%+', jobFailRate < 1 ? `<b style="color:${C.good}">On target</b>` : `<b style="color:${C.warn}">Below target</b>`],
      ['Database cache hit', `${cacheHit.toFixed(2)}%`, '99%+', cacheHit >= 99 ? `<b style="color:${C.good}">On target</b>` : `<b style="color:${C.warn}">Below target</b>`],
      ['Connection headroom', `${(100 - connSat).toFixed(0)}%`, '40%+', connSat <= 60 ? `<b style="color:${C.good}">On target</b>` : `<b style="color:${C.warn}">Tight</b>`],
      ['Notification delivery', `${(100 - emailFailRate).toFixed(1)}%`, '95%+', emailFailRate < 5 ? `<b style="color:${C.good}">On target</b>` : `<b style="color:${C.warn}">Below target</b>`],
    ]);

    // ---- Section 14: Recommendations -------------------------------------------
    const recs: string[] = [];
    if (failingJobs.length) recs.push(`Restore ${failingJobs.length} failing automation${failingJobs.length > 1 ? 's' : ''}, starting with ${esc(failingJobs[0].jobname)} (${fmt(failingJobs[0].n)} failures in 24h).`);
    if (topRoutes.length) recs.push(`Prioritise a defect fix on ${esc(topRoutes[0].route)}, which produced ${fmt(topRoutes[0].n)} client errors this week.`);
    if (loginFailRate >= 20) recs.push(`Run an authentication reliability review: ${loginFailRate.toFixed(1)}% of sign-in attempts failed today.`);
    if (rlsCoverage < 98) recs.push(`Close the security gap on ${fmt(n(S.public_tables) - n(S.rls_tables))} tables that do not yet enforce row level security.`);
    if (slow.length && n(slow[0]?.mean_ms) > 500) recs.push(`Index or refactor the slowest query path (${fmt(slow[0].mean_ms)} ms mean over ${fmt(slow[0].calls)} calls).`);
    if (!backupOk) recs.push('Re-establish verified daily backups and complete a restore drill this week.');
    if (connSat >= 70) recs.push(`Plan a compute upgrade: connection saturation is at ${connSat.toFixed(0)}%.`);
    if (emailFailRate >= 5) recs.push(`Investigate notification delivery: ${fmt(M.failed_today)} of ${fmt(M.sent_today)} emails failed today.`);
    if (!recs.length) recs.push('No corrective action required. Maintain current engineering and reliability posture.');
    const recsHtml = `<ol style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.8;color:${C.ink};">${recs.map((r) => `<li>${r}</li>`).join('')}</ol>`;

    const innovation = `
      <table role="presentation" width="100%"><tr>
        <td style="vertical-align:top;padding-right:8px;width:50%;">
          <div style="border:1px solid ${C.line};border-radius:10px;padding:14px;background:#fff;">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};">Active initiatives</div>
            <ul style="margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.7;color:${C.ink};">
              <li>Ledger-first wallet architecture with strict withdrawable enforcement</li>
              <li>Trust scoring engine driving credit and vouch limits</li>
              <li>Agent field operations with geo-verified visit capture</li>
              <li>Automated financial reconciliation and drift detection</li>
            </ul>
          </div>
        </td>
        <td style="vertical-align:top;padding-left:8px;width:50%;">
          <div style="border:1px solid ${C.line};border-radius:10px;padding:14px;background:#fff;">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:${C.muted};">Research focus</div>
            <ul style="margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.7;color:${C.ink};">
              <li>Predictive default and collection-risk modelling</li>
              <li>Low-bandwidth performance for field agents</li>
              <li>Automated anomaly detection on financial flows</li>
              <li>Scale readiness toward multi-million user load</li>
            </ul>
          </div>
        </td>
      </tr></table>`;

    const html = `
<div style="background:${C.bg};padding:22px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:860px;margin:0 auto;background:#fff;border:1px solid ${C.line};border-radius:14px;padding:26px 28px;">
    <div style="border-bottom:3px solid ${C.ink};padding-bottom:14px;">
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.muted};font-weight:800;">Welile Technologies Limited</div>
      <div style="font-size:24px;font-weight:800;color:${C.ink};margin-top:4px;">Daily Chief Technology Officer Report</div>
      <div style="font-size:12px;color:${C.muted};margin-top:4px;">Reporting day ${esc(dateStr)} (East Africa Time) · Prepared for the Chief Executive Officer and Board of Directors</div>
    </div>

    ${section('Executive Summary', 1, execSummary)}
    ${section('Platform Health Dashboard', 2, platformCards + trendChart)}
    ${section('Infrastructure Operations', 3, infraCards + storageChart + `<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Failing automations — last 24 hours</div>${jobTable}</div>`)}
    ${section('Engineering Performance', 4, engCards + `<div style="margin-top:14px;">${routeTable}</div><div style="margin-top:14px;">${msgTable}</div><div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Slowest database operations</div>${slowTable}</div>`)}
    ${section('Cybersecurity Dashboard', 5, secCards)}
    ${section('Product Development', 6, prodCards)}
    ${section('Customer Technology Experience', 7, cxCards)}
    ${section('System Monitoring', 8, monCards)}
    ${section('Data and Analytics', 9, dataCards)}
    ${section('Innovation and Research', 10, innovation)}
    ${section('Technology Risk Register', 11, riskTable)}
    ${section('Compliance', 12, compTable)}
    ${section('CTO Executive KPIs', 13, kpiTable)}
    ${section('Strategic Recommendations and Action Items', 14, recsHtml)}

    <div style="margin-top:26px;border-top:1px solid ${C.line};padding-top:12px;font-size:11px;color:${C.muted};">
      Generated automatically from live production telemetry at ${esc(String(d.generated_at || '').slice(0, 19).replace('T', ' '))} UTC. Overall technology health score: ${health} of 100 (${healthLabel}).
    </div>
  </div>
</div>`;

    const text = [
      `Daily CTO Report — ${dateStr}`,
      `Technology health score: ${health}/100 (${healthLabel})`,
      `Active 24h: ${fmt(P.active_24h)} | Events: ${fmt(P.events_today)} | Ledger postings: ${fmt(P.txn_today)}`,
      `Errors today: ${fmt(E.today)} (${delta(n(E.today), n(E.prev_day))}) | Error rate: ${errRate.toFixed(2)}%`,
      `Auth success: ${(100 - loginFailRate).toFixed(1)}% | Avg sign-in: ${fmt(A.avg_login_ms_today)} ms`,
      `Jobs: ${fmt(J.runs_24h)} runs, ${fmt(J.failed_24h)} failed (${jobFailRate.toFixed(1)}%)`,
      `Database: ${bytes(I.db_size_bytes)} | Cache hit ${cacheHit.toFixed(2)}% | Connections ${fmt(I.connections)}/${fmt(I.max_connections)}`,
      '',
      'Recommendations:',
      ...recs.map((r, i) => `${i + 1}. ${r.replace(/<[^>]+>/g, '')}`),
    ].join('\n');

    // ---- Downloadable PDF attachment ------------------------------------
    const pdfBytes = await buildCtoPdf({
      dateStr,
      generatedAt: String(d.generated_at || '').slice(0, 19).replace('T', ' '),
      health, healthLabel,
      scoreParts: scoreParts.map((p) => ({ label: p.label, weight: p.w, value: Math.round(p.v) })),
      summaryPoints,
      platform: [
        ['Total users', fmt(P.total_users)], ['New users today', fmt(P.new_users_today)],
        ['Active 24h', fmt(P.active_24h)], ['Active 7d', fmt(P.active_7d)],
        ['Active 30d', fmt(P.active_30d)], ['System events today', fmt(P.events_today)],
        ['Events vs prior day', delta(n(P.events_today), n(P.events_prev_day))],
        ['Ledger postings today', fmt(P.txn_today)],
        ['Client errors today', fmt(E.today)], ['Client error rate', `${errRate.toFixed(2)}%`],
        ['Users affected by errors', fmt(E.affected_users_today)], ['Browser compat events 7d', fmt(E.compat_events_7d)],
      ],
      errorTrend: trend.map((t: any) => ({ label: String(t.d), value: n(t.n) })),
      infra: [
        ['Database size', bytes(I.db_size_bytes)], ['Cache hit ratio', `${cacheHit.toFixed(2)}%`],
        ['Connections', `${fmt(I.connections)} / ${fmt(I.max_connections)}`], ['Connection saturation', `${connSat.toFixed(0)}%`],
        ['Uptime hours', fmt(I.uptime_hours)], ['Deadlocks since boot', fmt(I.deadlocks)],
        ['Commits', fmt(I.commits)], ['Rolled-back transactions', fmt(I.rollbacks)],
        ['Scheduled automations', fmt(J.total_scheduled)], ['Automation runs 24h', fmt(J.runs_24h)],
        ['Failed runs 24h', fmt(J.failed_24h)], ['Automation failure rate', `${jobFailRate.toFixed(1)}%`],
      ],
      largestTables: largest.map((t: any) => ({ label: String(t.table_name), value: n(t.bytes), display: bytes(t.bytes) })),
      failingJobs: failingJobs.map((j: any) => [String(j.jobname), fmt(j.n), String(j.last_error || '').replace(/\s+/g, ' ')]),
      topRoutes: topRoutes.map((r: any) => [String(r.route), fmt(r.n)]),
      topMessages: topMsgs.map((m: any) => [String(m.message), fmt(m.n)]),
      slowQueries: slow.map((q: any) => [String(q.query).replace(/\s+/g, ' '), fmt(q.mean_ms), fmt(q.calls)]),
      security: [
        ['RLS coverage', `${rlsCoverage.toFixed(1)}%`], ['Tables with RLS', `${fmt(S.rls_tables)} of ${fmt(S.public_tables)}`],
        ['Privileged accounts', fmt(S.privileged_accounts)], ['Active fraud blocks', fmt(S.fraud_blocks_active)],
        ['Fraud blocks raised today', fmt(S.fraud_blocks_today)], ['Blocked signup IPs', fmt(S.blocked_ips_total)],
        ['Signup attempts today', fmt(S.signup_attempts_today)], ['Signups rejected today', fmt(S.signup_blocked_today)],
        ['Login failures today', fmt(A.login_failures_today)], ['Login failure rate', `${loginFailRate.toFixed(1)}%`],
        ['OTP attempts today', fmt(A.otp_attempts_today)], ['Audit writes today', fmt(S.audit_writes_today)],
      ],
      experience: [
        ['Average sign-in latency', `${fmt(A.avg_login_ms_today)} ms`], ['Authentication success', `${(100 - loginFailRate).toFixed(1)}%`],
        ['Weekly active share', `${pct(n(P.active_7d), Math.max(1, n(P.total_users))).toFixed(1)}%`],
        ['Monthly active share', `${pct(n(P.active_30d), Math.max(1, n(P.total_users))).toFixed(1)}%`],
        ['Emails sent today', fmt(M.sent_today)], ['Emails failed today', fmt(M.failed_today)],
        ['Notification delivery', `${(100 - emailFailRate).toFixed(1)}%`], ['Emails sent 7d', fmt(M.sent_7d)],
        ['Backup runs 7d', fmt(B.runs_7d)], ['Backup failures 7d', fmt(B.failures_7d)],
        ['Latest backup status', B.latest?.status ? String(B.latest.status) : 'none'],
        ['Latest backup at', B.latest?.created_at ? String(B.latest.created_at).slice(0, 16).replace('T', ' ') : 'no run recorded'],
      ],
      risks: risks.map((r) => [r.area, r.risk, r.likelihood, r.impact, r.action]),
      compliance: [
        ['Row level security enforced', rlsCoverage >= 98 ? 'Compliant' : 'Partial', `${fmt(S.rls_tables)} of ${fmt(S.public_tables)} public tables`],
        ['Immutable audit trail', n(S.audit_writes_today) > 0 ? 'Active' : 'No writes today', `${fmt(S.audit_writes_today)} entries logged`],
        ['Data backup and retention', backupOk ? 'Compliant' : 'Attention', `${fmt(B.runs_7d)} runs, ${fmt(B.failures_7d)} failures in 7 days`],
        ['Privileged access review', n(S.privileged_accounts) <= 25 ? 'Within limit' : 'Review needed', `${fmt(S.privileged_accounts)} privileged accounts`],
        ['Fraud and AML controls', 'Operating', `${fmt(S.fraud_blocks_active)} active identity blocks`],
        ['Double-entry financial integrity', 'Enforced', `${fmt(P.txn_today)} balanced ledger postings today`],
      ],
      kpis: [
        ['Technology health score', String(health), '85+'],
        ['Client error rate', `${errRate.toFixed(2)}%`, 'Below 1%'],
        ['Authentication success', `${(100 - loginFailRate).toFixed(1)}%`, '90%+'],
        ['Automation success', `${(100 - jobFailRate).toFixed(1)}%`, '99%+'],
        ['Database cache hit', `${cacheHit.toFixed(2)}%`, '99%+'],
        ['Connection headroom', `${(100 - connSat).toFixed(0)}%`, '40%+'],
        ['Notification delivery', `${(100 - emailFailRate).toFixed(1)}%`, '95%+'],
      ],
      recommendations: recs.map((r) => r.replace(/<[^>]+>/g, '')),
    });
    const pdfName = `Welile_Daily_CTO_Report_${dateStr}.pdf`;

    // Preview mode: return the PDF itself instead of emailing it.
    if (body?.preview === true) {
      return new Response(pdfBytes, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pdfName}"` },
      });
    }

    const form = new FormData();
    form.append('from', FROM);
    for (const r of recipients) form.append('to', r);
    form.append('h:Reply-To', REPLY_TO);
    form.append('subject', `Daily CTO Report — ${dateStr} — Health ${health}/100 (${healthLabel})`);
    form.append('text', text);
    form.append('html', html);
    form.append('attachment', new Blob([pdfBytes], { type: 'application/pdf' }), pdfName);

    const mgRes = await fetch(`${mgBase}/v3/${mgDomain}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${mgKey}`)}` },
      body: form,
    });
    if (!mgRes.ok) {
      const errBody = await mgRes.text();
      console.error(`[daily-cto-report] Mailgun ${mgRes.status}: ${errBody}`);
      return new Response(JSON.stringify({ error: 'mailgun_failed', status: mgRes.status, details: errBody }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, date: dateStr, recipients, health, risks: risks.length, attachment: pdfName, pdf_bytes: pdfBytes.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[daily-cto-report] error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// PDF renderer (pdf-lib). A4 portrait, auto page-break, no emojis, no images.
// ============================================================================

interface PdfArgs {
  dateStr: string;
  generatedAt: string;
  health: number;
  healthLabel: string;
  scoreParts: { label: string; weight: number; value: number }[];
  summaryPoints: string[];
  platform: [string, string][];
  errorTrend: { label: string; value: number }[];
  infra: [string, string][];
  largestTables: { label: string; value: number; display: string }[];
  failingJobs: string[][];
  topRoutes: string[][];
  topMessages: string[][];
  slowQueries: string[][];
  security: [string, string][];
  experience: [string, string][];
  risks: string[][];
  compliance: string[][];
  kpis: string[][];
  recommendations: string[];
}

async function buildCtoPdf(a: PdfArgs): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28, H = 841.89, margin = 40;
  const col = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);
  const ink = col(15, 23, 42);
  const muted = col(100, 116, 139);
  const line = col(226, 232, 240);
  const soft = col(248, 250, 252);
  const brand = col(11, 95, 255);
  const good = col(15, 157, 88);
  const warn = col(199, 119, 0);
  const bad = col(192, 57, 43);
  const tone = (v: number) => (v >= 85 ? good : v >= 70 ? warn : bad);

  let page = doc.addPage([W, H]);
  let y = 0;
  let pageNo = 0;

  const clip = (s: string, f: any, size: number, maxW: number) => {
    let t = String(s ?? '');
    if (f.widthOfTextAtSize(t, size) <= maxW) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + '...', size) > maxW) t = t.slice(0, -1);
    return t + '...';
  };
  const wrap = (s: string, f: any, size: number, maxW: number) => {
    const raw = String(s ?? '').split(/\s+/);
    // hard-break tokens longer than the column (SQL text, identifiers)
    const words: string[] = [];
    for (const w of raw) {
      let t = w;
      while (f.widthOfTextAtSize(t, size) > maxW) {
        let cut = 1;
        while (cut < t.length && f.widthOfTextAtSize(t.slice(0, cut + 1), size) <= maxW) cut += 1;
        words.push(t.slice(0, cut));
        t = t.slice(cut);
      }
      if (t) words.push(t);
    }
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else { cur = t; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const header = () => {
    pageNo += 1;
    page.drawRectangle({ x: 0, y: H - 86, width: W, height: 86, color: ink });
    page.drawText('WELILE TECHNOLOGIES LIMITED', { x: margin, y: H - 34, size: 8.5, font: bold, color: col(148, 163, 184) });
    page.drawText('Daily Chief Technology Officer Report', { x: margin, y: H - 56, size: 16, font: bold, color: col(255, 255, 255) });
    page.drawText(`Reporting day ${a.dateStr} (EAT)  |  Health score ${a.health}/100 (${a.healthLabel})`, { x: margin, y: H - 74, size: 8.5, font, color: col(203, 213, 225) });
    const pn = `Page ${pageNo}`;
    page.drawText(pn, { x: W - margin - bold.widthOfTextAtSize(pn, 8.5), y: H - 74, size: 8.5, font: bold, color: col(203, 213, 225) });
    y = H - 86 - 24;
  };
  const footer = () => {
    page.drawLine({ start: { x: margin, y: 38 }, end: { x: W - margin, y: 38 }, color: line, thickness: 0.6 });
    page.drawText('Confidential - prepared for the Chief Executive Officer and Board of Directors', { x: margin, y: 25, size: 7.5, font, color: muted });
  };
  const newPage = () => { footer(); page = doc.addPage([W, H]); header(); };
  const ensure = (h: number) => { if (y - h < 56) newPage(); };

  header();

  const sectionTitle = (num: number, label: string) => {
    ensure(34);
    page.drawText(`${num}. ${label.toUpperCase()}`, { x: margin, y: y - 11, size: 9.5, font: bold, color: ink });
    page.drawLine({ start: { x: margin, y: y - 17 }, end: { x: W - margin, y: y - 17 }, color: ink, thickness: 1.2 });
    y -= 28;
  };

  const bars = (rows: { label: string; value: number; display?: string }[], maxOverride?: number, toned = false) => {
    const max = maxOverride ?? Math.max(1, ...rows.map((r) => r.value));
    const labelW = 140, valW = 62;
    const trackW = W - margin * 2 - labelW - valW;
    for (const r of rows) {
      ensure(16);
      page.drawText(clip(r.label, font, 8, labelW - 6), { x: margin, y: y - 9, size: 8, font, color: muted });
      page.drawRectangle({ x: margin + labelW, y: y - 12, width: trackW, height: 9, color: soft });
      const w = Math.max(2, (r.value / max) * trackW);
      page.drawRectangle({ x: margin + labelW, y: y - 12, width: w, height: 9, color: toned ? tone(r.value) : brand });
      const disp = r.display ?? r.value.toLocaleString('en-UG');
      page.drawText(disp, { x: W - margin - bold.widthOfTextAtSize(disp, 8), y: y - 9, size: 8, font: bold, color: ink });
      y -= 14;
    }
    y -= 6;
  };

  const kpiGrid = (items: [string, string][]) => {
    const perRow = 3, gutter = 8;
    const cardW = (W - margin * 2 - gutter * (perRow - 1)) / perRow;
    const cardH = 42;
    for (let i = 0; i < items.length; i += perRow) {
      ensure(cardH + 8);
      const row = items.slice(i, i + perRow);
      row.forEach((it, ix) => {
        const x = margin + ix * (cardW + gutter);
        page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: soft, borderColor: line, borderWidth: 0.6 });
        page.drawRectangle({ x, y: y - cardH, width: 2.5, height: cardH, color: brand });
        page.drawText(clip(it[0].toUpperCase(), bold, 6.5, cardW - 14), { x: x + 9, y: y - 15, size: 6.5, font: bold, color: muted });
        let vs = 12;
        while (vs > 7 && bold.widthOfTextAtSize(it[1], vs) > cardW - 18) vs -= 0.5;
        page.drawText(it[1], { x: x + 9, y: y - 32, size: vs, font: bold, color: ink });
      });
      y -= cardH + gutter;
    }
    y -= 2;
  };

  const grid = (headers: string[], rows: string[][], weights: number[]) => {
    if (!rows.length) {
      ensure(18);
      page.drawText('No records for this period.', { x: margin, y: y - 10, size: 8.5, font, color: muted });
      y -= 20;
      return;
    }
    const tw = W - margin * 2;
    const colW = weights.map((w) => tw * w);
    const drawHead = () => {
      ensure(18);
      page.drawRectangle({ x: margin, y: y - 15, width: tw, height: 15, color: soft });
      let cx = margin;
      headers.forEach((h, i) => {
        page.drawText(clip(h.toUpperCase(), bold, 7, colW[i] - 10), { x: cx + 5, y: y - 11, size: 7, font: bold, color: muted });
        cx += colW[i];
      });
      y -= 15;
    };
    drawHead();
    rows.forEach((r, ri) => {
      const cellLines = r.map((c, i) => wrap(String(c ?? ''), font, 8, colW[i] - 10).slice(0, 3));
      const rowH = Math.max(15, 4 + cellLines.reduce((m, l) => Math.max(m, l.length), 1) * 9.5);
      if (y - rowH < 56) { newPage(); drawHead(); }
      if (ri % 2 === 1) page.drawRectangle({ x: margin, y: y - rowH, width: tw, height: rowH, color: col(252, 252, 254) });
      let cx = margin;
      cellLines.forEach((lines, i) => {
        lines.forEach((ln, li) => {
          page.drawText(ln, { x: cx + 5, y: y - 11 - li * 9.5, size: 8, font: i === 0 ? bold : font, color: ink });
        });
        cx += colW[i];
      });
      page.drawLine({ start: { x: margin, y: y - rowH }, end: { x: W - margin, y: y - rowH }, color: line, thickness: 0.5 });
      y -= rowH;
    });
    y -= 10;
  };

  // 1. Executive summary
  sectionTitle(1, 'Executive Summary');
  ensure(70);
  const boxH = 56;
  page.drawRectangle({ x: margin, y: y - boxH, width: 120, height: boxH, color: soft, borderColor: tone(a.health), borderWidth: 2 });
  page.drawText(String(a.health), { x: margin + 12, y: y - 36, size: 28, font: bold, color: tone(a.health) });
  page.drawText('/ 100', { x: margin + 12 + bold.widthOfTextAtSize(String(a.health), 28) + 5, y: y - 36, size: 10, font: bold, color: muted });
  page.drawText(`HEALTH: ${a.healthLabel.toUpperCase()}`, { x: margin + 12, y: y - 50, size: 7, font: bold, color: muted });
  let sy = y - 8;
  for (const p of a.summaryPoints.slice(0, 3)) {
    for (const ln of wrap(p, font, 8, W - margin * 2 - 136)) {
      page.drawText(ln, { x: margin + 132, y: sy - 4, size: 8, font, color: ink });
      sy -= 10;
    }
    sy -= 2;
  }
  y = Math.min(y - boxH, sy) - 12;
  for (const p of a.summaryPoints.slice(3)) {
    for (const ln of wrap(`- ${p}`, font, 8, W - margin * 2)) {
      ensure(12);
      page.drawText(ln, { x: margin, y: y - 8, size: 8, font, color: ink });
      y -= 10;
    }
  }
  y -= 8;
  bars(a.scoreParts.map((s) => ({ label: `${s.label} (${s.weight}%)`, value: s.value, display: String(s.value) })), 100, true);

  // 2. Platform health
  sectionTitle(2, 'Platform Health Dashboard');
  kpiGrid(a.platform);
  if (a.errorTrend.length) {
    ensure(20);
    page.drawText('CLIENT ERROR TREND - LAST 14 DAYS', { x: margin, y: y - 9, size: 7, font: bold, color: muted });
    y -= 16;
    bars(a.errorTrend);
  }

  // 3. Infrastructure
  sectionTitle(3, 'Infrastructure Operations');
  kpiGrid(a.infra);
  if (a.largestTables.length) {
    ensure(20);
    page.drawText('STORAGE FOOTPRINT - LARGEST TABLES', { x: margin, y: y - 9, size: 7, font: bold, color: muted });
    y -= 16;
    bars(a.largestTables);
  }
  ensure(20);
  page.drawText('FAILING AUTOMATIONS - LAST 24 HOURS', { x: margin, y: y - 9, size: 7, font: bold, color: muted });
  y -= 16;
  grid(['Automation', 'Failures', 'Last error'], a.failingJobs, [0.3, 0.12, 0.58]);

  // 4. Engineering performance
  sectionTitle(4, 'Engineering Performance');
  grid(['Route', 'Errors (7d)'], a.topRoutes, [0.75, 0.25]);
  grid(['Most frequent error', 'Occurrences (7d)'], a.topMessages, [0.75, 0.25]);
  grid(['Slowest database operation', 'Mean ms', 'Calls'], a.slowQueries, [0.62, 0.19, 0.19]);

  // 5. Cybersecurity
  sectionTitle(5, 'Cybersecurity Dashboard');
  kpiGrid(a.security);

  // 6-9. Experience, monitoring, data
  sectionTitle(6, 'Customer Experience, Monitoring and Data');
  kpiGrid(a.experience);

  // 7. Risk register
  sectionTitle(7, 'Technology Risk Register');
  grid(['Area', 'Risk', 'Likelihood', 'Impact', 'Mitigation'], a.risks, [0.14, 0.32, 0.13, 0.11, 0.3]);

  // 8. Compliance
  sectionTitle(8, 'Compliance');
  grid(['Control', 'Status', 'Evidence'], a.compliance, [0.36, 0.19, 0.45]);

  // 9. KPIs
  sectionTitle(9, 'CTO Executive KPIs');
  grid(['KPI', 'Today', 'Target'], a.kpis, [0.5, 0.25, 0.25]);

  // 10. Recommendations
  sectionTitle(10, 'Strategic Recommendations and Action Items');
  a.recommendations.forEach((r, i) => {
    const lines = wrap(`${i + 1}. ${r}`, font, 8.5, W - margin * 2 - 10);
    ensure(lines.length * 11 + 6);
    lines.forEach((ln, li) => {
      page.drawText(ln, { x: margin + (li ? 12 : 0), y: y - 9, size: 8.5, font: li ? font : bold, color: ink });
      y -= 11;
    });
    y -= 4;
  });

  ensure(24);
  page.drawText(`Generated from live production telemetry at ${a.generatedAt} UTC.`, { x: margin, y: y - 10, size: 7.5, font, color: muted });
  footer();

  return await doc.save();
}
