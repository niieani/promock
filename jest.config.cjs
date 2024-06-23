// @ts-check

module.exports = {
  rootDir: __dirname,
  moduleNameMapper: {
    promock$: "<rootDir>/src/mockify.ts",
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
                  "./target/wasm32-wasi/release/swc_mockify.wasm",
                ),
                { basePath: __dirname },
              ],
            ],
          },
        },
      },
    ],
  },
};
