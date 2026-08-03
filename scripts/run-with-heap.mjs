#!/usr/bin/env node
/**
 * Cross-platform heap-cap wrapper.
 *
 * Guarantees an 8 GB V8 old-space cap for every child process in the build
 * pipeline, regardless of shell (POSIX `VAR=x cmd` syntax does not work on
 * Windows/cmd and is not applied by some CI runners that invoke scripts with
 * their own shell). Existing NODE_OPTIONS are preserved, but any inherited
 * `--max-old-space-size` is replaced so a smaller ambient cap (some CI images
 * export one globally) can never shrink the build heap.
 *
 * Usage: node scripts/run-with-heap.mjs <command> [args...]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEAP_MB = Number(process.env.BUILD_HEAP_MB || 8192);
const [rawCommand, ...rawArgs] = process.argv.slice(2);

if (!rawCommand) {
  console.error('[heap] usage: node scripts/run-with-heap.mjs <command> [args...]');
  process.exit(1);
}

// Always execute through this Node binary so NODE_OPTIONS is guaranteed to apply.
// Shell shims (npx / node_modules/.bin) can re-exec through another runtime
// (bun, for example) that ignores NODE_OPTIONS, which is how a smaller ambient
// heap cap silently survives into the build.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveJsEntry(name) {
  const candidates = [
    path.join(projectRoot, 'node_modules', name, 'bin', `${name}.js`),
    path.join(projectRoot, 'node_modules', name, 'bin', `${name}.mjs`),
    path.join(projectRoot, 'node_modules', '.bin', name),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

let command = rawCommand;
let args = rawArgs;

if (rawCommand !== 'node' && rawCommand !== process.execPath) {
  const entry = resolveJsEntry(rawCommand);
  if (!entry) {
    console.error(`[heap] could not resolve local executable "${rawCommand}"`);
    process.exit(1);
  }
  command = process.execPath;
  args = [entry, ...rawArgs];
} else {
  command = process.execPath;
}

const existing = process.env.NODE_OPTIONS ?? '';
const inherited = /--max-old-space-size=(\d+)/.exec(existing);
const heapMb = inherited ? Math.max(HEAP_MB, Number(inherited[1])) : HEAP_MB;
const nodeOptions = `${existing.replace(/--max-old-space-size=\d+/g, '').trim()} --max-old-space-size=${heapMb}`.trim();

console.log(`[heap] NODE_OPTIONS="${nodeOptions}" -> ${command} ${args.join(' ')}`);

const child = spawn(command, args, {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

child.on('error', (error) => {
  console.error(`[heap] failed to start "${command}":`, error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[heap] "${command}" terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
