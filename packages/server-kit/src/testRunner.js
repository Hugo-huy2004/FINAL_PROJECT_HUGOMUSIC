// Discovers tests instead of listing them, so a new test runs without touching any config:
//   <src>/**/*.test.js                                   → node <file>
//   <src>/**/*.js with a self-check (`require.main === module` + "self-check", or a '--self-check' flag) → node <file> --self-check
//   <src>/**/*.py that handles --self-check              → <python> <file> --self-check (skipped without it)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(full);
  return [full];
});

function discoverTests(root, { src = 'src', python = '.venv/bin/python' } = {}) {
  const py = path.join(root, python);
  return walk(path.join(root, src)).sort().flatMap((file) => {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.test.js')) return [{ rel, cmd: 'node', args: [rel] }];
    if (file.endsWith('.js') && (text.includes('--self-check') || (text.includes('require.main === module') && text.includes('self-check')))) return [{ rel, cmd: 'node', args: [rel, '--self-check'] }];
    if (file.endsWith('.py') && text.includes('--self-check')) return [{ rel, cmd: py, args: [rel, '--self-check'], skip: !fs.existsSync(py) && 'no python venv' }];
    return [];
  });
}

function runTests(root, opts) {
  const steps = discoverTests(root, opts);
  console.log(`Tests: ${steps.length} discovered`);
  let failed = 0;
  for (const step of steps) {
    if (step.skip) { console.log(` - ${step.rel} (skipped: ${step.skip})`); continue; }
    const t0 = Date.now();
    const res = spawnSync(step.cmd, step.args, { cwd: root, encoding: 'utf8', env: process.env, timeout: 300000 });
    const ok = res.status === 0;
    console.log(` ${ok ? '✓' : '✗'} ${step.rel} (${Date.now() - t0} ms)`);
    if (!ok) { failed++; process.stdout.write((res.stdout || '') + (res.stderr || '') + (res.error ? String(res.error) : '')); }
  }
  console.log(failed ? `\n${failed} failed` : '\nAll tests passed');
  return failed;
}

module.exports = { discoverTests, runTests };
