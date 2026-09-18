import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NearbyInteractionClient} from '../src/client';
import type {NativeBackend} from '../src/types';

test('stop cancels an outstanding BLE write without waiting for its acknowledgement', async () => {
  let rejectWrite: ((error: Error) => void) | undefined;
  let admitted: (() => void) | undefined;
  const writing = new Promise<void>(resolve => {admitted = resolve;});
  const backend: NativeBackend = {
    getCapabilities: async () => JSON.stringify({supported: true, preciseDistance: true, direction: true, platform: 'ios'}),
    start: async () => {},
    stop: async () => {rejectWrite?.(new Error('SESSION_STOPPED'));},
    configureAccessory: async () => {},
    sendData: () => {admitted?.(); return new Promise((_resolve, reject) => {rejectWrite = reject;});},
    onEvent: () => ({remove: () => {}}),
  };
  const client = new NearbyInteractionClient(backend);
  await client.start();
  const writeResult = assert.rejects(client.sendData('AQ=='), /SESSION_STOPPED/);
  await writing;
  await client.stop();
  await writeResult;
  assert.equal(client.getSnapshot().state, 'idle');
});
