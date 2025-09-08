import * as goDep from "./goDep-node.js";
// @ts-expect-error
import { something } from "./goDep-node.js";
// console.log(goDep);
// console.log(Object.getOwnPropertyDescriptors(goDep).something);

// // import { something } from "./goDep-node.js";
// let something = goDep.something;
// const goDep = require("./goDep-node.js");
// @ts-expect-error
console.log("goDep", goDep.something, something);
// @ts-expect-error
goDep.updateSomething();
// @ts-expect-error
console.log("goDep", goDep.something, something);
