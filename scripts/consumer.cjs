const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] ?? 'react-native';
assert.ok(['react-native', 'expo'].includes(mode), 'Use react-native or expo');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build/release/manifest.json'), 'utf8'));
const tarball = path.join(root, 'build/release', manifest.filename);
const destination = path.join(root, 'build/consumers', mode);
// Only this generated directory is replaced; never alter the checked-in app.
fs.rmSync(destination, {recursive: true, force: true});
fs.mkdirSync(destination, {recursive: true});
const run = (command, args) => execFileSync(command, args, {cwd: destination, stdio: 'inherit', env: {...process.env, CI: '1'}});
if (mode === 'react-native') {
  for (const file of ['App.tsx', 'index.js', 'app.json', 'babel.config.js', 'Gemfile', 'ios', 'TEMPLATE-LICENSE']) {
    fs.cpSync(path.join(root, 'example', file), path.join(destination, file), {recursive: true, filter: source => !/(?:^|\/)(?:Pods|build|\.bundle)(?:\/|$)/.test(path.relative(path.join(root, 'example'), source))});
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'example/package.json'), 'utf8'));
  pkg.dependencies['@su-engineering/react-native-nearby-interaction'] = `file:${tarball}`;
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(destination, 'metro.config.js'), "const {getDefaultConfig} = require('@react-native/metro-config'); module.exports = getDefaultConfig(__dirname);\n");
} else {
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({name: 'nearby-interaction-expo-consumer', version: '0.0.1', private: true, main: 'index.js', dependencies: {expo: '55.0.0', react: '19.2.0', 'react-native': '0.83.1', '@su-engineering/react-native-nearby-interaction': `file:${tarball}`}}, null, 2));
  fs.writeFileSync(path.join(destination, 'index.js'), "import {registerRootComponent} from 'expo'; import React from 'react'; import {Text} from 'react-native'; import {useNearbyInteraction} from '@su-engineering/react-native-nearby-interaction'; function App(){const state=useNearbyInteraction(); return React.createElement(Text,null,state.state);} registerRootComponent(App);\n");
  fs.writeFileSync(path.join(destination, 'app.json'), JSON.stringify({expo: {name: 'Nearby Interaction Package Test', slug: 'nearby-interaction-package-test', ios: {bundleIdentifier: 'engineering.su.nearbyinteraction.packagetest'}, plugins: [['@su-engineering/react-native-nearby-interaction', {nearbyInteractionUsageDescription: 'Package test: nearby tag ranging.', bluetoothUsageDescription: 'Package test: accessory connection.'}]]}}, null, 2));
}
run('npm', ['install', '--no-audit', '--no-fund']);
const installed = path.join(destination, 'node_modules/@su-engineering/react-native-nearby-interaction');
assert.equal(fs.lstatSync(installed).isSymbolicLink(), false, 'Consumer must use a real tarball installation');
assert.equal(JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version, manifest.version);
if (mode === 'react-native') {
  const config = JSON.parse(execFileSync('node', ['node_modules/@react-native-community/cli/build/bin.js', 'config'], {cwd: destination, encoding: 'utf8'}));
  assert.ok(config.dependencies['@su-engineering/react-native-nearby-interaction'].platforms.ios.podspecPath.endsWith('NearbyInteractionKit.podspec'));
  run('node', ['node_modules/react-native/scripts/generate-codegen-artifacts.js', '-p', '.', '-t', 'ios', '-o', 'codegen']);
  run('node', ['node_modules/@react-native-community/cli/build/bin.js', 'bundle', '--platform', 'ios', '--entry-file', 'index.js', '--dev', 'false', '--bundle-output', 'main.jsbundle', '--max-workers', '2']);
} else {
  run('node', ['node_modules/expo/bin/cli', 'prebuild', '--platform', 'ios', '--no-install']);
  const plist = fs.readFileSync(path.join(destination, 'ios/NearbyInteractionPackageTest/Info.plist'), 'utf8');
  assert.ok(plist.includes('Package test: nearby tag ranging.') && plist.includes('Package test: accessory connection.'));
  run('node', ['node_modules/expo/bin/cli', 'export', '--platform', 'ios', '--max-workers', '2']);
}
console.log(`Verified fresh ${mode} consumer from ${manifest.filename}`);
