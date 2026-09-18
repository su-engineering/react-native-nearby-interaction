import Foundation
import CoreBluetooth

/// One selected peripheral. The controller owns retry policy and run lifetime.
final class BLEChannel: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  var onState: ((String) -> Void)?
  var onReady: ((UUID, String) -> Void)?
  var onData: ((Data, Bool) -> Void)?
  var onFailure: ((String, String, Bool) -> Void)?
  var peripheralId: UUID? { peripheral?.identifier }

  private let options: AccessoryOptions
  private var manager: CBCentralManager?
  private var peripheral: CBPeripheral?
  private var name = "Unknown"
  private var active = false
  private var ready = false
  private var writeCharacteristic: CBCharacteristic?
  private var notifyCharacteristic: CBCharacteristic?
  private var configurationCharacteristic: CBCharacteristic?
  private var discoveries = Set<CBUUID>()
  private var notifications = Set<CBUUID>()
  private var writes: [Write] = []
  private var writeDeadline: DispatchWorkItem?
  private var writing = false

  private struct Write {
    var chunks: [Data]
    var index = 0
    let completion: (NSError?) -> Void
  }
  init(options: AccessoryOptions) { self.options = options; super.init() }
  func start() {
    active = true
    manager = CBCentralManager(delegate: self, queue: .main,
                              options: [CBCentralManagerOptionShowPowerAlertKey: true])
  }
  func stop() {
    active = false; ready = false
    manager?.stopScan()
    if let peripheral = peripheral {
      // Best effort stop; disconnect never waits on a radio acknowledgement.
      if peripheral.state == .connected, let characteristic = writeCharacteristic, !writing {
        peripheral.writeValue(TTagProtocol.stop(options.profile.commands), for: characteristic, type: .withResponse)
      }
      peripheral.delegate = nil
      manager?.cancelPeripheralConnection(peripheral)
    }
    manager?.delegate = nil
    peripheral = nil; manager = nil
    writeCharacteristic = nil; notifyCharacteristic = nil; configurationCharacteristic = nil
    discoveries.removeAll(); notifications.removeAll()
    cancelWrites(nearbyError("SESSION_STOPPED", "BLE session stopped"))
  }

  func send(_ data: Data, completion: @escaping (NSError?) -> Void) {
    guard active, ready, let peripheral = peripheral, peripheral.state == .connected,
          writeCharacteristic != nil else { completion(nearbyError("BLE_NOT_READY", "BLE transport is not ready")); return }
    let mtu = peripheral.maximumWriteValueLength(for: .withResponse)
    guard mtu > 0 else { completion(nearbyError("BLE_INVALID_MTU", "Invalid BLE write size")); return }
    guard data.count <= mtu || options.profile.allowChunkedWrites == true else {
      completion(nearbyError("BLE_PAYLOAD_TOO_LARGE", "Payload exceeds BLE MTU. Enable chunking only if firmware supports reassembly.")); return
    }
    let queued = writes.reduce(0) { total, write in total + write.chunks.dropFirst(write.index).reduce(0) { $0 + $1.count } }
    guard !data.isEmpty, data.count <= 65536, queued + data.count <= 65536 else {
      completion(nearbyError("BLE_QUEUE_FULL", "BLE write queue exceeds 64 KiB")); return
    }
    var chunks: [Data] = []
    var offset = 0
    while offset < data.count {
      let end = min(offset + mtu, data.count)
      chunks.append(Data(data[offset..<end])); offset = end
    }
    writes.append(Write(chunks: chunks, completion: completion))
    pumpWrite()
  }
  private func pumpWrite() {
    guard active, !writing, let peripheral = peripheral, let characteristic = writeCharacteristic,
          let write = writes.first else { return }
    writing = true
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.active, self.writing else { return }
      self.cancelWrites(nearbyError("BLE_WRITE_TIMEOUT", "BLE write acknowledgement timed out"))
      self.onFailure?("BLE_WRITE_TIMEOUT", "BLE write acknowledgement timed out", false)
    }
    writeDeadline = work
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(options.timeoutMs), execute: work)
    peripheral.writeValue(write.chunks[write.index], for: characteristic, type: .withResponse)
  }
  private func cancelWrites(_ error: NSError) {
    writeDeadline?.cancel(); writeDeadline = nil; writing = false
    let old = writes; writes.removeAll()
    for write in old { write.completion(error) }
  }
  private func matches(_ peripheral: CBPeripheral, advertisedName: String?) -> Bool {
    if let id = options.deviceId, peripheral.identifier != UUID(uuidString: id) { return false }
    if let prefix = options.namePrefix, !(advertisedName ?? peripheral.name ?? "").hasPrefix(prefix) { return false }
    return true
  }
  private func discover() {
    guard active, peripheral == nil, let manager = manager, manager.state == .poweredOn else { return }
    let service = CBUUID(string: options.profile.serviceUUID)
    if let existing = manager.retrieveConnectedPeripherals(withServices: [service]).first(where: { matches($0, advertisedName: nil) }) {
      connect(existing, name: existing.name); return
    }
    onState?("scanning")
    manager.scanForPeripherals(withServices: [service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
  }
  private func connect(_ candidate: CBPeripheral, name: String?) {
    guard active, peripheral == nil else { return }
    manager?.stopScan() // Latch selection before initiating the connection.
    peripheral = candidate; self.name = name ?? candidate.name ?? "Unknown"
    onState?("connecting")
    manager?.connect(candidate, options: nil)
  }
  private func checkReady() {
    guard active, !ready, discoveries.isEmpty, notifications.isEmpty,
          let peripheral = peripheral, writeCharacteristic != nil, notifyCharacteristic?.isNotifying == true else { return }
    ready = true
    onReady?(peripheral.identifier, name)
  }
  private func failure(_ code: String, _ message: String, terminal: Bool = false) {
    guard active else { return }
    onFailure?(code, message, terminal)
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard active else { return }
    switch central.state {
    case .poweredOn: discover()
    case .unauthorized: failure("BLE_PERMISSION_DENIED", "Bluetooth permission is denied or restricted", terminal: true)
    case .unsupported: failure("BLE_UNSUPPORTED", "Bluetooth LE is unsupported", terminal: true)
    case .poweredOff, .resetting, .unknown: onState?("waitingForBluetooth")
    @unknown default: onState?("waitingForBluetooth")
    }
  }
  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any], rssi RSSI: NSNumber) {
    guard active, self.peripheral == nil else { return }
    let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    guard matches(peripheral, advertisedName: advertisedName) else { return }
    connect(peripheral, name: advertisedName)
  }
  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    guard active, peripheral === self.peripheral else { return }
    peripheral.delegate = self
    var services = [CBUUID(string: options.profile.serviceUUID)]
    if let uuid = options.profile.configurationServiceUUID { services.append(CBUUID(string: uuid)) }
    peripheral.discoverServices(services)
  }
  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    guard peripheral === self.peripheral else { return }
    failure("BLE_CONNECT_FAILED", error?.localizedDescription ?? "Failed to connect")
  }
  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    guard peripheral === self.peripheral else { return }
    failure("BLE_DISCONNECTED", error?.localizedDescription ?? "Accessory disconnected")
  }
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard active, peripheral === self.peripheral else { return }
    if let error = error { failure("BLE_SERVICE_DISCOVERY", error.localizedDescription); return }
    let serviceUUID = CBUUID(string: options.profile.serviceUUID)
    let configurationServiceUUID = options.profile.configurationServiceUUID.map { CBUUID(string: $0) }
    let services = (peripheral.services ?? []).filter { $0.uuid == serviceUUID || $0.uuid == configurationServiceUUID }
    guard services.contains(where: { $0.uuid == serviceUUID }) else {
      failure("BLE_PROFILE_MISMATCH", "Required BLE service is missing", terminal: true); return
    }
    discoveries = Set(services.map { $0.uuid })
    for service in services {
      var characteristicUUIDs: [CBUUID]
      if service.uuid == serviceUUID {
        characteristicUUIDs = [CBUUID(string: options.profile.writeCharacteristicUUID), CBUUID(string: options.profile.notifyCharacteristicUUID)]
      } else if let uuid = options.profile.configurationCharacteristicUUID { characteristicUUIDs = [CBUUID(string: uuid)] }
      else { discoveries.remove(service.uuid); continue }
      if service.uuid == configurationServiceUUID, let uuid = options.profile.configurationCharacteristicUUID {
        let extra = CBUUID(string: uuid)
        if !characteristicUUIDs.contains(extra) { characteristicUUIDs.append(extra) }
      }
      peripheral.discoverCharacteristics(characteristicUUIDs, for: service)
    }
  }
  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard active, peripheral === self.peripheral else { return }
    if let error = error { failure("BLE_CHARACTERISTIC_DISCOVERY", error.localizedDescription); return }
    let primary = service.uuid == CBUUID(string: options.profile.serviceUUID)
    for characteristic in service.characteristics ?? [] {
      if primary && characteristic.uuid == CBUUID(string: options.profile.writeCharacteristicUUID) {
        guard characteristic.properties.contains(.write) else {
          failure("BLE_PROFILE_MISMATCH", "Write-with-response characteristic is required", terminal: true); return
        }
        writeCharacteristic = characteristic
      }
      let nus = primary && characteristic.uuid == CBUUID(string: options.profile.notifyCharacteristicUUID)
      let raw = service.uuid == options.profile.configurationServiceUUID.map({ CBUUID(string: $0) }) && characteristic.uuid == options.profile.configurationCharacteristicUUID.map({ CBUUID(string: $0) })
      if nus || raw {
        guard characteristic.properties.contains(.notify) || characteristic.properties.contains(.indicate) else {
          failure("BLE_PROFILE_MISMATCH", "Configured notification characteristic cannot notify", terminal: true); return
        }
        if nus { notifyCharacteristic = characteristic } else { configurationCharacteristic = characteristic }
        notifications.insert(characteristic.uuid)
        peripheral.setNotifyValue(true, for: characteristic)
      }
    }
    if primary && (writeCharacteristic == nil || notifyCharacteristic == nil) {
      failure("BLE_PROFILE_MISMATCH", "Required write/notify characteristic is missing", terminal: true); return
    }
    discoveries.remove(service.uuid)
    checkReady()
  }
  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    guard active, peripheral === self.peripheral,
          characteristic === notifyCharacteristic || characteristic === configurationCharacteristic else { return }
    if let error = error { failure("BLE_SUBSCRIBE_FAILED", error.localizedDescription); return }
    guard characteristic.isNotifying else { failure("BLE_NOTIFICATIONS_DISABLED", "Accessory notifications stopped"); return }
    notifications.remove(characteristic.uuid)
    checkReady()
  }
  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard active, ready, peripheral === self.peripheral else { return }
    if let error = error { failure("BLE_READ_FAILED", error.localizedDescription); return }
    guard let data = characteristic.value, !data.isEmpty else { return }
    if characteristic === notifyCharacteristic { onData?(data, false) }
    else if characteristic === configurationCharacteristic { onData?(data, true) }
  }
  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    guard active, peripheral === self.peripheral, characteristic === writeCharacteristic, writing, !writes.isEmpty else { return }
    writeDeadline?.cancel(); writeDeadline = nil; writing = false
    if let error = error {
      cancelWrites(error as NSError); failure("BLE_WRITE_FAILED", error.localizedDescription); return
    }
    writes[0].index += 1
    if writes[0].index == writes[0].chunks.count {
      let done = writes.removeFirst(); done.completion(nil)
    }
    pumpWrite()
  }
  func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService]) {
    guard active, peripheral === self.peripheral else { return }
    failure("BLE_SERVICES_CHANGED", "Accessory GATT services changed; renegotiating")
  }
}
