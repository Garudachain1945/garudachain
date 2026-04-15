const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Resolve .js extensions in subpath imports (needed for @noble/* packages)
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs", "cjs"];
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
