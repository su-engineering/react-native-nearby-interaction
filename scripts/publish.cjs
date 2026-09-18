const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
async function main() {
  assert.equal(process.env.EXPECTED_VERSION, pkg.version, 'Requested version must match package.json');
  assert.equal(process.env.REPOSITORY_PRIVATE, 'false', 'Open-source the reviewed repository before publication with provenance');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build/release/manifest.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  const archive = path.join(root, 'build/release', manifest.filename);
  const integrity = 'sha512-' + createHash('sha512').update(fs.readFileSync(archive)).digest('base64');
  assert.equal(integrity, manifest.integrity, 'Release artifact changed after verification');
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`, {signal: AbortSignal.timeout(30000)});
  assert.equal(response.status, 404, response.ok ? 'Version is already published' : 'Unexpected registry response');
  const tag = `v${pkg.version}`;
  assert.equal(execFileSync('git', ['tag', '--list', tag], {cwd: root, encoding: 'utf8'}).trim(), '', 'Version tag already exists');
  if (process.argv.includes('--dry-run')) {console.log(`Would publish ${pkg.name}@${pkg.version} with npm tag next and create ${tag}`); return;}
  assert.ok(process.env.ACTIONS_ID_TOKEN_REQUEST_URL, 'Automated publication requires GitHub Actions trusted publishing');
  execFileSync('npm', ['publish', archive, '--access', 'public', '--tag', 'next', '--provenance', '--registry', 'https://registry.npmjs.org/'], {cwd: root, stdio: 'inherit'});
  execFileSync('git', ['tag', tag], {cwd: root});
  execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], {cwd: root, stdio: 'inherit'});
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
