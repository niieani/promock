/// <reference types="bun-types" />
import { plugin } from "bun";
import type { BunPlugin, OnLoadArgs, OnResolveArgs } from "bun";

// class CustomRegexp extends RegExp {
//   constructor(public filter: (string: string) => boolean) {
//     super(".*");
//   }
//   test(string: string): boolean {
//     return this.filter(string);
//   }
// }
// const onLoadFilter = new CustomRegexp((path) => {
//   const didLoad = previouslyLoaded.has(path);
//   previouslyLoaded.add(path);
//   console.log("onLoadFilter", didLoad);
//   return !didLoad;
// });

const myPlugin: BunPlugin = {
  name: "mockify-bun",
  async setup(builder) {
    console.log("setup");
    const {
      mockify,
      partialOverride,
      setPropertyDescriptorSource,
    } = require("./mockify.js");
    let counter = 0;
    const set = new Set<string>();
    const previouslyLoaded = new Set<string>();
    const map = new Map<string, string>();
    // builder.onResolve({ filter: /.*/, namespace: "native" }, (args) => {
    //   console.log("native", args);
    //   return {
    //     path: args.path,
    //   };
    // });

    // let isLoading = false;
    // let isResolving = false;

    // builder.onResolve({ filter: /\.ts$/, namespace: "promock" }, (args) => {
    //   console.log("resolving promock", args);
    //   return {
    //     path: `file://${args.path}`,
    //     namespace: "file",
    //   };
    // });

    // builder.onResolve({ filter: /\.ts$/ }, (args) => {
    //   if (isLoading || isResolving || counter++ > 10) {
    //     return null;
    //   }
    //   isResolving = true;
    //   //     // const resolved = Bun.resolveSync(`///${args.path}`, args.importer);
    //   console.log("resolving", args);
    //   const resolved = Loader.resolve(`${args.path}`, args.importer);
    //   // const resolved = await import.meta.resolve(`${args.path}`, args.importer);
    //   console.log("resolved", resolved);
    //   isResolving = false;
    //   return {
    //     path: resolved,
    //     // namespace: "file",
    //     namespace: "promock",
    //   };
    // });
    // // builder.onResolve({ filter: /resolveTest\.ts$/ }, (args) => {
    // //   console.log("resolving resolveTest", args);
    // // });
    // // builder.onResolve(
    // //   {
    // //     filter: /^(?!\/\/\/).*/,
    // //     // filter: /.*/,
    // //     namespace: "file",
    // //     // filter: /resolveTest\.ts$/
    // //   },
    // //   (args) => {
    // //     if (counter++ > 10) {
    // //       return null;
    // //     }
    // //     // const argsString = JSON.stringify(args);
    // //     // if (set.has(argsString)) {
    // //     //   return null;
    // //     // }
    // //     console.log("resolving", args);
    // //     // if (args.path.startsWith("///")) {
    // //     //   return {
    // //     //     path: args.path.slice(3),
    // //     //     namespace: "promock",
    // //     //   };
    // //     // }
    // //     if (args.importer === __dirname) {
    // //       return {
    // //         path: args.path,
    // //         namespace: "promock",
    // //       };
    // //     }
    // //     // set.add(argsString);
    // //     // const resolved = Bun.resolveSync(`///${args.path}`, args.importer);
    // //     const resolved = Loader.resolve(`///${args.path}`, args.importer);
    // //     map.set(args.path, resolved);
    // //     console.log("resolved", resolved);
    // //     return {
    // //       path: resolved,
    // //       namespace: "promock",
    // //     };
    // //   },
    // // );
    let trySyncLoading = true;
    let nesting = 0;

    function mockifyModule(namespace: any) {
      const exports = namespace.__esModule
        ? Reflect.getPrototypeOf(namespace)
        : namespace;

      const mockified = Object.fromEntries(
        Object.entries(exports).map(([key, value]) => [key, mockify(value)]),
      );

      // TODO: there's no need to use mockify() here
      // we could have a completely altenative version for Bun
      // and it allows for fully overriding all imports in the namespace
      // I could mockify the namespace itself?

      // we want two layers of proxies,
      // first layer overrides the namespace with mockified values
      // the second layer allows the user to override the entire namespace
      // e.g. to change all the exported values in runtime
      // const internalProxy = mockify(exports);
      // partialOverride(internalProxy, mockified);
      // if (exports.updateSomething) {
      //   console.log("updateSomething");
      //   // console.log(Object.getOwnPropertyDescriptors(exports));
      //   exports.updateSomething();
      //   // console.log(Object.getOwnPropertyDescriptors(exports));
      // }

      // const output = Object.create(
      //   {},
      //   Object.fromEntries(
      //     Object.entries(Object.getOwnPropertyDescriptors(exports)).map(
      //       ([key, { value, writable, ...descriptor }]) => {
      //         return [
      //           key,
      //           {
      //             ...descriptor,
      //             get() {
      //               console.log("get", key);
      //               return exports[key];
      //             },
      //           },
      //         ];
      //       },
      //     ),
      //   ),
      // );

      const internalProxy = new Proxy(exports, {
        get(target, prop) {
          console.log("get", prop);
          // if (prop === "dupa") return "dupa";
          return mockified[prop as any] ?? target[prop];
        },
        // getOwnPropertyDescriptor(target, p) {
        //   console.log(
        //     "getOwnPropertyDescriptor",
        //     p,
        //     Reflect.getOwnPropertyDescriptor(target, p),
        //   );
        //   return Reflect.getOwnPropertyDescriptor(target, p);
        // },
        // getPrototypeOf(target) {
        //   console.log("getPrototypeOf");
        //   return Reflect.getPrototypeOf(target);
        // },
      });

      // let count = 0;
      // const test =
      //   "variable" in mockified
      //     ? {
      //         something: () => {
      //           count++;
      //         },
      //         get variable() {
      //           console.log("get variable", count, this);
      //           return count++;
      //         },
      //       }
      //     : mockified;

      // setPropertyDescriptorSource(internalProxy, "default");
      // console.log(internalProxy.variable, "vs", namespace.variable);
      // const userLevelProxy = mockify(internalProxy);
      // setPropertyDescriptorSource(userLevelProxy, "default");

      // calls handleOnLoadObjectResult from:
      // https://github.com/oven-sh/bun/blob/31fec8f70461f74b3ff99fe8643e9e31d470423b/src/bun.js/bindings/ModuleLoader.cpp#L106

      // and it calls getters for all the properties
      // instead of correctly binding to the getters
      // https://github.com/oven-sh/bun/blob/f2a8575e4deceb6181220bc653b91174cc059add/src/bun.js/modules/ObjectModule.cpp#L24-L34

      // it should call the getter, like here:
      // https://github.com/oven-sh/bun/blob/f2a8575e4deceb6181220bc653b91174cc059add/src/bun.js/bindings/CommonJSModuleRecord.cpp#L576-L609
      return {
        exports: internalProxy,
        loader: "object",
      } as const;
    }

    const asyncLoad = async (args: OnLoadArgs) => {
      const filename = args.path.split("/").pop();
      console.log("will import()", filename, `nesting ${nesting}`);

      const importPromise = import(`///${args.path}`);
      void importPromise.catch((err) => {
        console.error("import() error", filename);
      });
      const exports = await importPromise;
      console.log("import() success", filename);
      return mockifyModule(exports);
    };

    // const syncLoad = (args: OnLoadArgs) => {
    //   const filename = args.path.split("/").pop();
    //   console.log("will require()", filename, `nesting ${nesting}`);
    //   const esm = Loader.registry.get(`${args.path}`);
    //   console.log("esm", esm);
    //   const exports = Loader.getModuleNamespaceObject(esm.module);
    //   console.log("load", args.path, exports);
    // };

    const syncLoad = (args: OnLoadArgs) => {
      const filename = args.path.split("/").pop();
      console.log("will require()", filename, `nesting ${nesting}`);
      const exports = import.meta.require(`///${args.path}`);
      console.log("sync require success", filename);

      console.log(
        "loaded",
        args.path,
        // esm,
        // Loader.registry,
        // Module.exports(exports),
        // ns,
        // ns === (exports.__esModule ? Reflect.getPrototypeOf(exports) : exports),
      );

      return mockifyModule(exports);
    };

    const resetState = () => {
      nesting--;
      if (nesting === 0) trySyncLoading = true;
    };

    const load = (args: OnLoadArgs) => {
      if (!trySyncLoading) {
        return asyncLoad(args);
      }
      try {
        return syncLoad(args);
      } catch (e) {
        // TODO: validate that the error relates to async loading
        const filename = args.path.split("/").pop();
        console.log("sync require error", filename);

        Loader.registry.delete(`///${args.path}`);

        if (trySyncLoading) {
          trySyncLoading = false;
          if (nesting > 1) {
            throw e;
          }
        }
        return asyncLoad(args);
      }
    };

    // TODO: for windows, we need to support $X:\path\path\...
    // we should be able to similarly add slashes after the drive letter and colon
    builder.onLoad(
      {
        filter: /^(?!\/\/\/).*\.ts$/,
        // filter: /.*\.ts$/,
        // namespace: "promock",
      },
      (args) => {
        try {
          nesting++;
          const retVal = load(args);
          if (retVal instanceof Promise) {
            retVal.then(resetState, resetState);
          } else {
            resetState();
          }
          return retVal;
        } catch (e) {
          resetState();
          throw e;
        }
      },
    );
  },
};

plugin(myPlugin);
