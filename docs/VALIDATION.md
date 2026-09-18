# Validation status and hardware test procedure

## Executed locally

- TypeScript strict checking, including the example UI.
- 16 JavaScript tests: platform errors, serialized start/stop, listener cleanup,
  failed-start recovery, late-run callback rejection, nullable/unfiltered readings,
  stale reading expiration, custom profiles/commands, validation, and Expo plist
  preservation, and cancellation of outstanding BLE writes.
- JavaScript/declaration build and iOS TurboModule schema/binding generation.
- Example autolinking discovery and app-level codegen.
- Production iOS JavaScript bundle through Metro.
- npm package dry run: native files, generated JavaScript/types, codegen source,
  plugin and documentation are included; the wallet and test app are excluded.
- Verified actual beta tarball installation in fresh React Native 0.83.1 and
  Expo SDK 55.0.0 consumers (not symlinks), including native autolinking/codegen,
  Expo prebuild/usage descriptions, and production bundles.

## Required on macOS

The Linux development host has no Swift/Xcode toolchain. Four Swift protocol tests
passed in macOS CI. The first native adapter build exposed a missing Nearby
Interaction header import, which has been corrected. The release CI workflow
compiles fresh React Native and Expo tarball consumers on macOS; check the
candidate commit's CI result for the native build outcome. Physical device
behavior remains unverified. A simulator build verifies linking/compilation,
not UWB behavior.

```sh
swift test
npm ci --prefix example
cd example
bundle install
cd ios
bundle exec pod install
cd ..
xcodebuild -workspace ios/NearbyInteractionExample.xcworkspace \
  -scheme NearbyInteractionExample -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

## Physical device acceptance

Record iPhone model, iOS version, tag model/firmware revision, actual advertisement
name, GATT profile, and whether firmware supports command reassembly. Use a
Truesense demo unit and the included example app. Do not enable chunked writes
until firmware behavior is confirmed.

| Scenario | Expected result |
| --- | --- |
| Fresh launch, grant both permissions | Scan → connect → configure → ranging; plausible distance |
| Deny Bluetooth | Explicit BLE_PERMISSION_DENIED; no retry loop |
| Deny Nearby Interaction | Explicit NI_PERMISSION_DENIED; no retry loop |
| Bluetooth disabled at start | waitingForBluetooth, then bounded timeout/recovery |
| Enable Bluetooth before timeout | Scanning resumes and connects |
| Move across 1 m, 5 m, and out of range | Readings remain unfiltered; unavailable/stale readings clear |
| Turn or obstruct the tag | Missing direction/angle is null; distance remains independent |
| Stop during scanning/connecting/configuring | idle; no subsequent reconnect or late measurement |
| Stop during ranging | Transport disconnects; no subsequent reconnect; tag stop is best effort |
| Start while active | SESSION_ACTIVE; existing run preserved |
| Repeated stop/start | No duplicate measurements/listeners or old-run state |
| Power-cycle tag | Bounded retry; fresh NI session after reconnection |
| Tag sends unsolicited stopped status | Reading clears and bounded reinitialization occurs |
| No valid configuration response | Deadline, bounded retries, then failed |
| Incorrect UUID/profile or invalid NI bytes | Explicit failure; no endless retries |
| Background then foreground | suspended and disconnected; fresh negotiation on return |
| Oversized shareable configuration | Clear MTU error; no partial command without opt-in |
| Opt-in chunking on confirmed firmware | Sequential acknowledged chunks produce valid ranging |
| Forwarded application notification | Opaque data event; no URI opening or wallet action |
| Two demo units present | Explicit UUID/name filter connects only intended unit |

For a second vendor, validate custom UUIDs/opcodes if it uses the same framing.
For another protocol, validate external mode, including reinitialization on each
`configuring` event and teardown of the application's own transport.

Keep the first hardware result as a versioned report before marking the MVP
device-tested or promoting it beyond the evaluation beta. Runtime ranging is a measurement, not a peer
identity or an authorization decision.
