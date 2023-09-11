// @ts-check

module.exports = {
  rootDir: __dirname,
  moduleNameMapper: {
    mockify$: "<rootDir>/src/mockify.ts",
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
