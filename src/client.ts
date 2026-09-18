import type {Accessory, Capabilities, EventMap, Measurement, NativeBackend, NearbyError, NearbySnapshot, NearbyState, StartOptions, Subscription} from './types';
import {normalizeOptions, validateBase64, validateUUID} from './validation';

export class NearbyInteractionError extends Error {
  constructor(public readonly code: string, message: string) {super(message); this.name = 'NearbyInteractionError';}
}
const states: NearbyState[] = ['idle', 'waitingForBluetooth', 'scanning', 'connecting', 'configuring', 'ranging', 'suspended', 'reconnecting', 'failed'];
const empty = (): NearbySnapshot => ({state: 'idle', accessory: null, measurement: null, error: null});
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || finite(value);
function validPayload(type: string, p: unknown): boolean {
  if (!object(p)) return false;
  switch (type) {
    case 'state': return states.includes(p.state as NearbyState);
    case 'connected': return typeof p.id === 'string' && typeof p.name === 'string';
    case 'disconnected': return typeof p.reason === 'string';
    case 'configuration': return typeof p.data === 'string';
    case 'data': return typeof p.data === 'string' && ['nus', 'configuration'].includes(p.source as string);
    case 'error': return typeof p.code === 'string' && typeof p.message === 'string' && typeof p.recoverable === 'boolean';
    case 'measurement': return nullableNumber(p.distance) && (p.distance === null || (p.distance as number) >= 0) && nullableNumber(p.horizontalAngle) && finite(p.timestamp) && (p.direction === null || (object(p.direction) && finite(p.direction.x) && finite(p.direction.y) && finite(p.direction.z)));
    default: return false;
  }
}

/** One native accessory session. Use the exported singleton in applications. */
export class NearbyInteractionClient {
  private snapshot: NearbySnapshot = Object.freeze(empty());
  private observers = new Set<() => void>();
  private listeners = new Map<keyof EventMap, Set<(payload: never) => void>>();
  private subscription: Subscription | null = null;
  private runId: string | null = null;
  private sequence = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private staleAfterMs = 2000;
  constructor(private readonly backend: NativeBackend | null) {}

  getSnapshot = (): Readonly<NearbySnapshot> => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.observers.add(listener);
    return () => {this.observers.delete(listener);};
  };
  on<K extends keyof EventMap>(type: K, listener: (payload: EventMap[K]) => void): Subscription {
    let set = this.listeners.get(type);
    if (!set) {set = new Set(); this.listeners.set(type, set);}
    const callback = listener as (payload: never) => void;
    set.add(callback);
    return {remove: () => {set.delete(callback);}};
  }
  async getCapabilities(): Promise<Capabilities> {
    if (!this.backend) return {supported: false, preciseDistance: false, direction: false, platform: 'unsupported'};
    const p: unknown = JSON.parse(await this.backend.getCapabilities());
    if (!object(p) || typeof p.supported !== 'boolean' || typeof p.preciseDistance !== 'boolean' || typeof p.direction !== 'boolean' || p.platform !== 'ios') throw new NearbyInteractionError('INVALID_NATIVE_RESPONSE', 'Invalid capabilities response');
    return p as unknown as Capabilities;
  }
  start(options: StartOptions = {}): Promise<void> {
    const normalized = normalizeOptions(options);
    return this.enqueue(async () => {
      const backend = this.requireBackend();
      if (!(await this.getCapabilities()).supported) throw new NearbyInteractionError('UWB_UNSUPPORTED', 'This device does not support accessory UWB ranging');
      if (this.runId !== null) throw new NearbyInteractionError('SESSION_ACTIVE', 'Stop the current session before starting another');
      this.clearStaleTimer();
      this.staleAfterMs = normalized.staleAfterMs;
      this.setSnapshot(empty());
      const runId = `${Date.now()}-${++this.sequence}`;
      this.runId = runId;
      try {
        this.subscription = backend.onEvent(event => this.receive(event));
        await backend.start(runId, JSON.stringify(normalized));
      }
      catch (error) {
        this.detach();
        this.setSnapshot({...empty(), state: 'failed', error: {code: error instanceof NearbyInteractionError ? error.code : 'START_FAILED', message: error instanceof Error ? error.message : String(error), recoverable: false}});
        throw error;
      }
    });
  }
  stop(): Promise<void> {
    return this.enqueue(async () => {
      // Invalidate JS acceptance before native cleanup; queued callbacks cannot
      // repopulate stale state after an explicit stop.
      this.runId = null;
      try {if (this.backend) await this.backend.stop();}
      finally {this.detach(); this.setSnapshot(empty());}
    });
  }
  configureAccessory(configuration: string, bluetoothPeerId = ''): Promise<void> {
    validateBase64(configuration);
    if (bluetoothPeerId) validateUUID(bluetoothPeerId);
    return this.enqueue(() => this.requireBackend().configureAccessory(this.requireRun(), configuration, bluetoothPeerId));
  }
  sendData(data: string): Promise<void> {
    validateBase64(data);
    // Serialize write admission, not radio acknowledgements. A later stop must
    // be able to cancel an in-flight write immediately.
    return this.enqueue(async () => ({pending: this.requireBackend().sendData(this.requireRun(), data)})).then(({pending}) => pending);
  }
  private requireBackend(): NativeBackend {
    if (!this.backend) throw new NearbyInteractionError('MODULE_UNAVAILABLE', 'Nearby Interaction requires iOS and a native build with this library linked');
    return this.backend;
  }
  private requireRun(): string {
    if (!this.runId) throw new NearbyInteractionError('NO_SESSION', 'Start a session first');
    return this.runId;
  }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private receive(event: {runId: string; type: string; payload: string}) {
    if (event.runId !== this.runId) return;
    let p: unknown;
    try {p = JSON.parse(event.payload);} catch {return;}
    if (!validPayload(event.type, p)) return;
    const type = event.type as keyof EventMap;
    switch (type) {
      case 'state': {
        const state = (p as EventMap['state']).state;
        const clear = state !== 'ranging';
        if (clear) this.clearStaleTimer();
        this.setSnapshot({...this.snapshot, state, measurement: clear ? null : this.snapshot.measurement});
        break;
      }
      case 'connected': this.setSnapshot({...this.snapshot, accessory: p as Accessory, error: null}); break;
      case 'disconnected': this.clearStaleTimer(); this.setSnapshot({...this.snapshot, accessory: null, measurement: null}); break;
      case 'measurement': {
        this.clearStaleTimer();
        this.setSnapshot({...this.snapshot, measurement: p as Measurement, error: null});
        this.staleTimer = setTimeout(() => {this.staleTimer = null; this.setSnapshot({...this.snapshot, measurement: null});}, this.staleAfterMs);
        break;
      }
      case 'error': this.setSnapshot({...this.snapshot, error: p as NearbyError}); break;
    }
    for (const callback of this.listeners.get(type) ?? []) this.safely(() => callback(p as never));
  }
  private setSnapshot(snapshot: NearbySnapshot) {
    // Prevent subscribers from mutating shared hook state.
    if (snapshot.accessory) Object.freeze(snapshot.accessory);
    if (snapshot.measurement) {if (snapshot.measurement.direction) Object.freeze(snapshot.measurement.direction); Object.freeze(snapshot.measurement);}
    if (snapshot.error) Object.freeze(snapshot.error);
    this.snapshot = Object.freeze(snapshot);
    for (const observer of this.observers) this.safely(observer);
  }
  private safely(callback: () => void) {try {callback();} catch (error) {console.error('[NearbyInteraction] Subscriber failed', error);}}
  private clearStaleTimer() {if (this.staleTimer) clearTimeout(this.staleTimer); this.staleTimer = null;}
  private detach() {this.runId = null; this.subscription?.remove(); this.subscription = null; this.clearStaleTimer();}
}
