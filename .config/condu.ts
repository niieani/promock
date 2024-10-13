import { configure } from "condu/configure.js";
import { monorepo } from "@condu-preset/monorepo";

export default configure((pkg) => ({
  ...monorepo({
    pkg,
    gitignore: {
      ignore: [
        ".swc",
        "packages/promock-swc/target/",
        "!packages/promock-swc/target/wasm32-wasi/release/promock_swc.wasm",
      ],
    },
    moon: {
      toolchain: {
        rust: {
          version: "nightly",
        },
      },
    },
  }),
}));
