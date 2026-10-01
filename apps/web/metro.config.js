// Inside the monorepo the web app compiles our own libraries (hugo-music, hugo-api…) from their source, never from
// a stale dist/ build: every packages/* with a "react-native" entry is resolved to that source file. Native builds
// already read the "react-native" field; published consumers use dist/.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const packagesDir = path.resolve(__dirname, '../../packages');
const sources = Object.fromEntries(fs.readdirSync(packagesDir).flatMap((dir) => {
  const file = path.join(packagesDir, dir, 'package.json');
  if (!fs.existsSync(file)) return [];
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  return pkg['react-native'] ? [[pkg.name, path.join(packagesDir, dir, pkg['react-native'])]] : [];
}));

const config = getDefaultConfig(__dirname);
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) =>
  sources[moduleName]
    ? { type: 'sourceFile', filePath: sources[moduleName] }
    : (resolve ?? context.resolveRequest)(context, moduleName, platform);

module.exports = config;
