# Changelog

## 0.1.0-beta.1

First beta of the iOS UWB accessory library. Physical ranging validation is
pending; do not treat this release as device-tested.

- Nearby Interaction accessory sessions through a generated TurboModule.
- Configurable Truesense T-TAG BLE UUIDs, command bytes and optional MTU chunking.
- External transport support for other Apple-compatible accessories.
- Typed events, immutable shared snapshots and an observation-only React hook.
- Nullable distance, horizontal angle in radians, direction and timestamps.
- Bounded retries, handshake deadlines, acknowledged writes and write cancellation.
- Foreground suspension/resume and stale measurement expiration.
- Expo SDK 55 config plugin and a bare React Native example.

Initial compatibility target: React Native 0.83.1 / React 19.2 / Expo SDK 55.
Android, iPhone-to-iPhone sessions, concurrent tags and background ranging are
outside this release.
