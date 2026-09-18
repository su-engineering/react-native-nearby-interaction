export type NearbyState = 'idle' | 'waitingForBluetooth' | 'scanning' | 'connecting' | 'configuring' | 'ranging' | 'suspended' | 'reconnecting' | 'failed';
export interface Capabilities {
  supported: boolean;
  preciseDistance: boolean;
  direction: boolean;
  platform: 'ios' | 'unsupported';
}
export interface Accessory {id: string; name: string}
export interface Measurement {
  distance: number | null;
  /** Radians, as reported by Apple Nearby Interaction. */
  horizontalAngle: number | null;
  direction: {x: number; y: number; z: number} | null;
  timestamp: number;
}
export interface NearbyError {code: string; message: string; recoverable: boolean}
export interface NearbySnapshot {
  state: NearbyState;
  accessory: Accessory | null;
  measurement: Measurement | null;
  error: NearbyError | null;
}
export interface TTagProfile {
  serviceUUID: string;
  writeCharacteristicUUID: string;
  notifyCharacteristicUUID: string;
  /** Optional raw configuration notification, separate from framed NUS data. */
  configurationServiceUUID?: string;
  configurationCharacteristicUUID?: string;
  /** Explicit opt-in: firmware must reassemble a command across BLE writes. */
  allowChunkedWrites?: boolean;
  /** Single-byte framing. Defaults to the Truesense demo firmware commands. */
  commands?: {initialize: number; start: number; stop: number; configuration: number; started: number; stopped: number};
}
export interface StartOptions {
  transport?: 'ttag' | 'external';
  /** CoreBluetooth peripheral UUID; never a MAC address on iOS. */
  deviceId?: string;
  namePrefix?: string;
  profile?: TTagProfile;
  /** Additional reconnect/reinitialization attempts per run (default 3). */
  maxRetries?: number;
  /** Scan/connection/handshake deadline in ms (default 15000). */
  timeoutMs?: number;
  /** Native delivery throttle in ms (default 100). */
  updateIntervalMs?: number;
  /** Clear stale readings if no measurement arrives (default 2000). */
  staleAfterMs?: number;
}
export interface EventMap {
  state: {state: NearbyState};
  connected: Accessory;
  disconnected: {reason: string};
  measurement: Measurement;
  configuration: {data: string};
  data: {data: string; source: 'nus' | 'configuration'};
  error: NearbyError;
}
export type NearbyEvent = {[K in keyof EventMap]: {type: K; payload: EventMap[K]}}[keyof EventMap];
export interface Subscription {remove(): void}
/** Injectable interface for tests; applications normally use the singleton. */
export interface NativeBackend {
  getCapabilities(): Promise<string>;
  start(runId: string, options: string): Promise<void>;
  stop(): Promise<void>;
  configureAccessory(runId: string, configuration: string, bluetoothPeerId: string): Promise<void>;
  sendData(runId: string, data: string): Promise<void>;
  onEvent(listener: (event: {runId: string; type: string; payload: string}) => void): Subscription;
}
