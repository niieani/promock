import { override } from "../mockify.js";
import { abc, fn } from "./resolveTest.js";
// import * as resolveTest from "./resolveTest.js";
// const abc = await import("./resolveTest");
// export const abc = 123;
console.log("hi from go", abc, __filename);

export const go = { go: 123 };

override(abc, { a: 456 });
console.log("override from go", abc);

setTimeout(async () => {
  console.log("fn", await fn());
});

// const esm = Loader.registry.get(__filename);
// const x = Loader.getModuleNamespaceObject(esm.module);
// console.log("esm", x);
// console.log("next", resolveTest);
