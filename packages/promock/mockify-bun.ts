/// <reference types="bun-types" />
import { plugin } from "bun";
import type { BunPlugin } from "bun";

const myPlugin: BunPlugin = {
  name: "mockify-bun",
  setup(builder) {
    const { readFileSync } = require("node:fs");
    // const { readFile } = require("node:fs/promises");
    const { extname } = require("node:path");
    const { transformFileSync } =
      require("@swc/core") as typeof import("@swc/core");
    const path = require("node:path");
    builder.onLoad({ filter: /\.[mc]?(js|ts)x?$/ }, (args) => {
      // builder.onLoad({ filter: /\.ts$/ }, (args) => {

      // TODO: use a simple regexp to detect if the file has export let/var
      // we'd break the bindings if we were to do export
      // due to https://github.com/oven-sh/bun/issues/5511
      // in that case we want to fallback to using SWC to transpile that file
      // On the other hand, we can't simply transpile everything,
      // because source maps are currently broken too.
      // alternatively, we could maybe use some tricks to line up
      // the lines of the transform output to the original file?
      const extension = extname(args.path);
      const loader = (() => {
        switch (extension) {
          case ".ts":
          case ".mts":
          case ".cts":
            return "ts";
          case ".mjs":
          case ".cjs":
            return "js";
          case ".js":
          case ".jsx":
            return "jsx";
          case ".tsx":
            return "tsx";
        }
        return undefined;
      })();
      // const contents = readFileSync(args.path, "utf8");
      // const transpiler = new Bun.Transpiler({
      //   loader,
      //   target: "bun",
      //   // allowBunRuntime: true,
      // });
      // console.log("will transform", {
      //   args,
      //   loader,
      //   // transpiled: transpiler.transformSync(contents),
      // });
      // return {
      //   contents: transpiler.transformSync(contents),
      //   loader,
      // };
      try {
        const transformed = transformFileSync(args.path, {
          swcrc: false,
          configFile: false,
          minify: false,
          module: { type: "nodenext" },
          filename: args.path,
          // source maps currently don't work in Bun:
          sourceMaps: "inline",
          // sourceMaps: true,
          inlineSourcesContent: true,
          jsc: {
            parser: {
              ...(/\.[mc]?jsx?$/.test(args.path)
                ? {
                    syntax: "ecmascript",
                    jsx: loader === "jsx",
                    // decorators: true,
                    // decoratorsBeforeExport: true,
                    // exportDefaultFrom: true,
                    // functionBind: true,
                    // importAssertions: true,
                  }
                : {
                    syntax: "typescript",
                    tsx: loader === "tsx",
                    // decorators: true,
                    // dynamicImport: true,
                  }),
            },
            target: "esnext",
            preserveAllComments: true,
            keepClassNames: true,
            experimental: {
              plugins: [
                [
                  // "swc-mockify",
                  path.resolve(
                    __dirname,
                    "../target/wasm32-wasi/release/swc_mockify.wasm",
                  ),
                  {
                    basePath: path.resolve(import.meta.dir, ".."),
                    // importFrom: "swc-mockify/src/mockify.ts",
                    importFrom: path.join(__dirname, "mockify.ts"),
                  },
                ],
              ],
              disableBuiltinTransformsForInternalTesting: true,
            },
          },
        });

        // console.log(transformed.code);
        return {
          contents: transformed.code,
          // TODO: for some reason TS loader doesn't support TypeScript, have to use "TSX"
          loader: "tsx",
        };
      } catch (error) {
        console.error("error transforming", { args, loader, error });
        const contents = readFileSync(args.path, "utf8");
        return {
          contents,
          // loader,
        };
      }
    });
  },
};

plugin(myPlugin);
