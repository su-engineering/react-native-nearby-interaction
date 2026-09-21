# First release

Package: `@su-engineering/react-native-nearby-interaction@0.1.0`.
GitHub: `su-engineering/react-native-nearby-interaction`.
License: MIT. npm dist-tag: `latest`. Git tag: `v0.1.0`.

## Release candidate checks

```sh
npm ci
npm run release:check
npm run test:consumer -- react-native
npm run test:consumer -- expo
```

CI runs Swift protocol tests and compiles both fresh tarball consumers for the
iOS simulator. The tarball check verifies required files, excludes the source
wallet/test harness, and writes `build/release/manifest.json` and `SHA256SUMS`.
The exact candidate is uploaded as the `npm-release-candidate` CI artifact.

Initial hardware validation is recorded in [the 2026-09-21 report](validation/2026-09-21.md).
Retain its limitations in the release notes: one iPhone/T-TAG combination,
unrecorded firmware revision, distance-only observations and an incomplete
hardware acceptance matrix. A simulator compile does not prove UWB ranging.

## npm organization setup

The GitHub organization and npm organization are separate. Use an npm account
with publish rights in the `su-engineering` npm organization and enable 2FA.
No npm token is stored in this repository.

Trusted publishing requires the package to exist on npm. For the first publication,
create it using an authenticated maintainer account after the repository is public
and the candidate is reviewed:

```sh
npm login
npm publish ./build/release/su-engineering-react-native-nearby-interaction-0.1.0.tgz --access public --tag latest
```

Then configure **Trusted Publisher** in the package's npm settings:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization | `su-engineering` |
| Repository | `react-native-nearby-interaction` |
| Workflow filename | `publish.yml` |
| Environment | Leave empty; workflow does not use a GitHub environment |
| Allowed actions | Enable direct `npm publish` |

With npm 11.15+, the equivalent authenticated CLI setup is:

```sh
npm trust github @su-engineering/react-native-nearby-interaction --file publish.yml --repo su-engineering/react-native-nearby-interaction --allow-publish
```

The workflow is manual, waits for all automated checks, verifies the version and tarball
integrity, checks that the repository is public and the npm version is absent,
then publishes with OIDC/provenance, creates the matching Git tag and publishes
the matching GitHub release with the verified archive and checksum.

Do not run the automated publication for a version already manually published.
For that bootstrap version, verify the registry artifact before creating/pushing
its Git tag and publishing the matching GitHub release. Later versions
can use the workflow directly.

## Public repository and release

Review source/history and retained notices before changing visibility. Enable
GitHub private vulnerability reporting once public. Create a GitHub release
with the changelog and the recorded hardware-validation scope. Regular versions publish on `latest`; prerelease versions use `next`.

Update package version, root lockfile, example lockfile and changelog together
for subsequent releases. The podspec source tag tracks `v<package version>`.

References:

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm trust prerequisites and setup](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [npm publish and dist-tags](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
