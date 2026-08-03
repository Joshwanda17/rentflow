#!/usr/bin/env node
/**
 * Publish diagnostics report.
 *
 * Records, in one artifact: (1) the publish request ID for this attempt,
 * (2) the deterministic build artifact hash of dist/, and (3) the
 * hosting-stage HTTP responses (canonical origin + the previously deployed
 * copy of this report). Comparing the local artifact hash with the hash
 * served live pinpoints whether the hosting/CDN stage actually received the
 * build, which is invisible when the root URL happily serves 200.
 *
 * Outputs: build-logs/publish-diagnostics.txt, build-logs/publish-diagnostics.json,
 * dist/publish-diagnostics.json (ships so it can be fetched live).
 *
 * Never fails the build unless --strict is passed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CANONICAL_ORIGIN } from './site-domains.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(repoRoot, 'dist');
const logDir = path.resolve(repoRoot, 'build-logs');
const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const skipProbe = argv.includes('--no-probe') || process.env.PUBLISH_DIAGNOSTICS_PROBE === '0';
const PROBE_TIMEOUT_MS = Number(process.env.PUBLISH_DIAGNOSTICS_TIMEOUT_MS || 12000);

function publishRequestId() {
  const provided =
    process.env.LOVABLE_PUBLISH_ID ||
    process.env.LOVABLE_DEPLOY_ID ||
    process.env.LOVABLE_REQUEST_ID ||
    process.env.DEPLOYMENT_ID ||
    process.env.GITHUB_RUN_ID;
  if (provided) return { id: String(provided).trim(), source: 'environment' };
  return { id: `local-${randomUUID()}`, source: 'generated (no platform publish ID in env)' };
}

function gitInfo() {
  const read = (args) => {
    try {
      return execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  };
  return { commit: read(['rev-parse', 'HEAD']), branch: read(['rev-parse', '--abbrev-ref', 'HEAD']) };
}

function collectFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) collectFiles(full, base, out);
    else out.push({ rel: path.relative(base, full).split(path.sep).join('/'), size: stats.size, full });
  }
  return out;
}

// Files that carry the diagnostics themselves are excluded from the artifact
// hash so the hash stays a pure function of the built application output.
function isDiagnosticFile(rel) {
  return rel === 'publish-diagnostics.json' || rel.startsWith('_deploy/');
}

function artifactFingerprint() {
  if (!existsSync(dist)) return { present: false, files: 0, bytes: 0, hash: null, entryHtmlHash: null };
  const files = collectFiles(dist).filter((f) => !isDiagnosticFile(f.rel));
  const manifest = createHash('sha256');
  let bytes = 0;
  for (const file of files) {
    const fileHash = createHash('sha256').update(readFileSync(file.full)).digest('hex');
    manifest.update(`${file.rel}:${fileHash}\n`);
    bytes += file.size;
  }
  const indexPath = path.join(dist, 'index.html');
  return {
    present: true,
    files: files.length,
    bytes,
    hash: manifest.digest('hex'),
    entryHtmlHash: existsSync(indexPath)
      ? createHash('sha256').update(readFileSync(indexPath)).digest('hex')
      : null,
  };
}

const INTERESTING_HEADERS = [
  'content-type',
  'content-length',
  'cache-control',
  'age',
  'etag',
  'last-modified',
  'x-cache',
  'x-served-by',
  'cf-ray',
  'server',
];

async function probe(label, url, { json = false } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: controller.signal,
    });
    const body = await res.text();
    const headers = {};
    for (const name of INTERESTING_HEADERS) {
      const value = res.headers.get(name);
      if (value) headers[name] = value;
    }
    let parsed = null;
    if (json) {
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
    }
    return {
      label,
      url,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      finalUrl: res.url,
      redirected: res.redirected,
      ms: Date.now() - started,
      bytes: Buffer.byteLength(body),
      headers,
      json: parsed,
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      status: 0,
      statusText:
        error?.name === 'AbortError'
          ? `timeout after ${PROBE_TIMEOUT_MS}ms`
          : String(error?.message || error),
      ms: Date.now() - started,
      headers: {},
      json: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function verdict(report) {
  if (report.probesSkipped) return 'hosting probes skipped — local artifact fingerprint recorded only';
  const root = report.hosting.find((p) => p.label === 'canonical origin');
  const live = report.hosting.find((p) => p.label === 'deployed diagnostics report');
  if (!root?.ok) {
    return `HOSTING STAGE UNREACHABLE — canonical origin returned ${root?.status || 0} (${root?.statusText})`;
  }
  if (!live?.ok || !live.json?.artifact?.hash) {
    return 'ROOT SERVES 200 BUT NO DEPLOYED DIAGNOSTICS REPORT — either the last publish never uploaded this artifact (deploy stage failed after a green build) or this is the first build carrying the report';
  }
  if (live.json.artifact.hash === report.artifact.hash) {
    return 'LIVE ARTIFACT MATCHES LOCAL BUILD — hosting stage received and is serving this exact build';
  }
  return `LIVE ARTIFACT IS STALE — live hash ${live.json.artifact.hash.slice(0, 16)}… from publish ${live.json.publishRequestId} != this build ${String(report.artifact.hash).slice(0, 16)}…; the upload/CDN stage, not the build, is dropping the new artifact`;
}

function renderText(report) {
  const lines = [];
  const rule = '='.repeat(72);
  lines.push(rule, 'PUBLISH DIAGNOSTICS REPORT', rule);
  lines.push(`generated at        : ${report.generatedAt}`);
  lines.push(`publish request ID  : ${report.publishRequestId}  (${report.publishRequestIdSource})`);
  lines.push(`git commit / branch : ${report.git.commit || 'unknown'} / ${report.git.branch || 'unknown'}`);
  lines.push(`node / platform     : ${report.runtime.node} on ${report.runtime.platform}`);
  lines.push('');
  lines.push('-- BUILD ARTIFACT ------------------------------------------------------');
  lines.push(`dist present        : ${report.artifact.present}`);
  lines.push(`artifact hash       : ${report.artifact.hash || 'n/a'}`);
  lines.push(`index.html hash     : ${report.artifact.entryHtmlHash || 'n/a'}`);
  lines.push(`files / bytes       : ${report.artifact.files} files / ${report.artifact.bytes} bytes`);
  lines.push('');
  lines.push('-- HOSTING STAGE RESPONSES --------------------------------------------');
  if (report.probesSkipped) {
    lines.push('(probes skipped)');
  } else {
    for (const p of report.hosting) {
      lines.push(`[${p.status || 'ERR'}] ${p.label}`);
      lines.push(`      url        : ${p.url}`);
      if (p.finalUrl && p.finalUrl !== p.url) lines.push(`      final url  : ${p.finalUrl}`);
      lines.push(`      result     : ${p.ok ? 'ok' : 'FAILED'} ${p.statusText || ''} in ${p.ms}ms`);
      for (const [k, v] of Object.entries(p.headers)) lines.push(`      ${k.padEnd(11)}: ${v}`);
      if (p.json?.artifact?.hash) lines.push(`      live hash  : ${p.json.artifact.hash}`);
      if (p.json?.publishRequestId) lines.push(`      live pubID : ${p.json.publishRequestId}`);
      lines.push('');
    }
  }
  lines.push('-- VERDICT ------------------------------------------------------------');
  lines.push(report.verdict);
  lines.push(rule);
  return lines.join('\n');
}

async function main() {
  const { id, source } = publishRequestId();
  const report = {
    generatedAt: new Date().toISOString(),
    publishRequestId: id,
    publishRequestIdSource: source,
    git: gitInfo(),
    runtime: { node: process.version, platform: `${process.platform}/${process.arch}` },
    artifact: artifactFingerprint(),
    probesSkipped: skipProbe,
    hosting: [],
    verdict: '',
  };

  if (!skipProbe) {
    report.hosting = [
      await probe('canonical origin', `${CANONICAL_ORIGIN}/?publish-diagnostics=${encodeURIComponent(id)}`),
      await probe('deployed diagnostics report', `${CANONICAL_ORIGIN}/publish-diagnostics.json`, { json: true }),
      await probe('deployed build log', `${CANONICAL_ORIGIN}/build-log.txt`),
      await probe('sitemap', `${CANONICAL_ORIGIN}/sitemap.xml`),
    ];
  }
  report.verdict = verdict(report);

  mkdirSync(logDir, { recursive: true });
  const text = renderText(report);
  writeFileSync(path.join(logDir, 'publish-diagnostics.txt'), `${text}\n`, 'utf8');
  writeFileSync(path.join(logDir, 'publish-diagnostics.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (report.artifact.present) {
    writeFileSync(path.join(dist, 'publish-diagnostics.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(text);
}

main().catch((error) => {
  console.warn(`[publish-diagnostics] non-fatal failure: ${error?.message || error}`);
  if (strict) process.exitCode = 1;
});