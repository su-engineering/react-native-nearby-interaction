import Foundation

// Framing is vendor-specific, not part of Apple's NI configuration format.
enum TTagMessage {
  case configuration(Data)
  case started
  case stopped
  case applicationData(Data)
}
enum TTagProtocol {
  static func initialize(_ commands: AccessoryOptions.Profile.Commands) -> Data { Data([commands.initialize]) }
  static func stop(_ commands: AccessoryOptions.Profile.Commands) -> Data { Data([commands.stop]) }
  static func start(_ configuration: Data, commands: AccessoryOptions.Profile.Commands) -> Data {
    var message = Data([commands.start]); message.append(configuration); return message
  }
  static func decode(_ data: Data, rawConfiguration: Bool, commands: AccessoryOptions.Profile.Commands) -> TTagMessage {
    // Preserve forwarded UART strings as arbitrary application data. Never
    // route HTTP/credential payloads into the NI parser as the wallet did.
    if let text = String(data: data, encoding: .utf8),
       ["https://", "http://", "openid-credential-offer://"].contains(where: { text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix($0) }) {
      return .applicationData(data)
    }
    if rawConfiguration { return .configuration(data) }
    if data.first == commands.configuration && data.count > 1 { return .configuration(Data(data.dropFirst())) }
    if data == Data([commands.started]) { return .started }
    if data == Data([commands.stopped]) { return .stopped }
    return .applicationData(data)
  }
}
