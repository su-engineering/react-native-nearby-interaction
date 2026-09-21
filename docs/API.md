# API reference

Import the shared `nearbyInteraction` client, `useNearbyInteraction` hook,
`NearbyInteractionError`, and `TTAG_PROFILE` from
`@su-engineering/react-native-nearby-interaction`. Public interfaces are exported
as TypeScript types; see [types.ts](../src/types.ts) for their full definitions.

## Session ownership

One client manages one accessory session. Subscribe before calling `start()`.
Mounting or unmounting the hook does not start or stop the session; the owning
screen or service must call `stop()` when finished. Stop before replacing an
active or failed run. See the [complete screen example](../README.md#basic-usage).

| Method | Result and behavior |
| --- | --- |
| `getCapabilities()` | `Promise<Capabilities>` with `supported`, `preciseDistance`, `direction`, and `platform`. Capability does not guarantee that every measurement contains direction. |
| `start(options?)` | `Promise<void>`; accepts a run. Observe state and measurement events for ranging progress. |
| `stop()` | `Promise<void>`; tears down the native session and built-in BLE transport, clears the snapshot, and returns to `idle`. External transport cleanup remains the caller's responsibility. |
| `configureAccessory(base64, bluetoothPeerId?)` | Supplies Apple accessory configuration during an external session. The optional peer ID has [specific pairing requirements](../README.md#other-accessory-protocols). |
| `sendData(base64)` | Sends application data through the built-in BLE transport; resolves after write acknowledgements. Stop cancels pending writes. |
| `on(event, listener)` | Returns a subscription with `remove()`. Listener payloads are typed by event. |
| `getSnapshot()` | Returns the current read-only snapshot. |
| `subscribe(listener)` | Observes snapshot changes; returns an unsubscribe function. React applications normally use the hook. |

Methods that accept options or encoded data can throw during validation; wrap
the call itself in `try`/`catch`, including when using `await`. Native/session
failures can also reject a returned promise or arrive through the `error` event.

## Start options

| Option | Default | Meaning |
| --- | --- | --- |
| `transport` | `'ttag'` | Built-in T-TAG BLE transport or `'external'`. |
| `deviceId` | Unset | Target CoreBluetooth peripheral UUID, not a MAC address. |
| `namePrefix` | Unset | Restrict discovery by advertised name prefix. Leave unset if the firmware name is unknown. |
| `profile` | `TTAG_PROFILE` | BLE UUIDs, command bytes, and optional chunking. See [profile configuration](../README.md#configure-the-accessory-profile). |
| `maxRetries` | `3` | Additional attempts per run; integer `0–10`. |
| `timeoutMs` | `15000` | Scan, connection, and handshake deadline; integer `1000–120000`. |
| `updateIntervalMs` | `100` | Native measurement delivery throttle; integer `0–5000`. |
| `staleAfterMs` | `2000` | Clear the snapshot reading after this many milliseconds without an update; integer `100–30000`, greater than `updateIntervalMs`. |

Base64 arguments must be nonempty canonical base64 and decode to at most 64 KiB.
BLE payload limits can be smaller; chunking requires explicit firmware support.

## Hook and measurements

`useNearbyInteraction()` returns `{state, accessory, measurement, error}`.
Accessory, measurement, and error are nullable. A measurement contains:

| Field | Unit / shape |
| --- | --- |
| `distance` | Metres, or `null`. |
| `horizontalAngle` | Radians, or `null`. |
| `direction` | Apple's direction vector `{x, y, z}`, or `null`. |
| `timestamp` | Unix timestamp in milliseconds. |

Use a placeholder for unavailable data; do not convert `null` to zero. Distance,
angle, and direction can be unavailable independently. Direction and angle were
not available during the initial T-TAG hardware validation.

The snapshot clears measurements on stop, disconnection, non-ranging states,
and stale timeout. Applications maintaining their own event history must apply
their own display and retention policy.

## Events

| Event | Payload |
| --- | --- |
| `state` | `{state}`: `idle`, `waitingForBluetooth`, `scanning`, `connecting`, `configuring`, `ranging`, `suspended`, `reconnecting`, or `failed`. |
| `connected` | `{id, name}`. |
| `disconnected` | `{reason}`. |
| `measurement` | The measurement described above. |
| `configuration` | `{data}`: base64 Apple shareable configuration to deliver using an external transport. |
| `data` | `{data, source}`: opaque base64 data; source is `'nus'` or `'configuration'`. |
| `error` | `{code, message, recoverable}`. |

Remove event subscriptions when their owner is disposed. External transports
must renegotiate when the session returns to `configuring`, including after
retry or foreground resume. A recoverable error can be followed by recovery;
`failed` requires correcting the cause, stopping, and starting again.

See [troubleshooting](TROUBLESHOOTING.md) for common failure stages and
[architecture](ARCHITECTURE.md) for the native/JavaScript boundary.
