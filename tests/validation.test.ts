import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOptions, TTAG_PROFILE, validateBase64} from '../src/validation';
const {serviceUUID, writeCharacteristicUUID, notifyCharacteristicUUID} = TTAG_PROFILE;
test('custom profiles do not inherit Truesense-only configuration characteristics', () => {
  const options = normalizeOptions({profile: {serviceUUID, writeCharacteristicUUID, notifyCharacteristicUUID}});
  assert.equal(options.profile.configurationServiceUUID, undefined);
  assert.equal(options.profile.commands.initialize, 10);
});
test('profiles accept different command framing and explicit chunking', () => {
  const commands = {initialize: 0x10, start: 0x11, stop: 0x12, configuration: 0x20, started: 0x21, stopped: 0x22};
  const options = normalizeOptions({profile: {serviceUUID, writeCharacteristicUUID, notifyCharacteristicUUID, commands, allowChunkedWrites: true}});
  assert.deepEqual(options.profile.commands, commands);
  assert.equal(options.profile.allowChunkedWrites, true);
});
test('invalid retry counts, intervals, UUIDs and partial configuration profiles reject', () => {
  for (const maxRetries of [-1, 11, 1.5, NaN]) assert.throws(() => normalizeOptions({maxRetries}), RangeError);
  assert.throws(() => normalizeOptions({updateIntervalMs: 2000, staleAfterMs: 1000}), RangeError);
  assert.throws(() => normalizeOptions({deviceId: 'MAC-address'}), TypeError);
  assert.throws(() => normalizeOptions({profile: {serviceUUID, writeCharacteristicUUID, notifyCharacteristicUUID, configurationServiceUUID: serviceUUID}}), TypeError);
});
test('base64 boundary rejects empty, unpadded and oversized data', () => {
  for (const value of ['', 'A', 'AQ', '!Q==', 'AR==', 'A'.repeat(87384), 'A'.repeat(87388)]) assert.throws(() => validateBase64(value), TypeError);
  validateBase64('AQ=='); validateBase64('AQID');
});
