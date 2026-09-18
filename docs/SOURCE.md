# Source lineage

The starting reference was the user's downloaded
`IdentityWallet-feature-nearby-interactions-UWB.zip`, archive revision
`653bc39c87577615093752ae9478acb2887baf20`, from:

https://github.com/Swiss-Digital-Assets-Institute/IdentityWallet/tree/feature/nearby-interactions-UWB

The reference implements iPhone-to-Truesense T-TAG ranging. Its NUS UUIDs,
optional NI notification UUIDs and `0x0A`/`0x0B`/`0x0C` negotiation sequence inform
the default profile. The native controller, BLE transport, TurboModule, TypeScript
API and tests were written for this standalone package. No wallet navigation,
credential issuance, notification service, storage or Android wallet stub was
copied into the library. No source archive is distributed with this package.

The runnable example's native app shell is adapted from the official
`@react-native-community/template@0.83.1`. Its license is retained in
`example/TEMPLATE-LICENSE`.
