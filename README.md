# React Native Nearby Interaction

**Measure the distance from an iPhone to a UWB accessory in React Native and Expo.**

[![CI](https://github.com/su-engineering/react-native-nearby-interaction/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/su-engineering/react-native-nearby-interaction/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@su-engineering/react-native-nearby-interaction)](https://www.npmjs.com/package/@su-engineering/react-native-nearby-interaction)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Apple's Nearby Interaction framework provides the measurements. This library
handles the native session, Truesense T-TAG Bluetooth negotiation, and recovery,
and exposes a typed event API and a React hook.

- **T-TAG support:** configurable BLE services, characteristics, and command bytes.
- **React state:** distance, session state, accessory details, and errors through one hook.
- **Session recovery:** bounded retries, foreground resume, and stale-reading cleanup.
- **Other accessories:** bring your own transport for an Apple-compatible NI protocol.
- **Native integration:** React Native New Architecture and an Expo config plugin.

Current release: **[0.1.0](https://github.com/su-engineering/react-native-nearby-interaction/releases/tag/v0.1.0)**.
Distance ranging, stop/restart, foreground resume, and tag reconnection passed on
an iPhone 16 Pro with a Truesense T-TAG. Direction and angle were unavailable in
those sessions. See the [hardware report](docs/validation/2026-09-21.md) for the
exact test scope; other accessories remain unverified.

[Quick start](#installation) · [API reference](docs/API.md) ·
[Troubleshooting](docs/TROUBLESHOOTING.md) · [Validation](docs/VALIDATION.md) ·
[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Scope

| Capability | Support in 0.1.0 |
| --- | --- |
| iOS UWB accessory sessions | Implemented |
| Truesense demo firmware handshake | Device-tested with a T-TAG; firmware revision not recorded |
| Configurable BLE UUIDs and framing bytes | Implemented |
| Other accessory transports | External configuration and shareable-data API |
| Nullable distance, horizontal angle, direction vector | Implemented |
| Bounded retries, deadlines, write acknowledgements, stale reading cleanup | Implemented |
| React Native New Architecture | TurboModule + generated event bindings |
| Expo | Info.plist config plugin; native development build required |
| Android, iPhone-to-iPhone, multiple simultaneous tags | Outside this release |
| Background ranging | Outside this release; disconnects and resumes in foreground |

Compatibility target: React Native 0.83.x (baseline 0.83.1), React 19.2.x,
Expo SDK 55 (baseline 55.0.0), iOS 15.1+, Xcode 26.2+ for Expo builds. Other versions are not claimed by this
release. Hardware support is checked at runtime; simulators cannot provide physical
UWB measurements.

## Installation

Install from npm:

```sh
npm install @su-engineering/react-native-nearby-interaction
```

For a bare React Native app, install the iOS pods after adding the package:

```sh
cd ios
bundle exec pod install
```

You need a UWB-capable iPhone and an Apple-compatible UWB accessory for physical
ranging. A simulator can validate UI and unsupported-device handling only.

Add nonempty `NSNearbyInteractionUsageDescription` and
`NSBluetoothAlwaysUsageDescription` strings to your app's Info.plist. The library
checks their presence before starting a built-in BLE session.

For Expo, add the config plugin and rebuild your native app:

```json
{
  "expo": {
    "plugins": [["@su-engineering/react-native-nearby-interaction", {
      "nearbyInteractionUsageDescription": "Measure your distance to your UWB tag.",
      "bluetoothUsageDescription": "Connect to your UWB tag."
    }]]
  }
}
```

The plugin preserves existing descriptions unless explicitly overridden and does
not add background modes. Expo Go cannot load this native module.

## Basic usage

```tsx
import {useEffect, useState} from 'react';
import {Button, Text, View} from 'react-native';
import {nearbyInteraction, useNearbyInteraction} from '@su-engineering/react-native-nearby-interaction';

// This screen owns the shared session. Mount only one session owner at a time.
export function DistanceScreen() {
  const {state, measurement, error} = useNearbyInteraction();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => () => {
    void nearbyInteraction.stop().catch(console.error);
  }, []);

  async function run(action: 'start' | 'stop') {
    setBusy(true);
    setMessage(null);
    try {
      if (action === 'start') {
        const capabilities = await nearbyInteraction.getCapabilities();
        if (!capabilities.supported) {
          setMessage('This device does not support accessory UWB ranging.');
          return;
        }
        await nearbyInteraction.start();
      } else {
        await nearbyInteraction.stop();
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text>{state}</Text>
      <Text>{measurement?.distance == null ? '—' : `${measurement.distance.toFixed(2)} m`}</Text>
      <Text>{message ?? error?.message}</Text>
      <Button title="Start" disabled={busy || state !== 'idle'} onPress={() => void run('start')} />
      <Button title="Stop / reset" disabled={busy} onPress={() => void run('stop')} />
    </View>
  );
}
```

The example uses the default T-TAG profile without a name filter. By default, the
first matching peripheral is selected. Use `deviceId` (CoreBluetooth UUID) to
target a particular unit. The default scan timeout is 15 seconds.

`start()` resolves when a run is accepted, not when the first distance arrives.
Subscribe before starting and observe `ranging`/`measurement` for progress.
Use one shared session; mounting/unmounting the hook only subscribes. Call `stop()`
when your application no longer owns the session. Call `stop()` before replacing
an active or failed run. Calls are serialized, including stop queued behind start.

Measurements are never filtered by a proximity threshold. Delivery defaults to
100 ms, and the snapshot clears its measurement after 2 seconds without an update.
Movement beyond your application's threshold remains visible. Both distance and
direction may independently be unavailable.

## Configure the accessory profile

```ts
import {nearbyInteraction, TTAG_PROFILE} from '@su-engineering/react-native-nearby-interaction';

await nearbyInteraction.start({
  transport: 'ttag',
  profile: {
    ...TTAG_PROFILE,
    serviceUUID: '6E400001-B5A3-F393-E0A9-E50E24DCCA9E',
    writeCharacteristicUUID: '6E400002-B5A3-F393-E0A9-E50E24DCCA9E',
    notifyCharacteristicUUID: '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
    commands: {
      initialize: 0x0a, start: 0x0b, stop: 0x0c,
      configuration: 0x01, started: 0x02, stopped: 0x03,
    },
    allowChunkedWrites: false,
  },
});
```

A custom profile must supply the three primary UUIDs. Optional
`configurationServiceUUID` and `configurationCharacteristicUUID` are provided
together for a raw configuration notification; these may share the primary
service. Custom profiles do not implicitly inherit the Truesense fallback
characteristic. UUIDs must use their full 128-bit form.

The built-in transport requires write-with-response and notify/indicate support.
It waits for service discovery and notification subscriptions before requesting
configuration. Its command format is one-byte opcodes followed by opaque Apple
configuration bytes. It does not assume a 37-byte configuration or attempt to
deserialize an accessory as an iPhone peer.

Oversized outgoing messages are rejected before writing. Opt into MTU chunking
only when your firmware reassembles a command across acknowledged BLE writes.
Incoming notifications must contain a complete frame; firmware-specific
fragmentation/reassembly belongs in an external transport.

## Other accessory protocols

Use `transport: 'external'` to own discovery, connection, framing, and negotiation.
The native module continues to own the Apple NI session:

```ts
const configSubscription = nearbyInteraction.on('configuration', ({data}) => {
  // Raw Apple shareable configuration, base64. Add your firmware's framing and
  // send over BLE/Wi-Fi/etc. Handle transport errors in your application.
});
await nearbyInteraction.start({transport: 'external'});
// After receiving your accessory's Apple NI configuration:
await nearbyInteraction.configureAccessory(accessoryConfigBase64);
```

The peer UUID is optional. Supply it only for an accessory that is Bluetooth
paired, actively connected, and implements Apple's standard Nearby Interaction
GATT service and Accessory Configuration Characteristic. A CoreBluetooth
connection alone does not meet these requirements; omit the UUID for ordinary
foreground ranging over a vendor transport. The built-in T-TAG transport uses
the foreground configuration initializer. On retry or
foreground resume, a transition to `configuring` requests fresh negotiation.
Your transport must reset/reinitialize the accessory and supply its configuration.
Register that state listener before `start()`. Repeated configuration for an
already configured session is ignored. Remove subscriptions and close your own
transport after `stop()`; it only tears down the native NI session in external mode.

No default framing, token discovery, credential transfer, or generic UWB radio
scanning is implied by external mode. The accessory must implement an
Apple-compatible NI protocol.

## Events and errors

```ts
const subscription = nearbyInteraction.on('measurement', reading => {
  console.log(reading.distance, reading.horizontalAngle);
});
subscription.remove();
```

Events: `state`, `connected`, `disconnected`, `measurement`, `configuration`,
`data`, `error`. Application `data` is opaque base64; the library never opens URLs
or performs wallet actions. `sendData(base64)` resolves after all BLE write
acknowledgements and is available only in built-in BLE mode.

Recoverable connection/session failures use exponential delays of 0.5–4 seconds,
with a total retry budget per run. Permission denial, invalid Apple configuration,
and incompatible GATT profiles fail immediately. Terminal failure emits an error
and `failed`; stop and start after fixing the cause. The error snapshot retains
the last error until a connection/measurement succeeds or the run is reset.

## Development and example

```sh
npm ci
npm run check
npm ci --prefix example
cd example
bundle install
bundle exec pod install --project-directory=ios
npm start
```

Open `example/ios/NearbyInteractionExample.xcworkspace`, select your signing team
and a unique bundle identifier, and run on your UWB-capable iPhone. Alternatively
run `npm run ios -- --device "Your iPhone"` in another terminal after signing is
configured. The example displays capability, state, distance, angle, direction,
and a bounded event log. Swift protocol tests run with `swift test` on macOS.

See [architecture](docs/ARCHITECTURE.md), [hardware validation](docs/VALIDATION.md),
and [source lineage](docs/SOURCE.md). This package is MIT licensed; the example
retains the official template's MIT license in `example/TEMPLATE-LICENSE`.
See [contributing](CONTRIBUTING.md), [security](SECURITY.md) and the
[release guide](docs/RELEASING.md).

## Help and contributions

Use the [bug report form](https://github.com/su-engineering/react-native-nearby-interaction/issues/new?template=bug.yml)
for reproducible problems and the [hardware validation form](https://github.com/su-engineering/react-native-nearby-interaction/issues/new?template=hardware.yml)
to share results from another device or firmware. Include versions, session states,
and a minimal reproduction; remove private identifiers and accessory configuration tokens.
Read the [troubleshooting guide](docs/TROUBLESHOOTING.md) before collecting logs.

Small fixes, regression tests, documentation improvements, and reproducible hardware
reports are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Report security
issues through the private channel in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE), copyright SU Engineering. The example also retains the official
React Native template's [MIT license](example/TEMPLATE-LICENSE).
