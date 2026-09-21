# Contributing

Open an issue before substantial API changes. Bug reports should include package,
React Native/Expo, iOS and Xcode versions, tag model/firmware, lifecycle state and
a minimal reproduction. Remove credentials and private accessory tokens.

Use Node.js 22 for parity with CI. Native checks require macOS and Xcode; CI uses
Xcode 26.2. Start with the fast checks, then run consumer checks for integration changes.

```sh
npm ci
npm run check
```

Before changing packaging or native integration:

```sh
npm ci
npm run release:check
npm run test:consumer -- react-native
npm run test:consumer -- expo
```

Consumer checks download dependencies and create disposable apps in
`build/consumers`. They install the verified tarball rather than a source link.
On macOS, also run `swift test` and compile generated consumers as CI does.

Add tests for changed behavior, update the changelog and document API changes.
Changes to NI lifecycle, BLE negotiation or framing require physical test results
with hardware/firmware versions. See the [first hardware report](docs/validation/2026-09-21.md) for the validated
configuration and remaining coverage. Report additional hardware using the
hardware validation issue form.

Preserve explicit session ownership/stop, nullable measurements, main-queue native
isolation and bounded recovery. Keep application-specific behavior out of the
library. Contributions must be yours to submit and distributable under MIT.

## Pull requests

Keep each PR focused on one problem. Explain the observed behavior, the resulting
behavior, and the checks you ran. Link the relevant issue when there is one.
For hardware-dependent changes, distinguish measurements observed on a device
from simulator or mocked tests; record any checks you could not run.

Documentation-only changes need accurate examples and working links. Changes to
public behavior need appropriate regression coverage. Do not include signing
profiles, device identifiers, raw nearby-device scans, or private accessory data.

Use respectful, constructive discussion. For vulnerabilities, follow
[SECURITY.md](SECURITY.md) instead of filing a public bug.
