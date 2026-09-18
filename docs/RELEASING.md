# First beta release

Package: `@su-engineering/react-native-nearby-interaction@0.1.0-beta.1`.
GitHub: `su-engineering/react-native-nearby-interaction`.
License: MIT. npm dist-tag: `next`. Git tag: `v0.1.0-beta.1`.

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

Hardware tests have been intentionally deferred by the maintainer. This beta
must retain the explicit physical-validation-pending statement until the result
is recorded. A simulator compile does not prove UWB negotiation/ranging.

## npm organization setup

The GitHub organization and npm organization are separate. Use an npm account
with publish rights in the `su-engineering` npm organization and enable 2FA.
No npm token is stored in this repository.

If this is the first publication, create the package using an authenticated
maintainer account after the repository is public and the candidate is reviewed:

```sh
npm login
npm publish ./build/release/su-engineering-react-native-nearby-interaction-0.1.0-beta.1.tgz --access public --tag next
```

Then configure **Trusted Publisher** in the package's npm settings:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization | `su-engineering` |
| Repository | `react-native-nearby-interaction` |
| Workflow filename | `publish.yml` |
| Environment | Leave empty; workflow does not use a GitHub environment |

If npm supports setting up this package's trusted publisher before first
publication, configure it first and use the workflow instead. The workflow is
manual, waits for all automated checks, verifies the exact version and tarball
integrity, checks that the repository is public and the npm version is absent,
then publishes with OIDC/provenance and creates the matching Git tag.

Do not run the automated publication for a version already manually published.
For that bootstrap version, verify the registry artifact before creating/pushing
its Git tag and publishing the matching GitHub prerelease. Later beta versions
can use the workflow directly.

## Public repository and release

Review source/history and retained notices before changing visibility. Enable
GitHub private vulnerability reporting once public. Create a GitHub prerelease
with the changelog and the physical-validation-pending statement. Keep the first
beta on `next`; do not move it to `latest` while evaluation is ongoing.

Update package version, root lockfile, example lockfile and changelog together
for subsequent releases. The podspec source tag tracks `v<package version>`.

References:

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm publish and dist-tags](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
