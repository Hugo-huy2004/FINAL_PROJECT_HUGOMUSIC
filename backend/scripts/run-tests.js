#!/usr/bin/env node
// Test Runner cho Backend Hugo Music
// Tuân thủ Rule #5: Đặt các script dài trong thư mục scripts thay vì dồn vào package.json
const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const steps = [
  { name: 'Playback Token Security (Test)', cmd: 'node', args: ['utils/playbackToken.test.js'] },
  { name: 'Multi-CDN Signing (Cloudflare + Bunny)', cmd: 'node', args: ['utils/cdnSources.js'] },
  { name: 'Shared Collections (kindScope)', cmd: 'node', args: ['models/kindScope.js'] },
  { name: 'Socket Events Catalog', cmd: 'node', args: ['sockets/events.js'] },
  { name: 'API Docs Generator', cmd: 'node', args: ['utils/apiDocs.js'] },
  { name: 'Guest Quota (Redis, atomic)', cmd: 'node', args: ['utils/guestQuota.js'] },
  { name: 'Auth Controller Self-Check', cmd: 'node', args: ['controllers/authController.js'] },
  { name: 'Song Review (Test)', cmd: 'node', args: ['utils/songReview.test.js'] },
  { name: 'Audio Pipeline PipelineRun', cmd: 'node', args: ['pipeline/cli.js', '--self-check'] },
  { name: 'Rooms Catalog Seeding', cmd: 'node', args: ['rooms/catalog.js'] },
  { name: 'Live 24/7 Radio Stations', cmd: 'node', args: ['rooms/stations.js'] },
  { name: 'Blind Test Rooms (A/B)', cmd: 'node', args: ['rooms/blindTest.js'] },
];

// Thêm ViSQOL python analyzer nếu môi trường ảo .venv có sẵn
const fs = require('fs');
const venvPython = path.join(rootDir, '.venv/bin/python');
if (fs.existsSync(venvPython)) {
  steps.splice(4, 0, {
    name: 'Transition Analyzer (ViSQOL/Tempo)',
    cmd: venvPython,
    args: ['pipeline/analyzers/transition_analyze.py', '--self-check'],
  });
}

console.log('🧪 Bắt đầu chạy bộ kiểm thử Backend (Hugo Music)...');

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

console.log('\n✅ Toàn bộ các bước kiểm thử Backend đã vượt qua thành công!');
