#!/usr/bin/env node
// Client test runner — discovers checks/*.check.mjs (a new check runs without touching this file),
// after the TypeScript typecheck and a freshness check of the generated component docs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = fs.readdirSync(path.join(root, 'checks')).filter((f) => f.endsWith('.check.mjs')).sort();
const steps = [
  { name: 'typecheck', cmd: 'npx', args: ['tsc', '--noEmit'] },
  { name: 'component docs up to date', cmd: 'node', args: ['scripts/gen-component-docs.mjs', '--check'] },
  ...checks.map((f) => ({ name: f, cmd: 'node', args: ['--no-warnings', path.join('checks', f)] })),
];

console.log(`Client tests: ${steps.length} discovered`);
let failed = 0;
for (const step of steps) {
  const t0 = Date.now();
  const res = spawnSync(step.cmd, step.args, { cwd: root, encoding: 'utf8', env: process.env });
  const ok = res.status === 0;
  console.log(` ${ok ? '✓' : '✗'} ${step.name} (${Date.now() - t0} ms)`);
  if (!ok) {
    failed++;
    process.stdout.write((res.stdout || '') + (res.stderr || ''));
  }
}
if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll client tests passed');
