import {Platform} from 'react-native';
import {useSyncExternalStore} from 'react';
import NativeNearbyInteraction from './specs/NativeNearbyInteraction';
import {NearbyInteractionClient} from './client';

export const nearbyInteraction = new NearbyInteractionClient(Platform.OS === 'ios' ? NativeNearbyInteraction : null);
/** Observes the shared session; mounting/unmounting never starts or stops it. */
export function useNearbyInteraction() {
  return useSyncExternalStore(nearbyInteraction.subscribe, nearbyInteraction.getSnapshot, nearbyInteraction.getSnapshot);
}
export {NearbyInteractionError} from './client';
export {TTAG_PROFILE} from './validation';
export type * from './types';
