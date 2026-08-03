#!/usr/bin/env node
/**
 * Cross-platform heap-cap wrapper.
 *
 * Guarantees an 8 GB V8 old-space cap for every child process in the build
 * pipeline, regardless of shell (POSIX `VAR=x cmd` syntax does not work on
 * Windows/cmd and is not applied by some CI runners that invoke scripts with
 * their own shell). Existing NODE_OPTIONS are preserved; the flag is only
 * appended when the caller has not already set a max-old-space-size.
 *
 * Usage: node scripts/run-with-heap.mjs <command> [args...]
 */
import { spawn } from 'node:child_process';

const HEAP_MB = Number(process.env.BUILD_HEAP_MB || 8192);
const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('[heap] usage: node scripts/run-with-heap.mjs <command> [args...]');
  process.exit(1);
}

const existing = process.env.NODE_OPTIONS ?? '';
const nodeOptions = /--max-old-space-size=/.test(existing)
  ? existing
  : `${existing} --max-old-space-size=${HEAP_MB}`.trim();

console.log(`[heap] NODE_OPTIONS="${nodeOptions}" -> ${command} ${args.join(' ')}`);

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
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
