// Monorepo-aware Metro config.
// Lets Metro watch the workspace root and resolve dependencies hoisted to the
// root node_modules as well as the app-local one. Required for Expo apps that
// live inside a bun/npm/yarn workspace.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// 2. Resolve from both the app-local and the workspace-root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
