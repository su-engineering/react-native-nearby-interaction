import Foundation
import NearbyInteraction
import UIKit
import CoreBluetooth

@objc public final class NIController: NSObject, NISessionDelegate {
  @objc public var onEvent: ((NSDictionary) -> Void)?
  private var runId: String?
  private var options: AccessoryOptions?
  private var session: NISession?
  private var configuration: NINearbyAccessoryConfiguration?
  private var channel: BLEChannel?
  private var accessory: [String: String]?
  private var state = "idle"
  private var retries = 0
  private var active = false
  private var suspended = false
  private var lastUpdate: TimeInterval = 0
  private var deadline: DispatchWorkItem?
  private var recovery: DispatchWorkItem?
  private var observers: [NSObjectProtocol] = []

  @objc public func capabilities() -> String {
    let precise: Bool
    let direction: Bool
    if #available(iOS 16.0, *) {
      precise = NISession.deviceCapabilities.supportsPreciseDistanceMeasurement
      direction = NISession.deviceCapabilities.supportsDirectionMeasurement
    } else { precise = NISession.isSupported; direction = precise }
    return json(["supported": precise, "preciseDistance": precise, "direction": direction, "platform": "ios"])
  }

  @objc(startWithRunId:options:error:)
  public func start(runId: String, options optionsJSON: String, error: NSErrorPointer) -> Bool {
    do {
      guard self.runId == nil else { throw nearbyError("SESSION_ACTIVE", "Stop the existing run first") }
      guard let data = optionsJSON.data(using: .utf8) else { throw nearbyError("INVALID_OPTIONS", "Expected JSON options") }
      let options = try JSONDecoder().decode(AccessoryOptions.self, from: data)
      try options.validate()
      guard NISession.isSupported else { throw nearbyError("UWB_UNSUPPORTED", "This device does not support Nearby Interaction") }
      guard let usage = Bundle.main.object(forInfoDictionaryKey: "NSNearbyInteractionUsageDescription") as? String, !usage.isEmpty else {
        throw nearbyError("MISSING_USAGE_DESCRIPTION", "Add NSNearbyInteractionUsageDescription to Info.plist")
      }
      if options.transport == "ttag" {
        guard let usage = Bundle.main.object(forInfoDictionaryKey: "NSBluetoothAlwaysUsageDescription") as? String, !usage.isEmpty else {
          throw nearbyError("MISSING_USAGE_DESCRIPTION", "Add NSBluetoothAlwaysUsageDescription to Info.plist")
        }
      }
      self.options = options; self.runId = runId; active = true; retries = 0
      suspended = UIApplication.shared.applicationState == .background
      observeLifecycle()
      if suspended { transition("suspended") } else { begin() }
      return true
    } catch let failure { error?.pointee = failure as NSError; return false }
  }

  @objc public func stop() {
    active = false; suspended = false
    cancelTimers()
    // Detach before invalidation so delegate callbacks cannot restart a run.
    destroySession()
    channel?.stop(); channel = nil; accessory = nil
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers.removeAll()
    transition("idle")
    runId = nil; options = nil
  }

  @objc(configureWithRunId:data:peerId:error:)
  public func configure(runId: String, data: String, peerId: String, error: NSErrorPointer) -> Bool {
    do {
      guard active, self.runId == runId else { throw nearbyError("NO_SESSION", "No matching active run") }
      guard options?.transport == "external" else { throw nearbyError("WRONG_TRANSPORT", "Configuration injection requires external transport") }
      guard !suspended, state != "suspended" else { throw nearbyError("SESSION_SUSPENDED", "Wait for session resume") }
      guard let bytes = Data(base64Encoded: data), !bytes.isEmpty, bytes.count <= 65536 else { throw nearbyError("INVALID_DATA", "Expected nonempty base64 configuration") }
      if !peerId.isEmpty && UUID(uuidString: peerId) == nil { throw nearbyError("INVALID_PEER_ID", "Expected a CoreBluetooth UUID") }
      do { try setup(bytes, peerId: UUID(uuidString: peerId)) }
      catch { fail("NI_INVALID_CONFIGURATION", error.localizedDescription); throw error }
      if accessory == nil {
        accessory = ["id": peerId.isEmpty ? "external" : peerId, "name": "External accessory"]
        emit("connected", accessory!)
      }
      return true
    } catch let failure { error?.pointee = failure as NSError; return false }
  }

  @objc(sendWithRunId:data:completion:)
  public func send(runId: String, data: String, completion: @escaping (NSError?) -> Void) {
    guard active, self.runId == runId else { completion(nearbyError("NO_SESSION", "No matching active run")); return }
    guard !suspended else { completion(nearbyError("SESSION_SUSPENDED", "Session is suspended")); return }
    guard let bytes = Data(base64Encoded: data), !bytes.isEmpty, bytes.count <= 65536 else { completion(nearbyError("INVALID_DATA", "Expected nonempty base64 data")); return }
    guard let channel = channel else { completion(nearbyError("WRONG_TRANSPORT", "Use your external transport to send data")); return }
    channel.send(bytes, completion: completion)
  }

  private func begin() {
    guard active, !suspended, let options = options else { return }
    makeSession()
    lastUpdate = 0
    armDeadline()
    if options.transport == "external" { transition("configuring"); return }
    transition("waitingForBluetooth")
    let channel = BLEChannel(options: options)
    self.channel = channel
    channel.onState = { [weak self, weak channel] state in
      guard let self = self, self.channel === channel, self.active, !self.suspended else { return }
      self.transition(state)
      self.armDeadline()
    }
    channel.onReady = { [weak self, weak channel] id, name in
      guard let self = self, self.channel === channel, self.active, !self.suspended else { return }
      self.accessory = ["id": id.uuidString, "name": name]
      self.emit("connected", self.accessory!)
      self.transition("configuring"); self.armDeadline()
      // Reset the tag on every new connection before requesting configuration.
      self.write(TTagProtocol.stop(options.profile.commands)) { [weak self] in self?.write(TTagProtocol.initialize(options.profile.commands)) }
    }
    channel.onData = { [weak self, weak channel] bytes, raw in
      guard let self = self, self.channel === channel, self.active, !self.suspended else { return }
      switch TTagProtocol.decode(bytes, rawConfiguration: raw, commands: options.profile.commands) {
      case .configuration(let data):
        // A connected vendor BLE transport is not necessarily paired or an
        // implementation of Apple's standard NI GATT service. Foreground
        // ranging must use the data-only initializer, which supports both.
        do { try self.setup(data, peerId: nil) }
        catch { self.fail("NI_INVALID_CONFIGURATION", error.localizedDescription) }
      case .started: break // Radio acknowledgement is not a distance measurement.
      case .stopped:
        // A stop acknowledgement during reset is expected. An unsolicited
        // stop during ranging must invalidate the last reading and recover.
        if self.state == "ranging" { self.retry("ACCESSORY_STOPPED", "Accessory stopped UWB ranging") }
      case .applicationData(let data): self.emit("data", ["data": data.base64EncodedString(), "source": raw ? "configuration" : "nus"])
      }
    }
    channel.onFailure = { [weak self, weak channel] code, message, terminal in
      guard let self = self, self.channel === channel, self.active else { return }
      if terminal { self.fail(code, message) } else { self.retry(code, message) }
    }
    channel.start()
  }

  private func setup(_ data: Data, peerId: UUID?) throws {
    guard active, !suspended, let session = session else { throw nearbyError("NO_SESSION", "No active NI session") }
    // Duplicate firmware notifications must not rerun the same session.
    guard configuration == nil else { return }
    let config: NINearbyAccessoryConfiguration
    if #available(iOS 16.0, *), let peerId = peerId {
      config = try NINearbyAccessoryConfiguration(accessoryData: data, bluetoothPeerIdentifier: peerId)
    } else { config = try NINearbyAccessoryConfiguration(data: data) }
    configuration = config
    transition("configuring"); armDeadline()
    session.run(config)
  }
  private func makeSession() {
    destroySession()
    let session = NISession(); session.delegateQueue = .main; session.delegate = self; self.session = session
  }
  private func destroySession() {
    let old = session; session = nil; configuration = nil
    old?.delegate = nil; old?.invalidate()
  }
  private func write(_ data: Data, then: (() -> Void)? = nil) {
    guard let channel = channel, let runId = runId else { return }
    channel.send(data) { [weak self, weak channel] error in
      guard let self = self, self.runId == runId, self.channel === channel, self.active, !self.suspended else { return }
      if let error = error {
        let code = error.userInfo["code"] as? String ?? "BLE_WRITE_FAILED"
        if code == "BLE_PAYLOAD_TOO_LARGE" || code == "BLE_QUEUE_FULL" { self.fail(code, error.localizedDescription) }
        else { self.retry(code, error.localizedDescription) }
      }
      else { then?() }
    }
  }
  private func armDeadline() {
    deadline?.cancel()
    guard let options = options else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.active, !self.suspended else { return }
      self.retry("SESSION_TIMEOUT", "Timed out during \(self.state)")
    }
    deadline = work
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(options.timeoutMs), execute: work)
  }
  private func retry(_ code: String, _ message: String) {
    guard active, !suspended, recovery == nil, let options = options else { return }
    guard retries < options.maxRetries else { fail("RETRY_LIMIT", "\(code): \(message)"); return }
    retries += 1
    deadline?.cancel(); deadline = nil
    destroySession()
    // Clear identity before BLE cleanup rejects queued writes synchronously.
    let old = channel; channel = nil; old?.stop()
    if accessory != nil { emit("disconnected", ["reason": code]); accessory = nil }
    emit("error", ["code": code, "message": message, "recoverable": true])
    transition("reconnecting")
    let work = DispatchWorkItem { [weak self] in
      guard let self = self else { return }; self.recovery = nil; self.begin()
    }
    recovery = work
    DispatchQueue.main.asyncAfter(deadline: .now() + min(pow(2, Double(retries - 1)) * 0.5, 4), execute: work)
  }
  private func fail(_ code: String, _ message: String) {
    active = false; cancelTimers(); destroySession()
    let old = channel; channel = nil; old?.stop()
    if accessory != nil { emit("disconnected", ["reason": code]); accessory = nil }
    emit("error", ["code": code, "message": message, "recoverable": false])
    transition("failed")
  }
  private func cancelTimers() { deadline?.cancel(); deadline = nil; recovery?.cancel(); recovery = nil }
  private func transition(_ newState: String) {
    // External transports use configuring as a negotiation request. Repeating
    // that state while accepting configuration would request another reset.
    guard state != newState else { return }
    state = newState; emit("state", ["state": state])
  }
  private func emit(_ type: String, _ payload: [String: Any]) {
    guard let runId = runId else { return }
    onEvent?(["runId": runId, "type": type, "payload": json(payload)])
  }
  private func json(_ value: [String: Any]) -> String {
    guard let bytes = try? JSONSerialization.data(withJSONObject: value), let string = String(data: bytes, encoding: .utf8) else { return "{}" }
    return string
  }
  private func observeLifecycle() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self = self, self.active else { return }
      self.suspended = true; self.cancelTimers(); self.destroySession()
      let old = self.channel; self.channel = nil; old?.stop()
      if self.accessory != nil { self.emit("disconnected", ["reason": "background"]); self.accessory = nil }
      self.transition("suspended")
    })
    observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self = self, self.active, self.suspended else { return }
      self.suspended = false; self.begin()
    })
  }

  public func session(_ session: NISession, didGenerateShareableConfigurationData data: Data, for object: NINearbyObject) {
    guard active, !suspended, session === self.session, object.discoveryToken == configuration?.accessoryDiscoveryToken else { return }
    if let options = options, options.transport == "ttag" { write(TTagProtocol.start(data, commands: options.profile.commands)) }
    else { emit("configuration", ["data": data.base64EncodedString()]) }
  }
  public func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
    guard active, !suspended, session === self.session,
          let object = nearbyObjects.first(where: { $0.discoveryToken == configuration?.accessoryDiscoveryToken }) else { return }
    // A convergence callback with all values unavailable is not successful ranging.
    if object.distance != nil || object.direction != nil {
      deadline?.cancel(); deadline = nil
      if state != "ranging" { transition("ranging") }
    }
    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastUpdate >= Double(options?.updateIntervalMs ?? 100) / 1000 else { return }
    lastUpdate = now
    var angle: Any = NSNull()
    if #available(iOS 16.0, *), let value = object.horizontalAngle, value.isFinite { angle = value }
    var direction: Any = NSNull()
    if let value = object.direction, value.x.isFinite, value.y.isFinite, value.z.isFinite { direction = ["x": value.x, "y": value.y, "z": value.z] }
    var distance: Any = NSNull()
    if let value = object.distance, value.isFinite, value >= 0 { distance = value }
    emit("measurement", ["distance": distance, "horizontalAngle": angle, "direction": direction, "timestamp": Date().timeIntervalSince1970 * 1000])
  }
  public func session(_ session: NISession, didRemove nearbyObjects: [NINearbyObject], reason: NINearbyObject.RemovalReason) {
    guard session === self.session else { return }
    retry("NI_OBJECT_REMOVED", "Accessory removed: \(reason)")
  }
  public func sessionWasSuspended(_ session: NISession) {
    guard active, session === self.session else { return }
    deadline?.cancel(); deadline = nil
    transition("suspended")
    if let channel = channel, let options = options { channel.send(TTagProtocol.stop(options.profile.commands)) { _ in } }
  }
  public func sessionSuspensionEnded(_ session: NISession) {
    guard active, !suspended, session === self.session else { return }
    retry("NI_RESUMED", "Reinitializing after Nearby Interaction suspension")
  }
  public func session(_ session: NISession, didInvalidateWith error: Error) {
    guard active, session === self.session else { return }
    if let error = error as? NIError, error.code == .userDidNotAllow { fail("NI_PERMISSION_DENIED", "Nearby Interaction permission was denied") }
    else if let error = error as? NIError, error.code == .invalidConfiguration { fail("NI_INVALID_CONFIGURATION", error.localizedDescription) }
    else { retry("NI_INVALIDATED", error.localizedDescription) }
  }
}
