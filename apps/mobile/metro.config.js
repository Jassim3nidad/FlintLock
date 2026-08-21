const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Monorepo note: apps/mobile depends on packages/core, which lives outside
 * this app's own directory. Metro only watches/resolves within
 * `projectRoot` by default, so both of these are required for the
 * workspace import to resolve at all — dropping either one silently
 * breaks `@flintlock/core` resolution instead of erroring clearly.
 *
 *   - watchFolders: without the monorepo root here, Metro's file watcher
 *     never sees changes under packages/core.
 *   - resolver.nodeModulesPaths: npm workspaces hoists shared deps to the
 *     root node_modules; Metro's default resolver only walks up from
 *     projectRoot, which npm's hoisting usually satisfies anyway, but the
 *     workspace symlink for @flintlock/core itself is resolved through
 *     this list explicitly so it doesn't depend on hoisting behavior.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
