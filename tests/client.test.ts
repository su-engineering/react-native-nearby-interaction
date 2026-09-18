import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NearbyInteractionClient} from '../src/client';
import type {NativeBackend} from '../src/types';

class FakeBackend implements NativeBackend {
  runId = '';
  listener: ((event: {runId: string; type: string; payload: string}) => void) | null = null;
  calls: string[] = [];
  async getCapabilities() {return JSON.stringify({supported: true, preciseDistance: true, direction: true, platform: 'ios'});}
  async start(runId: string, _options: string) {this.runId = runId; this.calls.push('start'); this.emit('state', {state: 'scanning'});}
  async stop() {this.calls.push('stop'); this.emit('state', {state: 'ranging'});}
  async configureAccessory() {this.calls.push('configure');}
  async sendData() {this.calls.push('send');}
  onEvent(listener: NonNullable<FakeBackend['listener']>) {this.listener = listener; return {remove: () => {this.listener = null;}};}
  emit(type: string, payload: unknown, runId = this.runId) {this.listener?.({runId, type, payload: JSON.stringify(payload)});}
}
const measurement = {distance: 12.5, horizontalAngle: null, direction: null, timestamp: 1234};

test('unsupported platforms are inspectable and actions fail explicitly', async () => {
  const client = new NearbyInteractionClient(null);
  assert.equal((await client.getCapabilities()).supported, false);
  await assert.rejects(client.start(), {code: 'MODULE_UNAVAILABLE'});
  await client.stop();
});
test('start and stop serialize; stop ignores callbacks produced by cleanup', async () => {
  const backend = new FakeBackend(); const client = new NearbyInteractionClient(backend);
  await Promise.all([client.start(), client.stop()]);
  assert.deepEqual(backend.calls, ['start', 'stop']);
  assert.equal(client.getSnapshot().state, 'idle');
  assert.equal(backend.listener, null);
});
test('measurements are unfiltered; lifecycle transitions clear stale distance', async () => {
  const backend = new FakeBackend(); const client = new NearbyInteractionClient(backend);
  await client.start();
  backend.emit('connected', {id: 'tag', name: 'Demo'});
  backend.emit('state', {state: 'ranging'});
  backend.emit('measurement', measurement);
  assert.equal(client.getSnapshot().measurement?.distance, 12.5);
  assert.ok(Object.isFrozen(client.getSnapshot().measurement));
  backend.emit('state', {state: 'suspended'});
  assert.equal(client.getSnapshot().measurement, null);
  backend.emit('disconnected', {reason: 'background'});
  assert.equal(client.getSnapshot().accessory, null);
  await client.stop();
});
test('late callbacks and malformed measurements cannot populate a new run', async () => {
  const backend = new FakeBackend(); const client = new NearbyInteractionClient(backend);
  await client.start(); const oldRun = backend.runId;
  await client.stop(); await client.start();
  backend.emit('measurement', measurement, oldRun);
  backend.emit('measurement', {...measurement, distance: -1});
  backend.emit('measurement', {...measurement, direction: {x: 1}});
  assert.equal(client.getSnapshot().measurement, null);
  await client.stop();
});
test('reading expires without fresh updates', async () => {
  const backend = new FakeBackend(); const client = new NearbyInteractionClient(backend);
  await client.start({staleAfterMs: 100, updateIntervalMs: 0});
  backend.emit('measurement', measurement);
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal(client.getSnapshot().measurement, null);
  await client.stop();
});
test('event subscriptions remove independently and nullable readings are preserved', async () => {
  const backend = new FakeBackend(); const client = new NearbyInteractionClient(backend);
  let count = 0; const subscription = client.on('measurement', () => {count++;});
  await client.start();
  backend.emit('measurement', {...measurement, distance: null});
  assert.equal(client.getSnapshot().measurement?.distance, null);
  subscription.remove(); backend.emit('measurement', measurement);
  assert.equal(count, 1);
  await client.stop();
});
test('an active or failed run requires stop before replacement', async () => {
  const backend = new FakeBackend(); const client = new NearbyInteractionClient(backend);
  await client.start();
  await assert.rejects(client.start(), {code: 'SESSION_ACTIVE'});
  backend.emit('error', {code: 'NI_PERMISSION_DENIED', message: 'Denied', recoverable: false});
  backend.emit('state', {state: 'failed'});
  await assert.rejects(client.start(), {code: 'SESSION_ACTIVE'});
  assert.equal(client.getSnapshot().error?.code, 'NI_PERMISSION_DENIED');
  await client.stop(); await client.start(); await client.stop();
});
test('a rejected native start detaches listeners and the next run works', async () => {
  const backend = new FakeBackend(); const original = backend.start.bind(backend);
  backend.start = async () => {throw new Error('Missing plist');};
  const client = new NearbyInteractionClient(backend);
  await assert.rejects(client.start(), /Missing plist/);
  assert.equal(backend.listener, null);
  assert.equal(client.getSnapshot().state, 'failed');
  backend.start = original;
  await client.start(); await client.stop();
});
test('configuration and writes are validated and ordered behind start', async () => {
  const backend = new FakeBackend(); const client = new NearbyInteractionClient(backend);
  assert.throws(() => client.configureAccessory('bad'), /base64/);
  assert.throws(() => client.sendData(''), /base64/);
  await assert.rejects(client.sendData('AQ=='), {code: 'NO_SESSION'});
  await Promise.all([client.start({transport: 'external'}), client.configureAccessory('AQ=='), client.sendData('AQ==')]);
  assert.deepEqual(backend.calls, ['start', 'configure', 'send']);
  await client.stop();
});
