import {test} from 'node:test';
import assert from 'node:assert/strict';
const {applyInfoPlist} = require('../plugin/index.js');
test('Expo plugin preserves existing usage descriptions and background modes', () => {
  const before = {NSNearbyInteractionUsageDescription: 'Our purpose', NSBluetoothAlwaysUsageDescription: 'Our BLE purpose', UIBackgroundModes: ['audio']};
  assert.deepEqual(applyInfoPlist(before), before);
  assert.deepEqual(before.UIBackgroundModes, ['audio']);
});
test('Expo plugin applies explicit copy, rejects empty descriptions and adds no background modes', () => {
  const plist = applyInfoPlist({}, {nearbyInteractionUsageDescription: 'Locate my tag'});
  assert.equal(plist.NSNearbyInteractionUsageDescription, 'Locate my tag');
  assert.equal(plist.UIBackgroundModes, undefined);
  assert.throws(() => applyInfoPlist({}, {bluetoothUsageDescription: ''}), TypeError);
});
