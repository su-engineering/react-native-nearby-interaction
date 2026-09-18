import Foundation

func nearbyError(_ code: String, _ message: String) -> NSError {
  NSError(domain: "NearbyInteractionKit", code: 1,
          userInfo: ["code": code, NSLocalizedDescriptionKey: message])
}

struct AccessoryOptions: Decodable {
  struct Profile: Decodable {
    struct Commands: Decodable {
      let initialize: UInt8
      let start: UInt8
      let stop: UInt8
      let configuration: UInt8
      let started: UInt8
      let stopped: UInt8
    }
    let serviceUUID: String
    let writeCharacteristicUUID: String
    let notifyCharacteristicUUID: String
    let configurationServiceUUID: String?
    let configurationCharacteristicUUID: String?
    let allowChunkedWrites: Bool?
    let commands: Commands
  }
  let transport: String
  let deviceId: String?
  let namePrefix: String?
  let maxRetries: Int
  let timeoutMs: Int
  let updateIntervalMs: Int
  let staleAfterMs: Int
  let profile: Profile

  func validate() throws {
    guard ["ttag", "external"].contains(transport),
          (0...10).contains(maxRetries), (1000...120000).contains(timeoutMs),
          (0...5000).contains(updateIntervalMs), (100...30000).contains(staleAfterMs),
          staleAfterMs > updateIntervalMs else {
      throw nearbyError("INVALID_OPTIONS", "Invalid transport, retry count or interval")
    }
    let uuids = [deviceId, profile.serviceUUID, profile.writeCharacteristicUUID,
                 profile.notifyCharacteristicUUID, profile.configurationServiceUUID,
                 profile.configurationCharacteristicUUID].compactMap { $0 }
    guard uuids.allSatisfy({ UUID(uuidString: $0) != nil }),
          (profile.configurationServiceUUID == nil) == (profile.configurationCharacteristicUUID == nil),
          namePrefix == nil || !(namePrefix!.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
      throw nearbyError("INVALID_OPTIONS", "Expected valid UUIDs and a nonempty name filter")
    }
    let commands = profile.commands
    guard Set([commands.initialize, commands.start, commands.stop]).count == 3,
          Set([commands.configuration, commands.started, commands.stopped]).count == 3 else {
      throw nearbyError("INVALID_OPTIONS", "Command bytes must be distinct within each direction")
    }
  }
}
