# Contributing

Open an issue before substantial API changes. Bug reports should include package,
React Native/Expo, iOS and Xcode versions, tag model/firmware, lifecycle state and
a minimal reproduction. Remove credentials and private accessory tokens.

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
with hardware/firmware versions. The first beta's physical validation is pending.

Preserve explicit session ownership/stop, nullable measurements, main-queue native
isolation and bounded recovery. Keep application-specific behavior out of the
library. Contributions must be yours to submit and distributable under MIT.
