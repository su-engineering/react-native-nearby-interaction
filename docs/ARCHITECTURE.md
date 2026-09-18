# Architecture

`src/specs/NativeNearbyInteraction.ts` defines the private TurboModule ABI. It
uses an event envelope (`runId`, `type`, JSON `payload`) to keep profile changes
independent of generated ABI structures. The public API validates event payloads
and exposes typed event subscriptions and immutable snapshots.

`NearbyInteractionClient` serializes native commands, subscribes before starting,
rejects overlapping runs, and drops callbacks from previous runs. Hook subscribers
share one singleton; they do not acquire ownership or start hardware implicitly.
Snapshot expiration only clears the reading; a session may remain in `ranging`
while measurements are temporarily unavailable.

`RNNearbyInteraction.mm` is a thin Objective-C++ adapter inheriting the generated
event base class. `NIController` owns the NI session and foreground lifecycle.
All controller/BLE work is dispatched to the main queue. Session delegate identity
checks prevent invalidated sessions from publishing measurements into a new run.

`BLEChannel` owns one selected peripheral. Discovery is restricted to configured
services and characteristics. Selection stops scanning before connecting. CCCD
acknowledgements and characteristic discovery must finish before initialization.
Writes are acknowledged sequentially with per-chunk deadlines and a bounded queue.
Cleanup disables callback ownership before rejecting pending writes. Only the
controller can retry; stop never reconnects through a BLE delegate callback.

`TTagProtocol` performs configurable opcode framing. Apple validates opaque
accessory data through `NINearbyAccessoryConfiguration`; the transport does not
guess token formats or fall back to `NINearbyPeerConfiguration`.

Lifecycle:

```text
idle → waitingForBluetooth → scanning → connecting → configuring → ranging
                                   external mode ──→ configuring → ranging
transient failure → reconnecting → new discovery/session (bounded attempts)
terminal failure → failed → explicit stop → idle
background → suspended (native transport disconnected)
foreground → new discovery/session
explicit stop → idle (pending retries, delegates and writes detached)
```

Background ranging, camera-assisted convergence, no-response writes, arbitrary
notification fragmentation, Android and concurrent sessions require separate
design/validation. They are not advertised by this MVP.

References:

- [Apple Nearby Interaction sessions](https://developer.apple.com/documentation/nearbyinteraction/initiating-and-maintaining-a-session)
- [React Native Swift adapter pattern](https://reactnative.dev/docs/0.83/the-new-architecture/turbo-modules-with-swift)
- [React Native generated native events](https://reactnative.dev/docs/0.83/the-new-architecture/native-modules-custom-events)
