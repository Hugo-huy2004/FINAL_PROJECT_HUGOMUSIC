const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Python for analyzers (pipeline/analyzers/*.py): --python / PSL_PYTHON / apps/server/.venv / python3.
const VENV = path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
const PYTHON = process.env.PSL_PYTHON || (fs.existsSync(VENV) ? VENV : 'python3');

// Run a parser and read the JSON it prints.
function runAnalyzer(script, args, timeoutMs) {
  const file = path.join(__dirname, 'analyzers', script);
  return JSON.parse(execFileSync(PYTHON, [file, ...args], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }));
}

module.exports = { runAnalyzer };
