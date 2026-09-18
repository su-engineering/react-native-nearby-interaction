import type {TurboModule, CodegenTypes} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

// A versioned JSON payload keeps accessory profiles out of the ABI. Public
// TypeScript types and runtime validation live above this private boundary.
export type NativeEvent = {runId: string; type: string; payload: string};
export interface Spec extends TurboModule {
  getCapabilities(): Promise<string>;
  start(runId: string, options: string): Promise<void>;
  stop(): Promise<void>;
  configureAccessory(runId: string, configuration: string, bluetoothPeerId: string): Promise<void>;
  sendData(runId: string, data: string): Promise<void>;
  readonly onEvent: CodegenTypes.EventEmitter<NativeEvent>;
}
export default TurboModuleRegistry.get<Spec>('NearbyInteraction');
