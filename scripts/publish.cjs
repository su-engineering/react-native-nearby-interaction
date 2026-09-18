const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
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
  const notes = path.join(root, 'docs/releases', `${pkg.version}.md`);
  assert.ok(fs.existsSync(notes), 'Missing versioned release notes');
  const existingTag = spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}^{commit}`], {cwd: root, encoding: 'utf8'});
  assert.ok(existingTag.status === 0 || existingTag.status === 1, 'Cannot determine version tag state');
  if (existingTag.status === 0) assert.equal(existingTag.stdout.trim(), execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), 'Existing version tag points to a different commit');
  if (process.argv.includes('--dry-run')) {console.log(`Would publish ${pkg.name}@${pkg.version} with npm tag next and create ${tag}`); return;}
  assert.ok(process.env.ACTIONS_ID_TOKEN_REQUEST_URL, 'Automated publication requires GitHub Actions trusted publishing');
  execFileSync('npm', ['publish', archive, '--access', 'public', '--tag', 'next', '--provenance', '--registry', 'https://registry.npmjs.org/'], {cwd: root, stdio: 'inherit'});
  if (existingTag.status !== 0) execFileSync('git', ['tag', tag], {cwd: root});
  execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], {cwd: root, stdio: 'inherit'});
  const release = spawnSync('gh', ['release', 'view', tag, '--json', 'isDraft'], {cwd: root, encoding: 'utf8'});
  if (release.status === 0) {
    assert.equal(JSON.parse(release.stdout).isDraft, true, 'GitHub release already published');
    execFileSync('gh', ['release', 'upload', tag, archive, path.join(root, 'build/release/SHA256SUMS'), '--clobber'], {cwd: root, stdio: 'inherit'});
    execFileSync('gh', ['release', 'edit', tag, '--draft=false', '--prerelease', '--notes-file', notes], {cwd: root, stdio: 'inherit'});
  } else {
    execFileSync('gh', ['release', 'create', tag, '--verify-tag', '--prerelease', '--title', tag, '--notes-file', notes, archive, path.join(root, 'build/release/SHA256SUMS')], {cwd: root, stdio: 'inherit'});
  }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
