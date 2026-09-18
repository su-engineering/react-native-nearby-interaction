# React Native Nearby Interaction

iPhone → UWB accessory ranging through Apple's Nearby Interaction framework.
This standalone MVP has a configurable Truesense T-TAG BLE profile, an external
transport API for other accessories, a typed event API, and a React hook.

The implementation is ready for native build and device validation. JavaScript
checks have been run on Linux; Xcode compilation and physical ranging have not
been run here. See [validation](docs/VALIDATION.md) before treating it as a tested
hardware library.

## Scope

| Capability | MVP |
| --- | --- |
| iOS UWB accessory sessions | Implemented |
| Truesense demo firmware handshake | Implemented, requires device validation |
| Configurable BLE UUIDs and framing bytes | Implemented |
| Other accessory transports | External configuration and shareable-data API |
| Nullable distance, horizontal angle, direction vector | Implemented |
| Bounded retries, deadlines, write acknowledgements, stale reading cleanup | Implemented |
| React Native New Architecture | TurboModule + generated event bindings |
| Expo | Info.plist config plugin; native development build required |
| Android, iPhone-to-iPhone, multiple simultaneous tags | Outside this MVP |
| Background ranging | Outside this MVP; disconnects and resumes in foreground |

Development baseline: React Native 0.83.1, React 19.2, iOS 15.1+. Hardware support
is checked at runtime; simulators cannot provide physical UWB measurements.

## Install locally

Clone the private repository and install locally:

```sh
npm install /absolute/path/to/react-native-nearby-interaction
cd ios
bundle exec pod install
```

Add nonempty `NSNearbyInteractionUsageDescription` and
`NSBluetoothAlwaysUsageDescription` strings to your app's Info.plist. The library
checks their presence before starting a built-in BLE session.

For Expo, add the config plugin and rebuild your native app:

```json
{
  "expo": {
    "plugins": [["react-native-nearby-interaction", {
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
import {nearbyInteraction, useNearbyInteraction} from 'react-native-nearby-interaction';

function Distance() {
  const {state, measurement, error} = useNearbyInteraction();
  // Render measurement?.distance; null means unavailable, never zero.
  // horizontalAngle is radians. direction is Apple's x/y/z vector.
  return null;
}

const capabilities = await nearbyInteraction.getCapabilities();
if (capabilities.supported) {
  await nearbyInteraction.start({namePrefix: 'T-TAG', maxRetries: 3});
}
await nearbyInteraction.stop();
```

Omit the name filter if your firmware advertises another name. By default, the
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
import {nearbyInteraction, TTAG_PROFILE} from 'react-native-nearby-interaction';

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
await nearbyInteraction.configureAccessory(accessoryConfigBase64, peripheralUUID);
```

The peer UUID is optional; supply it when using CoreBluetooth. On retry or
foreground resume the session emits `state: configuring` again; your transport
must reset/reinitialize the accessory and supply fresh configuration. Register
that state listener before `start()`. Repeated configuration for an already
configured session is ignored. `stop()` does not stop your external transport.

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
and [source lineage](docs/SOURCE.md). The package is unpublished and currently
marked UNLICENSED; a distribution license must be set before publishing.
The example retains the official template's MIT
license in `example/TEMPLATE-LICENSE`.
