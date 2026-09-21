import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runInNewContext} from 'node:vm';

// Execute the actual release script with an isolated registry and command runner.
// No test can publish, push a tag or create a GitHub release.
async function release(options: {version?: string; tag?: string; private?: boolean; corrupt?: boolean; published?: boolean; draft?: boolean} = {}) {
  const version = options.version ?? '0.1.0';
  const archive = Buffer.from('verified release archive');
  const calls: {command: string; args: string[]}[] = [];
  const errors: string[] = [];
  const process = {env: {EXPECTED_VERSION: version, REPOSITORY_PRIVATE: String(options.private ?? false), ACTIONS_ID_TOKEN_REQUEST_URL: 'test-oidc'}, argv: [], exitCode: 0};
  const manifest = {version, filename: 'package.tgz', integrity: 'sha512-' + crypto.createHash('sha512').update(archive).digest('base64')};
  const modules: Record<string, unknown> = {
    'node:fs': {
      readFileSync: (file: string) => file.endsWith('manifest.json') ? JSON.stringify(manifest) : options.corrupt ? Buffer.from('changed') : archive,
      existsSync: () => true,
    },
    'node:path': path,
    'node:assert/strict': assert,
    'node:crypto': crypto,
    'node:child_process': {
      execFileSync: (command: string, args: string[]) => {calls.push({command, args: Array.from(args)}); return Buffer.from('head');},
      spawnSync: (command: string) => command === 'gh' && options.draft ? {status: 0, stdout: '{"isDraft":true}'} : {status: 1},
    },
    '../package.json': {name: '@su-engineering/react-native-nearby-interaction', version, publishConfig: {tag: options.tag ?? 'latest'}},
  };
  await runInNewContext(readFileSync(path.join(__dirname, '../scripts/publish.cjs'), 'utf8'), {
    require: (name: string) => {assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name];},
    __dirname: path.join(__dirname, '../scripts'), process, AbortSignal,
    fetch: async () => ({status: options.published ? 200 : 404, ok: !!options.published}),
    console: {log: () => {}, error: (message: string) => errors.push(message)},
  });
  return {calls, errors, exitCode: process.exitCode};
}

test('regular releases publish latest and create a non-prerelease GitHub release', async () => {
  const result = await release();
  assert.equal(result.exitCode, 0);
  const npm = result.calls.find(call => call.command === 'npm')!;
  assert.equal(npm.args[npm.args.indexOf('--tag') + 1], 'latest');
  const github = result.calls.find(call => call.command === 'gh')!;
  assert.ok(github.args.includes('--latest'));
  assert.ok(!github.args.includes('--prerelease'));
});

test('prereleases stay on next and are marked as GitHub prereleases', async () => {
  const result = await release({version: '0.2.0-beta.1', tag: 'next'});
  assert.equal(result.exitCode, 0);
  assert.ok(result.calls.find(call => call.command === 'npm')!.args.includes('next'));
  assert.ok(result.calls.find(call => call.command === 'gh')!.args.includes('--prerelease'));
});

test('publishing an existing draft explicitly clears its prerelease flag for a regular release', async () => {
  const result = await release({draft: true});
  assert.equal(result.exitCode, 0);
  const edit = result.calls.find(call => call.command === 'gh' && call.args.includes('edit'))!;
  assert.ok(edit.args.includes('--prerelease=false'));
  assert.ok(edit.args.includes('--latest'));
});

for (const [name, options] of [
  ['wrong distribution tag', {tag: 'next'}],
  ['private repository', {private: true}],
  ['changed archive', {corrupt: true}],
  ['already-published version', {published: true}],
] as const) {
  test(`release refuses ${name} before any publishing or git mutation`, async () => {
    const result = await release(options);
    assert.equal(result.exitCode, 1);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.calls, []);
  });
}
