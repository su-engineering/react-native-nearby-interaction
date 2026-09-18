const {withInfoPlist, createRunOncePlugin} = require('@expo/config-plugins');
const pkg = require('../package.json');

function applyInfoPlist(plist, options = {}) {
  const nearby = options.nearbyInteractionUsageDescription;
  const bluetooth = options.bluetoothUsageDescription;
  for (const [key, value] of Object.entries(options)) {
    if (!['nearbyInteractionUsageDescription', 'bluetoothUsageDescription'].includes(key)) throw new TypeError(`Unknown Nearby Interaction plugin option: ${key}`);
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${key} must be nonempty`);
  }
  return {
    ...plist,
    NSNearbyInteractionUsageDescription: nearby ?? plist.NSNearbyInteractionUsageDescription ?? 'Measure your distance and direction to a nearby UWB accessory.',
    NSBluetoothAlwaysUsageDescription: bluetooth ?? plist.NSBluetoothAlwaysUsageDescription ?? 'Connect to nearby UWB accessories using Bluetooth.',
  };
}
function withNearbyInteraction(config, options) {
  return withInfoPlist(config, mod => {mod.modResults = applyInfoPlist(mod.modResults, options); return mod;});
}
module.exports = createRunOncePlugin(withNearbyInteraction, pkg.name, pkg.version);
module.exports.applyInfoPlist = applyInfoPlist;
