import XCTest
@testable import NearbyInteractionProtocol

final class ProtocolTests: XCTestCase {
  private let commands = AccessoryOptions.Profile.Commands(initialize: 10, start: 11, stop: 12, configuration: 1, started: 2, stopped: 3)
  func testFramesAccessoryHandshake() {
    XCTAssertEqual(TTagProtocol.initialize(commands), Data([10]))
    XCTAssertEqual(TTagProtocol.start(Data([20, 21]), commands: commands), Data([11, 20, 21]))
    XCTAssertEqual(TTagProtocol.stop(commands), Data([12]))
    guard case .configuration(let bytes) = TTagProtocol.decode(Data([1, 20, 21]), rawConfiguration: false, commands: commands) else { return XCTFail("Expected framed configuration") }
    XCTAssertEqual(bytes, Data([20, 21]))
  }
  func testSupportsCustomCommandBytes() {
    let custom = AccessoryOptions.Profile.Commands(initialize: 16, start: 17, stop: 18, configuration: 32, started: 33, stopped: 34)
    XCTAssertEqual(TTagProtocol.start(Data([9]), commands: custom), Data([17, 9]))
    guard case .started = TTagProtocol.decode(Data([33]), rawConfiguration: false, commands: custom) else { return XCTFail("Custom status byte ignored") }
    guard case .applicationData = TTagProtocol.decode(Data([2]), rawConfiguration: false, commands: custom) else { return XCTFail("Default command should not be interpreted") }
  }
  func testSeparatesForwardedDataFromRawConfiguration() {
    let uri = Data("https://example.com/offer".utf8)
    guard case .applicationData(let bytes) = TTagProtocol.decode(uri, rawConfiguration: true, commands: commands) else { return XCTFail("URI was interpreted as NI configuration") }
    XCTAssertEqual(bytes, uri)
    guard case .configuration(let config) = TTagProtocol.decode(Data([10, 11]), rawConfiguration: true, commands: commands) else { return XCTFail("Raw config missing") }
    XCTAssertEqual(config, Data([10, 11]))
  }
  func testDoesNotAssumeThirtySevenByteConfiguration() {
    guard case .configuration(let bytes) = TTagProtocol.decode(Data([1, 42]), rawConfiguration: false, commands: commands) else { return XCTFail("Configuration rejected by hardcoded size") }
    XCTAssertEqual(bytes, Data([42])) // Apple, not the transport, validates content.
    guard case .applicationData = TTagProtocol.decode(Data([1]), rawConfiguration: false, commands: commands) else { return XCTFail("Empty configuration accepted") }
  }
}
