import * as goDep from "./goDep-node.js";
import { something } from "./goDep-node.js";
// console.log(goDep);
// console.log(Object.getOwnPropertyDescriptors(goDep).something);

// // import { something } from "./goDep-node.js";
// let something = goDep.something;
// const goDep = require("./goDep-node.js");
console.log("goDep", goDep.something, something);
goDep.updateSomething();
console.log("goDep", goDep.something, something);
