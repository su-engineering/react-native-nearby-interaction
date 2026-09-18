import type {StartOptions, TTagProfile} from './types';

export const TTAG_PROFILE: Readonly<TTagProfile> = Object.freeze({
  serviceUUID: '6E400001-B5A3-F393-E0A9-E50E24DCCA9E',
  writeCharacteristicUUID: '6E400002-B5A3-F393-E0A9-E50E24DCCA9E',
  notifyCharacteristicUUID: '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
  configurationServiceUUID: '6E400022-B5A3-F393-E0A9-E50E24DCCA9E',
  configurationCharacteristicUUID: '6E400023-B5A3-F393-E0A9-E50E24DCCA9E',
  allowChunkedWrites: false,
  commands: Object.freeze({initialize: 0x0a, start: 0x0b, stop: 0x0c, configuration: 0x01, started: 0x02, stopped: 0x03}),
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateUUID(value: string): void {
  if (!uuid.test(value)) throw new TypeError('Expected a 128-bit UUID');
}
export function validateBase64(value: string): void {
  const decodedSize = value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  if (!value || decodedSize > 65536 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/.test(value)) {
    throw new TypeError('Expected nonempty canonical base64 (maximum 64 KiB)');
  }
}
export function normalizeOptions(options: StartOptions = {}) {
  const normalized = {
    ...options,
    transport: options.transport ?? 'ttag',
    maxRetries: options.maxRetries ?? 3,
    timeoutMs: options.timeoutMs ?? 15000,
    updateIntervalMs: options.updateIntervalMs ?? 100,
    staleAfterMs: options.staleAfterMs ?? 2000,
    profile: {...(options.profile ?? TTAG_PROFILE), commands: {...(options.profile?.commands ?? TTAG_PROFILE.commands!)}},
  };
  if (!['ttag', 'external'].includes(normalized.transport)) throw new TypeError('Unknown transport');
  for (const [key, min, max] of [['maxRetries', 0, 10], ['timeoutMs', 1000, 120000], ['updateIntervalMs', 0, 5000], ['staleAfterMs', 100, 30000]] as const) {
    const value = normalized[key];
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${key} must be an integer between ${min} and ${max}`);
  }
  if (normalized.staleAfterMs <= normalized.updateIntervalMs) throw new RangeError('staleAfterMs must exceed updateIntervalMs');
  if (options.deviceId !== undefined) validateUUID(options.deviceId);
  if (options.namePrefix !== undefined && !options.namePrefix.trim()) throw new TypeError('namePrefix must be nonempty');
  for (const key of ['serviceUUID', 'writeCharacteristicUUID', 'notifyCharacteristicUUID', 'configurationServiceUUID', 'configurationCharacteristicUUID'] as const) {
    const value = normalized.profile[key];
    if (value !== undefined) validateUUID(value);
  }
  if ((normalized.profile.configurationServiceUUID === undefined) !== (normalized.profile.configurationCharacteristicUUID === undefined)) throw new TypeError('Configuration service and characteristic must be provided together');
  if (normalized.profile.allowChunkedWrites !== undefined && typeof normalized.profile.allowChunkedWrites !== 'boolean') throw new TypeError('allowChunkedWrites must be boolean');
  for (const value of Object.values(normalized.profile.commands)) {
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError('Command bytes must be integers between 0 and 255');
  }
  if (Object.keys(normalized.profile.commands).sort().join(',') !== 'configuration,initialize,start,started,stop,stopped') throw new TypeError('Provide all six command bytes');
  const {initialize, start, stop, configuration, started, stopped} = normalized.profile.commands;
  if (new Set([initialize, start, stop]).size !== 3 || new Set([configuration, started, stopped]).size !== 3) throw new TypeError('Command bytes must be distinct within each direction');
  return normalized;
}
