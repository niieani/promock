/// <reference types="bun-types" />
import { plugin } from "bun";
import type { BunPlugin } from "bun";

const myPlugin: BunPlugin = {
  name: "mockify-bun",
  async setup(builder) {
    const { readFileSync } = await import("node:fs");
    // const { readFile } = await import("node:fs/promises");
    const { extname } = await import("node:path");
    const { transformFileSync } = await import("@swc/core");
    // builder.onLoad({ filter: /\.[mc]?(js|ts)x?$/ }, (args) => {
    builder.onLoad({ filter: /\.ts$/ }, (args) => {
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
      })();
      // const contents = readFileSync(args.path, "utf8");
      // const transpiler = new Bun.Transpiler({
      //   loader,
      //   target: "bun",
      //   // allowBunRuntime: true,
      // });
      console.log("will transform", {
        args,
        loader,
        // transpiled: transpiler.transformSync(contents),
      });
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
                  "swc-mockify",
                  {
                    basePath: __dirname,
                    importFrom: "swc-mockify/src/mockify.ts",
                  },
                ],
              ],
              disableBuiltinTransformsForInternalTesting: true,
            },
          },
        });

        // if (args.path.endsWith("core/configTypes.ts")) {
        //   // console.log({ loader });
        //   console.log(transformed.code);
        // }
        return {
          contents: transformed.code,
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
