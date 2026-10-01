#!/usr/bin/env node
// Test Runner cho Frontend Hugo Music
// Tuân thủ Rule #5: Đặt các script dài trong thư mục scripts thay vì dồn vào package.json
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const steps = [
  { name: 'TypeScript Typecheck', cmd: 'npx', args: ['tsc', '--noEmit'] },
  { name: 'Transition Plan Integrity', cmd: 'node', args: ['--no-warnings', 'scripts/check-transition-plan.mjs'] },
  { name: 'LRC Parser Verification', cmd: 'node', args: ['--no-warnings', 'scripts/check-lrc.mjs'] },
  { name: 'Release Date Formatting', cmd: 'node', args: ['--no-warnings', 'scripts/check-date.mjs'] },
  { name: 'State Sync Integrity', cmd: 'node', args: ['--no-warnings', 'scripts/check-sync.mjs'] },
  { name: 'Multi-CDN Steering (EWMA + circuit breaker)', cmd: 'node', args: ['--no-warnings', 'scripts/check-cdn.mjs'] },
  { name: 'Client Network Layer (retry/timeout/ETag)', cmd: 'node', args: ['--no-warnings', 'scripts/check-net.mjs'] },
];

console.log('🧪 Bắt đầu chạy bộ kiểm thử Frontend (Hugo Music)...');

for (const step of steps) {
  process.stdout.write(` ▶ [${step.name}] `);
  const res = spawnSync(step.cmd, step.args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (res.status !== 0) {
    console.error(`\n❌ Thất bại tại bước: ${step.name}`);
    process.exit(res.status || 1);
  }
}

console.log('\n✅ Toàn bộ các bước kiểm thử Frontend đã vượt qua thành công!');
