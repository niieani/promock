import { configure } from "condu";
import { monorepo } from "@condu-preset/monorepo/monorepo.js";

export default configure(
  monorepo({
    gitignore: {
      ignore: [".swc", "packages/swc-plugin-promock/target/"],
    },
    moon: {
      toolchain: {
        rust: {
          version: "nightly",
        },
      },
    },
    vscode: {
      suggestedSettings: {
        "rust-analyzer.linkedProjects": [
          "./packages/swc-plugin-promock/Cargo.toml",
        ],
      },
    },
  }),
);
