# Changelog

## 0.1.0

First release of the iOS UWB accessory library. Initial distance ranging and recovery
were validated on an iPhone 16 Pro / iOS 27.0 with a Truesense T-TAG. See
[the validation report](docs/validation/2026-09-21.md) for the tested scope.

- Nearby Interaction accessory sessions through a generated TurboModule.
- Configurable Truesense T-TAG BLE UUIDs, command bytes and optional MTU chunking.
- External transport support for other Apple-compatible accessories.
- Typed events, immutable shared snapshots and an observation-only React hook.
- Nullable distance, horizontal angle in radians, direction and timestamps.
- Bounded retries, handshake deadlines, acknowledged writes and write cancellation.
- Foreground suspension/resume and stale measurement expiration.
- Expo SDK 55 config plugin and a bare React Native example.
- Foreground accessory configuration without requiring Bluetooth pairing.
- Readable example text in light/dark mode and opt-in console diagnostics.
- CocoaPods setup compatible with Ruby versions that require the separate nkf gem.

Initial compatibility target: React Native 0.83.1 / React 19.2 / Expo SDK 55.
Android, iPhone-to-iPhone sessions, concurrent tags and background ranging are
outside this release.
