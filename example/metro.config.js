const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const path = require('node:path');
const libraryRoot = path.resolve(__dirname, '..');
const config = {
  watchFolders: [libraryRoot],
  resolver: {
    // Resolve a single copy of React and RN when Metro traverses the file link.
    nodeModulesPaths: [path.join(__dirname, 'node_modules'), path.join(libraryRoot, 'node_modules')],
    resolveRequest(context, moduleName, platform) {
      if (/^(react|react-native)(\/|$)/.test(moduleName)) {
        return context.resolveRequest(context, path.join(__dirname, 'node_modules', moduleName), platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
