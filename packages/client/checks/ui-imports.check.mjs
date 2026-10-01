// The app takes UI from two places only: react-native primitives and the hugo-music library.
// Icons, gradients, blur and glass come through hugo-music (Icon, Gradient, Glass) — never imported directly.
// node checks/ui-imports.check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const FORBIDDEN = ['@expo/vector-icons', 'expo-linear-gradient', 'expo-blur', 'expo-glass-effect', '@expo/ui'];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const offenders = walk(SRC).filter((f) => /\.tsx?$/.test(f)).flatMap((f) => {
  const src = fs.readFileSync(f, 'utf8');
  return FORBIDDEN.filter((m) => src.includes(`from '${m}`)).map((m) => `${path.relative(SRC, f)} imports ${m}`);
});
assert.deepEqual(offenders, [], 'import these through hugo-music instead');
console.log('ui imports: ok (react-native + hugo-music only)');
