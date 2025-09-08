// @ts-check
const path = require("path");
const rootDir = path.resolve(__dirname, "..");

module.exports = {
  rootDir,
  moduleNameMapper: {
    promock$: "<rootDir>/packages/promock/mockify.ts",
    // remove .js suffix to resolve the .ts file correctly
    "(.+)\\.js": "$1",
  },
  transform: {
    ".+\\.([tj]sx?)$": [
      "@swc/jest",
      {
        jsc: /** @type {import('@swc/core').Options} */ {
          experimental: {
            plugins: [
              [
                require.resolve(
                  "./packages/promock-swc/target/wasm32-wasi/release/swc_mockify.wasm",
                ),
                { basePath: rootDir },
              ],
            ],
          },
        },
      },
    ],
  },
};
