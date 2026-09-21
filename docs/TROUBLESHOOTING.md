# Troubleshooting

Start with the [example app](../example/App.tsx), a UWB-capable iPhone, and a
powered-on compatible accessory. Allow Bluetooth and Nearby Interaction access.
Record the package, iOS, React Native/Expo, and firmware versions before comparing
results with the [validated hardware configuration](validation/2026-09-21.md).

| Symptom | What to check |
| --- | --- |
| Native module unavailable | Rebuild the native app after installing the package. Install CocoaPods dependencies in a bare app. Expo Go cannot load this module; use a native development build. |
| Device reports unsupported | Physical UWB requires compatible iPhone hardware. The simulator cannot range. Check `getCapabilities()` before starting. |
| Waiting for Bluetooth | Enable Bluetooth and check the app's Bluetooth permission in Settings. |
| Scanning without finding a tag | Remove `namePrefix` and `deviceId` while diagnosing discovery. Firmware names vary. Check the service UUID, close other apps connected to the tag, and power-cycle it. |
| Connecting/configuring repeatedly | Check service/characteristic UUIDs and firmware framing. The built-in profile requires write-with-response and notifications/indications. A discovered BLE device is not necessarily NI-compatible. |
| Invalid accessory configuration | Use the accessory's Apple NI configuration bytes, not an iPhone discovery token. With an external transport, omit the optional peer UUID unless the pairing and standard NI GATT requirements in the README are met. |
| `SESSION_ACTIVE` | Call `stop()` before starting a new run, including after failure. Use one owner for the shared session. |
| `RETRY_LIMIT` or `failed` | Inspect the preceding error, correct the cause, then Stop / reset and Start. Retrying indefinitely will not fix an incompatible profile or denied permission. |
| State is ranging but the distance is blank | Check the measurement event and nullable distance separately. A reading can become unavailable or expire. If the event contains a distance, inspect your UI colors and formatting; the example supports light and dark appearances. |
| No angle or direction | These values can be `null` independently of distance. They were unavailable in the initial hardware tests; do not substitute zero. |
| Reading disappears in the background | Background ranging is outside this release. Foreground resume reconnects and configures again. External transports must handle fresh negotiation. |
| Oversized BLE payload | Keep messages within the supported write size. Enable chunking only if the firmware reassembles the complete command. |

## Collect a useful report

1. Reproduce in the example with one tag, then record the sequence of states and
   the exact error code/message. The example includes a bounded session log.
2. Record the smallest relevant configuration: transport, profile changes,
   timeouts, and whether a device/name filter was used.
3. State whether Stop → Start, foreground resume, or tag power-cycle changes
   the result. Distinguish a missing UI value from an absent measurement event.
4. Submit a [bug report](https://github.com/su-engineering/react-native-nearby-interaction/issues/new?template=bug.yml)
   with a minimal reproduction. Remove device identifiers, nearby-device scans,
   credentials, and raw Apple accessory configuration/shareable-data tokens.

Use [private vulnerability reporting](../SECURITY.md) for security issues.
