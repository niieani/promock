// @ts-expect-error
import goDep from "./goDep-node.js";
// @ts-expect-error
import { something } from "./goDep-node.js";
console.log("goDep", goDep.something, something);
goDep.updateSomething();
console.log("goDep", goDep.something, something);
