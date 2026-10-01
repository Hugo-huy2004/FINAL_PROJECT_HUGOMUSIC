#!/usr/bin/env node
// Generates the component library shown at /developer from the source code itself — nothing is listed by hand.
//
//   node scripts/gen-component-docs.mjs          write the docs the API serves (apps/server/src/modules/docs/components.json,
//                                                GET /api/docs/components) and the live-demo index (generated/demos.ts)
//   node scripts/gen-component-docs.mjs --check  fail if the generated files are stale or a component is undocumented
//
// What it reads, per exported React component in LIBRARY_DIRS:
//   description   the JSDoc block above the export (must be English, no brand names)
//   usage/remarks/a11y  @usage (when to use), @remarks (how it works), @a11y (accessibility) tags
//   guide         the sections of packages/ui/README.md
//   props         the real prop types from the TypeScript checker, with each prop's JSDoc and its default value
//                 (taken from the destructuring pattern); props inherited from React Native are summarised
//   example       an @example JSDoc tag, otherwise a usage snippet built from the required props
//   platforms     sibling .ios.tsx / .web.tsx files
//   demo          a live demo exported from any *.demos.tsx file under src/ (keyed by component name)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const UI_SRC = path.resolve(ROOT, '../ui/src'); // the hugo-music library (packages/ui)
const OUT_DIR = path.join(SRC, 'screens/Developer/generated');
const API_JSON = path.resolve(ROOT, '../../apps/server/src/modules/docs/components.json');
const BRANDS = /\b(apple|ios|ipados|macos|android|google|icloud|safari|chrome|liquid glass|hig|uiglasseffect|spotify|youtube|netflix)\b/i;
const CHECK = process.argv.includes('--check');

// Folder → group. A component added to one of these folders appears on the page automatically.
// `pkg` entries are the published hugo-music library; the rest are app components built on it.
const LIBRARY_DIRS = [
  { root: UI_SRC, dir: 'theme.tsx', group: 'Theme', pkg: true },
  { root: UI_SRC, dir: 'glass', group: 'Glass', pkg: true },
  { root: UI_SRC, dir: 'controls', group: 'Controls', pkg: true },
  { root: UI_SRC, dir: 'navigation', group: 'Navigation', pkg: true },
  { root: UI_SRC, dir: 'layout', group: 'Layout', pkg: true },
  { root: UI_SRC, dir: 'data', group: 'Data display', pkg: true },
  { root: SRC, dir: 'ui/kit', group: 'App UI kit' },
  { root: SRC, dir: 'components', group: 'App components' },
];

const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : [p]);
const isPlatformVariant = (f) => /\.(ios|android|web|native)\.tsx$/.test(f);
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');

function libraryFiles() {
  return LIBRARY_DIRS.flatMap(({ root, dir, group, pkg }) => walk(path.join(root, dir))
    .filter((f) => f.endsWith('.tsx') && !isPlatformVariant(f) && !f.endsWith('.demos.tsx'))
    .map((file) => ({ file, group, pkg: !!pkg })));
}

function program() {
  const configPath = path.join(ROOT, 'tsconfig.json');
  const cfg = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  return ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true });
}

const ENGLISH = (s) => !/[À-ỹđĐ]/.test(s);
const docText = (sym, checker) => ts.displayPartsToString(sym.getDocumentationComment(checker)).trim();
const jsDocTag = (sym, name) => sym.getJsDocTags().find((t) => t.name === name);
const tagText = (tag) => (tag ? ts.displayPartsToString(tag.text || []).trim() : '');

/** The function node that renders the component (unwrapping React.memo / forwardRef). */
function componentFunction(decl) {
  let node = ts.isVariableDeclaration(decl) ? decl.initializer : decl;
  while (node && ts.isCallExpression(node)) node = node.arguments[0];
  return node && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) ? node : null;
}

function defaultsOf(fn) {
  const param = fn?.parameters[0];
  if (!param || !ts.isObjectBindingPattern(param.name)) return {};
  return Object.fromEntries(param.name.elements.filter((e) => e.initializer)
    .map((e) => [(e.propertyName || e.name).getText(), e.initializer.getText()]));
}

function describeComponent(sym, checker, sourceFile) {
  const decl = sym.declarations?.[0];
  if (!decl) return null;
  const type = checker.getTypeOfSymbolAtLocation(sym, decl);
  const sig = type.getCallSignatures()[0];
  if (!sig) return null;
  const ret = checker.typeToString(sig.getReturnType());
  if (!/Element|ReactNode|ReactElement/.test(ret)) return null;

  const fn = componentFunction(decl);
  const defaults = defaultsOf(fn);
  const propsParam = sig.getParameters()[0];
  const props = [];
  const inherited = new Map();
  if (propsParam) {
    const propsType = checker.getTypeOfSymbolAtLocation(propsParam, decl);
    for (const p of checker.getPropertiesOfType(propsType)) {
      const pd = p.declarations?.[0];
      const from = pd?.getSourceFile().fileName || '';
      if (!from.startsWith(SRC) && !from.startsWith(UI_SRC)) {
        const owner = pd?.parent && (ts.isInterfaceDeclaration(pd.parent) || ts.isTypeAliasDeclaration(pd.parent)) ? pd.parent.name.text : 'React Native';
        inherited.set(owner, (inherited.get(owner) || 0) + 1);
        continue;
      }
      const optional = !!(p.flags & ts.SymbolFlags.Optional);
      const t = checker.typeToString(checker.getTypeOfSymbolAtLocation(p, decl), undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType);
      props.push({ name: p.name, type: t.replace(/ \| undefined$/, ''), required: !optional, default: defaults[p.name] ?? null, description: docText(p, checker) });
    }
  }
  const name = sym.name;
  const required = props.filter((p) => p.required);
  const tags = sym.getJsDocTags();
  const examples = tags.filter((t) => t.name === 'example').map(tagText);
  if (!examples.length) examples.push(`<${name}${required.map((p) => ` ${p.name}={${/=>/.test(p.type) ? '() => {}' : p.type === 'string' ? `'…'` : '…'}}`).join('')} />`);
  return {
    name, description: docText(sym, checker), props,
    usage: tagText(jsDocTag(sym, 'usage')), remarks: tagText(jsDocTag(sym, 'remarks')), a11y: tagText(jsDocTag(sym, 'a11y')),
    inherited: [...inherited].map(([from, count]) => ({ from, count })),
    examples,
  };
}

function generate() {
  const prog = program();
  const checker = prog.getTypeChecker();
  const kitIndex = fs.readFileSync(path.join(SRC, 'ui/kit/index.ts'), 'utf8');
  const entries = [];
  for (const { file, group, pkg } of libraryFiles()) {
    const sf = prog.getSourceFile(file);
    if (!sf) continue;
    const mod = checker.getSymbolAtLocation(sf);
    if (!mod) continue;
    const base = file.replace(/\.tsx$/, '');
    const platforms = ['ios', 'android', 'web'].filter((p) => fs.existsSync(`${base}.${p}.tsx`));
    for (const sym of checker.getExportsOfModule(mod)) {
      const real = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      const exportName = sym.name === 'default' ? path.basename(base) : sym.name;
      if (!/^[A-Z]/.test(exportName)) continue;
      const c = describeComponent(real, checker, sf);
      if (!c) continue;
      const fromKit = !pkg && rel(file).startsWith('ui/kit/') && kitIndex.includes(rel(file).slice('ui/kit/'.length).replace(/\.tsx$/, ''));
      const repoPath = path.relative(path.resolve(ROOT, '../..'), file).split(path.sep).join('/');
      entries.push({
        id: `${repoPath}#${exportName}`, ...c, name: exportName, group, package: pkg ? 'hugo-music' : null,
        file: repoPath,
        importFrom: pkg ? 'hugo-music' : fromKit ? 'src/ui/kit' : `src/${rel(base)}`,
        importStyle: pkg ? 'named' : sym.name === 'default' ? 'default' : 'named',
        platforms: platforms.length ? ['default', ...platforms] : [],
      });
    }
  }
  entries.sort((a, b) => LIBRARY_DIRS.findIndex((d) => d.group === a.group) - LIBRARY_DIRS.findIndex((d) => d.group === b.group) || a.name.localeCompare(b.name));

  const demoFiles = walk(SRC).filter((f) => f.endsWith('.demos.tsx')).sort();
  const header = '// GENERATED by packages/client/scripts/gen-component-docs.mjs — do not edit; run `npm run gen -w @hugo/client`.\n';
  const pkg = JSON.parse(fs.readFileSync(path.join(UI_SRC, '../package.json'), 'utf8'));
  // README sections (## headings) are the library guide; the title line and anything before the first ## is the intro.
  const readme = fs.readFileSync(path.join(UI_SRC, '../README.md'), 'utf8').split(/^## /m);
  const guide = readme.slice(1).map((part) => { const [title, ...body] = part.split('\n'); return { title: title.trim(), body: body.join('\n').trim() }; });
  const intro = readme[0].replace(/^# .*\n/, '').trim();
  const api = { package: { name: pkg.name, version: pkg.version, description: pkg.description, license: pkg.license, peerDependencies: pkg.peerDependencies }, intro, guide, components: entries };
  const demosTs = `${header}import type { DemoMap } from '../types';\n${demoFiles.map((f, i) => `import d${i} from '${path.relative(OUT_DIR, f).split(path.sep).join('/').replace(/\.tsx$/, '')}';`).join('\n')}\n\nexport const DEMOS: DemoMap = Object.assign({}, ${demoFiles.map((_, i) => `d${i}`).join(', ')});\n`;
  return { entries, files: { [API_JSON]: JSON.stringify(api, null, 1) + '\n', [path.join(OUT_DIR, 'demos.ts')]: demosTs }, demoFiles, guide, intro };
}

const { entries, files, demoFiles, guide, intro } = generate();
const prose = (e) => [e.description, e.usage, e.remarks, e.a11y, ...e.props.map((p) => p.description)].join(' ');
const problems = [
  ...entries.map((e) => [e, !e.description ? 'missing JSDoc description' : !ENGLISH(prose(e)) ? 'docs must be English'
    : BRANDS.test(prose(e)) ? `docs name a brand (${prose(e).match(BRANDS)[0]})` : e.package && !(e.usage && e.remarks && e.a11y) ? 'library components need @usage, @remarks and @a11y' : null])
    .filter(([, why]) => why).map(([e, why]) => `${e.file} ${e.name}: ${why}`),
  ...[intro, ...guide.map((g) => g.title + ' ' + g.body)].filter((t) => BRANDS.test(t.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, ''))).map(() => 'packages/ui/README.md names a brand'),
];

if (process.argv.includes("--report")) {
  if (process.argv.includes("--props")) for (const e of entries) console.log(e.name + ": " + e.props.map((p) => p.name + (p.required ? "" : "?")).join(", ") + (e.inherited.length ? "  [+" + e.inherited.map((i) => i.count + " " + i.from).join(", ") + "]" : ""));
  for (const e of entries) console.log(`${e.group.padEnd(16)} ${e.name.padEnd(22)} ${e.props.length} props  ${e.description ? 'doc' : '—'}  ${e.file}`);
  console.log(`${entries.length} components, ${demoFiles.length} demo files, ${problems.length} problems`);
  process.exit(0);
}
if (problems.length) {
  console.error(`Component docs: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
let stale = [];
for (const [target, content] of Object.entries(files)) {
  const name = path.basename(target);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === content) continue;
  if (CHECK) stale.push(name);
  else fs.writeFileSync(target, content);
}
if (stale.length) {
  console.error(`Generated component docs are stale (${stale.join(', ')}). Run: npm run gen -w @hugo/client`);
  process.exit(1);
}
console.log(`component docs: ${entries.length} components, ${demoFiles.length} demo files${CHECK ? ' (up to date)' : ''}`);
